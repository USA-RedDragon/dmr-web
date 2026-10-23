// SPDX-License-Identifier: AGPL-3.0-or-later
// dmr-web - A DMR radio in the browser
// Copyright (C) 2026 Jacob McSwain
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// The source code is available at <https://github.com/USA-RedDragon/dmr-web>

package radio

import (
	"errors"
	"fmt"
	"time"
	"unicode/utf8"

	"github.com/USA-RedDragon/dmrgo/v2/csbk"
	"github.com/USA-RedDragon/dmrgo/v2/data"
	"github.com/USA-RedDragon/dmrgo/v2/enums"
	"github.com/USA-RedDragon/dmrgo/v2/ip"
	"github.com/USA-RedDragon/dmrgo/v2/layer2"
	"github.com/USA-RedDragon/dmrgo/v2/layer3"
	"github.com/USA-RedDragon/dmrgo/v2/mototrbo/tms"
	"github.com/USA-RedDragon/dmrgo/v2/shortdata"
	"github.com/USA-RedDragon/dmrgo/v2/sms"
	"github.com/USA-RedDragon/dmrgo/v2/transport/dmrd"
)

const (
	networkWait = 2 * time.Second
	networkLost = 500 * time.Millisecond
	tmsSeqMask  = 0x7f
	maxQueue    = 32
)

// Check is a CSBK service that CheckRadio asks for.
type Check uint8

// The Check values.
const (
	CheckRadio Check = iota + 1
	CheckCallAlert
	CheckPresence
)

type queuedText struct {
	id    uint32
	group bool
	msg   data.Message
}

type outStream struct {
	id    uint32
	seq   uint8
	group bool
	dst   uint32
	src   uint32
	valid bool
}

type check struct {
	id     uint32
	start  time.Duration
	active bool
}

type dataSlot struct {
	slot    enums.Slot
	rx      *data.Receiver
	tx      *data.Sender
	req     *csbk.Requester
	resp    *csbk.Responder
	events  []data.Event
	outs    []data.Output
	couts   []csbk.Output
	queue   []queuedText
	sending queuedText
	busy    bool
	check   check
	stream  outStream
}

func newDataSlot(cfg *Config, slot enums.Slot) (dataSlot, error) {
	rx, err := data.NewReceiver(&data.ReceiverConfig{
		Address:       cfg.RadioID,
		Respond:       true,
		Source:        layer2.SyncSourceMS,
		ResponseDelay: -1,
		Lost:          networkLost,
	})
	if err != nil {
		return dataSlot{}, fmt.Errorf("radio: data receiver: %w", err)
	}
	tx, err := data.NewSender(&data.SenderConfig{
		ColorCode:    colorCode,
		Source:       layer2.SyncSourceMS,
		ResponseWait: networkWait,
		Slot:         slot,
	})
	if err != nil {
		return dataSlot{}, fmt.Errorf("radio: data sender: %w", err)
	}
	req, err := csbk.NewRequester(&csbk.RequesterConfig{
		ColorCode: colorCode,
		Source:    layer2.SyncSourceMS,
		Slot:      slot,
		AckWait:   networkWait,
	})
	if err != nil {
		return dataSlot{}, fmt.Errorf("radio: CSBK requester: %w", err)
	}
	resp, err := csbk.NewResponder(&csbk.ResponderConfig{
		Address:   cfg.RadioID,
		ColorCode: colorCode,
		Source:    layer2.SyncSourceMS,
		Slot:      slot,
	})
	if err != nil {
		return dataSlot{}, fmt.Errorf("radio: CSBK responder: %w", err)
	}
	return dataSlot{
		slot:   slot,
		rx:     rx,
		tx:     tx,
		req:    req,
		resp:   resp,
		events: make([]data.Event, 0, data.MaxEvents),
		outs:   make([]data.Output, 0, data.MaxOutputs),
		couts:  make([]csbk.Output, 0, csbk.MaxOutputs),
	}, nil
}

func (s *dataSlot) deadline(consider func(time.Duration, bool)) {
	consider(s.rx.Deadline())
	consider(s.tx.Deadline())
	consider(s.req.Deadline())
	consider(s.resp.Deadline())
}

func (s *dataSlot) reset() {
	s.rx.Reset()
	s.tx.Reset()
	s.req.Reset()
	s.resp.Reset()
	s.queue = s.queue[:0]
	s.sending = queuedText{}
	s.check = check{}
	s.stream = outStream{}
}

// SendText queues the text body to target, a talkgroup when group is set,
// on slot 1 or 2, in format. Its EventTextStatus events carry id.
func (r *Radio) SendText(now time.Duration, id uint32, slot int, group bool, target uint32, format sms.Format, body string) error {
	i, err := r.dataTarget(slot, target)
	if err != nil {
		return err
	}
	if body == "" || !utf8.ValidString(body) {
		return ErrText
	}
	t := sms.Text{
		Format:      format,
		Source:      r.cfg.RadioID,
		Destination: target,
		Group:       group,
		Confirmed:   !group,
		Body:        []byte(body),
	}
	switch format {
	case sms.FormatTMS:
		t.Sequence = r.tmsSeq & tmsSeqMask
		r.tmsSeq++
		t.AckRequired = !group
	case sms.FormatDefinedData:
		t.DD = enums.DDISO8859Part1
	case sms.FormatIP, sms.FormatAnyTone, sms.FormatHytera:
	default:
		return ErrFormat
	}
	var h sms.Header
	payload, err := sms.AppendPacket(nil, &t, &h)
	if errors.Is(err, shortdata.ErrCharacter) && format == sms.FormatDefinedData {
		t.DD = enums.DDUTF16LE
		payload, err = sms.AppendPacket(nil, &t, &h)
	}
	if err != nil {
		return fmt.Errorf("radio: text: %w", err)
	}
	s := &r.dslots[i]
	if len(s.queue) >= maxQueue {
		return ErrBusy
	}
	if format == sms.FormatTMS && t.AckRequired {
		r.tmsWait[t.Sequence] = id
	}
	s.queue = append(s.queue, queuedText{id: id, group: group, msg: data.Message{Header: h.Data, Rate: enums.DataTypeRate12, Payload: payload}})
	r.nextText(now, i)
	return nil
}

// CheckRadio starts a radio check, call alert or presence check of the
// radio target on slot 1 or 2. Its EventCheck carries id.
func (r *Radio) CheckRadio(now time.Duration, id uint32, slot int, c Check, target uint32) error {
	i, err := r.dataTarget(slot, target)
	if err != nil {
		return err
	}
	s := &r.dslots[i]
	if s.check.active {
		return ErrChecking
	}
	src := r.cfg.RadioID
	switch c {
	case CheckRadio:
		err = s.req.RequestRadioCheck(now, target, src, nil)
	case CheckCallAlert:
		err = s.req.RequestCallAlert(now, target, src, nil)
	case CheckPresence:
		err = s.req.RequestOACSU(now, target, src, layer3.ServiceOptions{}, nil)
	default:
		return ErrFormat
	}
	if errors.Is(err, csbk.ErrBusy) {
		return ErrChecking
	}
	if err != nil {
		return fmt.Errorf("radio: check: %w", err)
	}
	s.check = check{id: id, start: now, active: true}
	return nil
}

func (r *Radio) dataTarget(slot int, target uint32) (int, error) {
	switch {
	case !r.up:
		return 0, ErrNotConnected
	case slot != 1 && slot != 2:
		return 0, ErrSlot
	case target == 0 || target > maxTarget:
		return 0, ErrTarget
	}
	return slot - 1, nil
}

func (r *Radio) nextText(now time.Duration, i int) {
	s := &r.dslots[i]
	if s.sending.id != 0 || len(s.queue) == 0 || s.tx.State() != data.SenderIdle {
		return
	}
	q := s.queue[0]
	s.queue = append(s.queue[:0], s.queue[1:]...)
	if err := s.tx.Send(now, &q.msg); err != nil {
		r.textStatus(i, q.id, err.Error())
		r.nextText(now, i)
		return
	}
	s.sending = q
	if q.id == 0 {
		s.sending.id = ^uint32(0)
	}
	r.stream(i, q.group, q.msg)
}

func (r *Radio) stream(i int, group bool, m data.Message) {
	dst, src, ok := m.Header.Addresses()
	if !ok {
		dst, src = 0, r.cfg.RadioID
	}
	r.dslots[i].stream = outStream{id: r.streamID(), group: group, dst: dst, src: src, valid: true}
}

func (r *Radio) textStatus(i int, id uint32, status string) {
	if id == 0 || id == ^uint32(0) {
		return
	}
	r.sink.Event(&Event{Kind: EventTextStatus, Slot: i + 1, ID: id, Reason: status})
}

func (r *Radio) dataIn(now time.Duration, i int, d *dmrd.Data, h layer2.Hint) {
	s := &r.dslots[i]
	s.events = s.rx.Burst(now, &d.Burst, h, s.events[:0])
	r.dataEvents(now, i)
	s.outs = s.tx.Burst(now, &d.Burst, h, s.outs[:0])
	r.dataOutputs(now, i)
	s.couts = s.req.Burst(now, &d.Burst, h, s.couts[:0])
	r.csbkOutputs(now, i)
	s.couts = s.resp.Burst(now, &d.Burst, h, s.couts[:0])
	r.csbkOutputs(now, i)
}

func (r *Radio) dataTick(now time.Duration, i int) {
	s := &r.dslots[i]
	s.events = s.rx.Tick(now, s.events[:0])
	r.dataEvents(now, i)
	for {
		s.outs = s.tx.Tick(now, s.outs[:0])
		if len(s.outs) == 0 {
			break
		}
		r.dataOutputs(now, i)
	}
	r.csbkTick(now, i)
}

func (r *Radio) csbkTick(now time.Duration, i int) {
	s := &r.dslots[i]
	for {
		s.couts = s.req.Tick(now, s.couts[:0])
		n := len(s.couts)
		r.csbkOutputs(now, i)
		s.couts = s.resp.Tick(now, s.couts[:0])
		n += len(s.couts)
		r.csbkOutputs(now, i)
		if n == 0 {
			return
		}
	}
}

func (r *Radio) channel(now time.Duration, i int) {
	s := &r.dslots[i]
	busy := r.rx[i].active || (r.tx.active && r.tx.slot == s.slot)
	if busy == s.busy {
		return
	}
	s.busy = busy
	s.tx.Channel(now, busy)
	s.req.Channel(now, busy)
	s.resp.Channel(now, busy)
}

func (r *Radio) dataEvents(now time.Duration, i int) {
	s := &r.dslots[i]
	for k := range s.events {
		e := &s.events[k]
		switch e.Kind {
		case data.EventRespond:
			h := layer2.Hint{Kind: layer2.KindData, DataType: e.Burst.SlotType().DataType, HasDataType: true, Slot: s.slot}
			r.sendBurst(i, &outStream{id: r.streamID(), dst: e.Call.Source, src: r.cfg.RadioID, valid: true}, &e.Burst, h)
		case data.EventDelivered:
			r.delivered(now, i, e)
		default:
		}
	}
}

func (r *Radio) delivered(now time.Duration, i int, e *data.Event) {
	buf, t, err := sms.Decode(r.text[:0], &e.Message.Header, e.Message.Payload)
	r.text = buf
	switch {
	case err == nil || errors.Is(err, ip.ErrChecksum):
	case errors.Is(err, sms.ErrNotText):
		r.tmsAck(e)
		return
	default:
		return
	}
	r.sink.Event(&Event{
		Kind:   EventText,
		Slot:   i + 1,
		Group:  t.Group,
		Target: t.Destination,
		Source: t.Source,
		Text:   string(t.Body),
		Format: t.Format.String(),
	})
	if !t.AckRequired || t.Group {
		return
	}
	var h sms.Header
	ack, err := sms.AppendAck(nil, &t, &h)
	if err != nil {
		return
	}
	s := &r.dslots[i]
	if len(s.queue) < maxQueue {
		s.queue = append(s.queue, queuedText{msg: data.Message{Header: h.Data, Rate: enums.DataTypeRate12, Payload: ack}})
		r.nextText(now, i)
	}
}

func (r *Radio) tmsAck(e *data.Event) {
	sap, ok := e.Message.Header.SAP()
	if !ok {
		return
	}
	d, err := ip.Decode(sap, e.Message.Payload)
	if (err != nil && !errors.Is(err, ip.ErrChecksum)) || d.DestinationPort != ip.PortTMS {
		return
	}
	m, err := tms.DecodeMessage(d.Payload)
	if err != nil || m.Header.Type != tms.TypeAck {
		return
	}
	seq, ok := m.Sequence()
	if !ok {
		return
	}
	if id, ok := r.tmsWait[seq]; ok {
		delete(r.tmsWait, seq)
		r.sink.Event(&Event{Kind: EventTextStatus, ID: id, Reason: "delivered"})
	}
}

func (r *Radio) dataOutputs(now time.Duration, i int) {
	s := &r.dslots[i]
	for k := range s.outs {
		o := &s.outs[k]
		switch o.Kind {
		case data.OutputBurst:
			if s.stream.valid {
				r.sendBurst(i, &s.stream, &o.Burst, o.Hint)
			}
		case data.OutputDone:
			id := s.sending.id
			s.sending = queuedText{}
			s.stream = outStream{}
			switch o.Result {
			case data.ResultSent:
				r.textStatus(i, id, "sent")
			case data.ResultDelivered:
				r.textStatus(i, id, "delivered")
			case data.ResultRefused:
				r.textStatus(i, id, "refused")
			case data.ResultRetryLimit, data.ResultTimeLimit:
				r.textStatus(i, id, "noAnswer")
			default:
				r.textStatus(i, id, "cancelled")
			}
			r.nextText(now, i)
		default:
		}
	}
}

func (r *Radio) csbkOutputs(now time.Duration, i int) {
	s := &r.dslots[i]
	for k := range s.couts {
		o := &s.couts[k]
		switch o.Kind {
		case csbk.OutputBurst:
			st := outStream{id: r.streamID(), group: o.Group, dst: o.Target, src: o.Source, valid: true}
			r.sendBurst(i, &st, &o.Burst, o.Hint)
		case csbk.OutputDone:
			if !s.check.active {
				continue
			}
			c := s.check
			s.check = check{}
			r.sink.Event(&Event{Kind: EventCheck, Slot: i + 1, ID: c.id, Target: o.Target, Reason: checkReason(o.Result), Elapsed: now - c.start})
		case csbk.OutputRequest:
			kind := EventRequest
			if o.Service == csbk.ServiceCallAlert {
				kind = EventCallAlert
			}
			r.sink.Event(&Event{Kind: kind, Slot: i + 1, Source: o.Source, Target: o.Target, Text: o.Service.String()})
		default:
		}
	}
}

func checkReason(res csbk.Result) string {
	switch res {
	case csbk.ResultAnswered:
		return "answered"
	case csbk.ResultRefused, csbk.ResultDenied:
		return "refused"
	case csbk.ResultNACK:
		return "notSupported"
	case csbk.ResultNoAnswer:
		return "noAnswer"
	default:
		return "cancelled"
	}
}

func (r *Radio) sendBurst(i int, st *outStream, b *layer2.RawBurst, h layer2.Hint) {
	if !r.up {
		return
	}
	d := dmrd.Data{
		Seq:      st.seq,
		Repeater: r.cfg.Hotspot,
		Slot:     r.dslots[i].slot,
		Stream:   st.id,
		Burst:    *b,
	}
	st.seq++
	if err := d.SetCall(st.group, st.dst, st.src); err != nil {
		r.sink.Event(&Event{Kind: EventError, Slot: i + 1, Err: fmt.Errorf("radio: call: %w", err)})
		return
	}
	if err := d.SetHint(h); err != nil {
		r.sink.Event(&Event{Kind: EventError, Slot: i + 1, Err: fmt.Errorf("radio: hint: %w", err)})
		return
	}
	out, err := d.AppendBinary(r.buf[:0])
	if err != nil {
		r.sink.Event(&Event{Kind: EventError, Slot: i + 1, Err: fmt.Errorf("radio: DMRD: %w", err)})
		return
	}
	r.buf = out
	r.sink.Send(out)
}
