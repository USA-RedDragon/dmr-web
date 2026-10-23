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

package radio_test

import (
	"errors"
	"testing"
	"time"

	"github.com/USA-RedDragon/dmr-web/wasm/radio"
	"github.com/USA-RedDragon/dmrgo/v2/csbk"
	"github.com/USA-RedDragon/dmrgo/v2/data"
	"github.com/USA-RedDragon/dmrgo/v2/enums"
	"github.com/USA-RedDragon/dmrgo/v2/ip"
	"github.com/USA-RedDragon/dmrgo/v2/layer2"
	"github.com/USA-RedDragon/dmrgo/v2/mototrbo/tms"
	"github.com/USA-RedDragon/dmrgo/v2/sms"
	"github.com/USA-RedDragon/dmrgo/v2/transport/dmrd"
	"github.com/stretchr/testify/require"
)

const remoteID = 3100002

type station struct {
	t      *testing.T
	h      *hub
	rx     *data.Receiver
	tx     *data.Sender
	req    *csbk.Requester
	resp   *csbk.Responder
	texts  []sms.Text
	acks   int
	sent   []data.Result
	checks []csbk.Output
	alerts []csbk.Output
	seq    uint8
}

func newStation(t *testing.T, h *hub, answer bool) *station {
	t.Helper()
	rx, err := data.NewReceiver(&data.ReceiverConfig{Address: remoteID, Respond: answer, Source: layer2.SyncSourceMS, ResponseDelay: -1})
	require.NoError(t, err)
	tx, err := data.NewSender(&data.SenderConfig{ColorCode: 1, Source: layer2.SyncSourceMS, Slot: enums.Slot2, ResponseWait: 2 * time.Second})
	require.NoError(t, err)
	req, err := csbk.NewRequester(&csbk.RequesterConfig{ColorCode: 1, Source: layer2.SyncSourceMS, Slot: enums.Slot2})
	require.NoError(t, err)
	resp, err := csbk.NewResponder(&csbk.ResponderConfig{Address: remoteID, ColorCode: 1, Source: layer2.SyncSourceMS, Slot: enums.Slot2, NoRadioCheck: !answer, NoCallAlert: !answer})
	require.NoError(t, err)
	return &station{t: t, h: h, rx: rx, tx: tx, req: req, resp: resp}
}

func (s *station) toRadio(group bool, target, source uint32, b *layer2.RawBurst, hint layer2.Hint) {
	d := dmrd.Data{Seq: s.seq, Repeater: 1, Slot: enums.Slot2, Stream: 0x5151, Burst: *b}
	s.seq++
	require.NoError(s.t, d.SetCall(group, target, source))
	require.NoError(s.t, d.SetHint(hint))
	p, err := d.AppendBinary(nil)
	require.NoError(s.t, err)
	s.h.r.Packet(s.h.now, p)
}

func (s *station) events(evs []data.Event) {
	for k := range evs {
		e := &evs[k]
		switch e.Kind {
		case data.EventRespond:
			hint := layer2.Hint{Kind: layer2.KindData, DataType: e.Burst.SlotType().DataType, HasDataType: true, Slot: enums.Slot2}
			s.toRadio(false, e.Call.Source, remoteID, &e.Burst, hint)
		case data.EventDelivered:
			_, t, err := sms.Decode(nil, &e.Message.Header, e.Message.Payload)
			switch {
			case err == nil || errors.Is(err, ip.ErrChecksum):
				t.Body = append([]byte(nil), t.Body...)
				s.texts = append(s.texts, t)
			case errors.Is(err, sms.ErrNotText):
				sap, _ := e.Message.Header.SAP()
				d, err := ip.Decode(sap, e.Message.Payload)
				if err == nil && d.DestinationPort == ip.PortTMS {
					if m, err := tms.DecodeMessage(d.Payload); err == nil && m.Header.Type == tms.TypeAck {
						s.acks++
					}
				}
			default:
			}
		default:
		}
	}
}

func (s *station) outputs(outs []data.Output, group bool, target uint32) {
	for k := range outs {
		o := &outs[k]
		switch o.Kind {
		case data.OutputBurst:
			s.toRadio(group, target, remoteID, &o.Burst, o.Hint)
		case data.OutputDone:
			s.sent = append(s.sent, o.Result)
		default:
		}
	}
}

func (s *station) csbk(outs []csbk.Output) {
	for k := range outs {
		o := &outs[k]
		switch o.Kind {
		case csbk.OutputBurst:
			s.toRadio(o.Group, o.Target, o.Source, &o.Burst, o.Hint)
		case csbk.OutputDone:
			s.checks = append(s.checks, *o)
		case csbk.OutputRequest:
			s.alerts = append(s.alerts, *o)
		default:
		}
	}
}

func (s *station) run(d time.Duration) {
	h := s.h
	end := h.now + d
	for h.now <= end {
		h.r.Tick(h.now)
		h.pump()
		in := h.data
		h.data = nil
		for k := range in {
			b := &in[k]
			hint := b.Hint(h.now)
			s.events(s.rx.Burst(h.now, &b.Burst, hint, nil))
			s.outputs(s.tx.Burst(h.now, &b.Burst, hint, nil), false, radioID)
			s.csbk(s.req.Burst(h.now, &b.Burst, hint, nil))
			s.csbk(s.resp.Burst(h.now, &b.Burst, hint, nil))
		}
		s.events(s.rx.Tick(h.now, nil))
		for {
			outs := s.tx.Tick(h.now, nil)
			if len(outs) == 0 {
				break
			}
			s.outputs(outs, false, radioID)
		}
		s.csbk(s.req.Tick(h.now, nil))
		s.csbk(s.resp.Tick(h.now, nil))
		h.pump()
		h.now += step
	}
}

func (s *sink) statuses() []radio.Event {
	var out []radio.Event
	for _, e := range s.events {
		if e.Kind == radio.EventTextStatus {
			out = append(out, e)
		}
	}
	return out
}

func TestSendTextNeedsLogin(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	require.ErrorIs(t, h.r.SendText(0, 1, 2, false, remoteID, sms.FormatTMS, "hi"), radio.ErrNotConnected)
}

func TestSendTextChecksArguments(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	require.ErrorIs(t, h.r.SendText(h.now, 1, 3, false, remoteID, sms.FormatTMS, "hi"), radio.ErrSlot)
	require.ErrorIs(t, h.r.SendText(h.now, 1, 2, false, 0, sms.FormatTMS, "hi"), radio.ErrTarget)
	require.ErrorIs(t, h.r.SendText(h.now, 1, 2, false, remoteID, sms.FormatTMS, ""), radio.ErrText)
	require.ErrorIs(t, h.r.SendText(h.now, 1, 2, false, remoteID, sms.FormatTMS, "\xff"), radio.ErrText)
	require.ErrorIs(t, h.r.SendText(h.now, 1, 2, false, remoteID, sms.Format(99), "hi"), radio.ErrFormat)
}

func TestSendPrivateText(t *testing.T) {
	t.Parallel()
	for _, f := range []sms.Format{sms.FormatTMS, sms.FormatIP, sms.FormatAnyTone, sms.FormatDefinedData, sms.FormatHytera} {
		t.Run(f.String(), func(t *testing.T) {
			t.Parallel()
			h := newHub(t, false)
			h.login()
			s := newStation(t, h, true)
			require.NoError(t, h.r.SendText(h.now, 7, 2, false, remoteID, f, "Hello ünïcode"))
			s.run(5 * time.Second)

			require.Len(t, s.texts, 1)
			require.Equal(t, f, s.texts[0].Format)
			require.Equal(t, "Hello ünïcode", string(s.texts[0].Body))
			require.Equal(t, uint32(radioID), s.texts[0].Source)
			require.Equal(t, uint32(remoteID), s.texts[0].Destination)
			st := h.s.statuses()
			require.NotEmpty(t, st)
			require.Equal(t, uint32(7), st[0].ID)
			require.Equal(t, "delivered", st[0].Reason)
		})
	}
}

func TestSendGroupText(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	s := newStation(t, h, true)
	require.NoError(t, h.r.SendText(h.now, 8, 2, true, 91, sms.FormatTMS, "CQ"))
	s.run(3 * time.Second)

	require.Len(t, s.texts, 1)
	require.True(t, s.texts[0].Group)
	require.Equal(t, uint32(91), s.texts[0].Destination)
	st := h.s.statuses()
	require.Len(t, st, 1)
	require.Equal(t, "sent", st[0].Reason)
}

func TestSendTextQueues(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	s := newStation(t, h, true)
	require.NoError(t, h.r.SendText(h.now, 1, 2, false, remoteID, sms.FormatIP, "one"))
	require.NoError(t, h.r.SendText(h.now, 2, 2, false, remoteID, sms.FormatIP, "two"))
	s.run(8 * time.Second)

	require.Len(t, s.texts, 2)
	require.Equal(t, "one", string(s.texts[0].Body))
	require.Equal(t, "two", string(s.texts[1].Body))
	st := h.s.statuses()
	require.Len(t, st, 2)
	require.Equal(t, uint32(1), st[0].ID)
	require.Equal(t, uint32(2), st[1].ID)
}

func TestSendTextNoAnswer(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	s := newStation(t, h, false)
	require.NoError(t, h.r.SendText(h.now, 9, 2, false, remoteID, sms.FormatIP, "anyone?"))
	s.run(60 * time.Second)

	st := h.s.statuses()
	require.Len(t, st, 1)
	require.Equal(t, "noAnswer", st[0].Reason)
}

func TestReceiveText(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	s := newStation(t, h, true)
	in := sms.Text{Format: sms.FormatTMS, Source: remoteID, Destination: radioID, Confirmed: true, Sequence: 5, AckRequired: true, Body: []byte("Copy that")}
	var hdr sms.Header
	p, err := sms.AppendPacket(nil, &in, &hdr)
	require.NoError(t, err)
	require.NoError(t, s.tx.Send(h.now, &data.Message{Header: hdr.Data, Rate: enums.DataTypeRate12, Payload: p}))
	s.run(6 * time.Second)

	got, ok := h.s.first(radio.EventText)
	require.True(t, ok)
	require.Equal(t, 2, got.Slot)
	require.Equal(t, uint32(remoteID), got.Source)
	require.Equal(t, uint32(radioID), got.Target)
	require.Equal(t, "Copy that", got.Text)
	require.Equal(t, sms.FormatTMS.String(), got.Format)
	require.Equal(t, []data.Result{data.ResultDelivered}, s.sent)
	require.Equal(t, 1, s.acks)
}

func TestTMSAckDelivers(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	s := newStation(t, h, false)
	require.NoError(t, h.r.SendText(h.now, 11, 2, false, remoteID, sms.FormatTMS, "ack me"))
	s.run(200 * time.Millisecond)

	ack := sms.Text{Format: sms.FormatTMS, Source: radioID, Destination: remoteID, Sequence: 0}
	var hdr sms.Header
	p, err := sms.AppendAck(nil, &ack, &hdr)
	require.NoError(t, err)
	require.NoError(t, s.tx.Send(h.now, &data.Message{Header: hdr.Data, Rate: enums.DataTypeRate12, Payload: p}))
	s.run(time.Second)

	var delivered bool
	for _, e := range h.s.statuses() {
		if e.ID == 11 && e.Reason == "delivered" {
			delivered = true
		}
	}
	require.True(t, delivered)
}

func TestRadioCheck(t *testing.T) {
	t.Parallel()
	for _, c := range []radio.Check{radio.CheckRadio, radio.CheckCallAlert, radio.CheckPresence} {
		h := newHub(t, false)
		h.login()
		s := newStation(t, h, true)
		require.NoError(t, h.r.CheckRadio(h.now, 21, 2, c, remoteID))
		require.ErrorIs(t, h.r.CheckRadio(h.now, 22, 2, c, remoteID), radio.ErrChecking)
		s.run(3 * time.Second)

		e, ok := h.s.first(radio.EventCheck)
		require.True(t, ok, "check %d", c)
		require.Equal(t, uint32(21), e.ID)
		require.Equal(t, "answered", e.Reason)
		require.Positive(t, e.Elapsed)
	}
}

func TestRadioCheckNoAnswer(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	s := newStation(t, h, false)
	require.NoError(t, h.r.CheckRadio(h.now, 31, 2, radio.CheckRadio, 3100099))
	s.run(10 * time.Second)

	e, ok := h.s.first(radio.EventCheck)
	require.True(t, ok)
	require.Equal(t, "noAnswer", e.Reason)
}

func TestIncomingCallAlert(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	s := newStation(t, h, true)
	require.NoError(t, s.req.RequestCallAlert(h.now, radioID, remoteID, nil))
	s.run(3 * time.Second)

	e, ok := h.s.first(radio.EventCallAlert)
	require.True(t, ok)
	require.Equal(t, uint32(remoteID), e.Source)
	require.Equal(t, 2, e.Slot)
	require.Len(t, s.checks, 1)
	require.Equal(t, csbk.ResultAnswered, s.checks[0].Result)
}
