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
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/USA-RedDragon/dmrgo/v2/data"
	"github.com/USA-RedDragon/dmrgo/v2/enums"
	"github.com/USA-RedDragon/dmrgo/v2/ip"
	"github.com/USA-RedDragon/dmrgo/v2/layer2/pdu"
	"github.com/USA-RedDragon/dmrgo/v2/location"
	"github.com/USA-RedDragon/dmrgo/v2/mototrbo/lrrp"
)

// Here is the position of this radio, as the browser knows it.
type Here struct {
	Valid               bool
	Latitude, Longitude float64
	Radius              float64
	Speed               float64
	HasSpeed            bool
	Course              float64
	HasCourse           bool
	At                  time.Time
}

// MinInterval is the shortest period this radio reports its position at,
// whatever a triggered request asks for.
const MinInterval = 30 * time.Second

const maxTriggers = 8

type trigger struct {
	target    uint32
	slot      int
	requestID []byte
	interval  time.Duration
	next      time.Duration
}

// SetLocation sets the position that this radio reports, and whether it
// answers location requests at all.
func (r *Radio) SetLocation(here Here, share bool) {
	r.here = here
	r.share = share
	if !share {
		r.triggers = r.triggers[:0]
	}
}

// RequestLocation queues an LRRP request for one position of target on
// slot. Its EventTextStatus events carry id, and the answer comes as an
// EventFix with the same ID.
func (r *Radio) RequestLocation(now time.Duration, id uint32, slot int, target uint32) error {
	i, err := r.dataTarget(slot, target)
	if err != nil {
		return err
	}
	m := &lrrp.Message{Document: lrrp.DocumentImmediateRequest}
	var rid [4]byte
	binary.BigEndian.PutUint32(rid[:], id)
	m.Request.RequestID, m.Request.HasRequestID = rid[:], true
	m.Request.AccuracyAndTime = true
	m.Request.Speed = true
	m.Request.Direction = true
	buf, err := m.AppendBinary(nil)
	if err != nil {
		return fmt.Errorf("radio: LRRP: %w", err)
	}
	return r.queueLRRP(now, i, id, target, buf, true)
}

func (r *Radio) queueLRRP(now time.Duration, i int, id uint32, target uint32, payload []byte, confirmed bool) error {
	d := ip.Datagram{
		Source:          ip.RadioAddress(ip.DefaultNetwork, r.cfg.RadioID),
		Destination:     ip.RadioAddress(ip.DefaultNetwork, target),
		SourcePort:      ip.PortLRRP,
		DestinationPort: ip.PortLRRP,
		TTL:             64,
		Payload:         payload,
	}
	packet, err := ip.AppendIPv4(nil, &d)
	if err != nil {
		return fmt.Errorf("radio: LRRP: %w", err)
	}
	var h pdu.DataHeader
	if confirmed {
		err = h.SetConfirmed(pdu.ConfirmedDataHeader{
			SAP:             enums.SAPIPBasedPacketData,
			LLIDDestination: target,
			LLIDSource:      r.cfg.RadioID,
			FullMessageFlag: true,
		})
	} else {
		err = h.SetUnconfirmed(pdu.UnconfirmedDataHeader{
			SAP:             enums.SAPIPBasedPacketData,
			LLIDDestination: target,
			LLIDSource:      r.cfg.RadioID,
			FullMessageFlag: true,
		})
	}
	if err != nil {
		return fmt.Errorf("radio: LRRP: %w", err)
	}
	s := &r.dslots[i]
	if len(s.queue) >= maxQueue {
		return ErrBusy
	}
	s.queue = append(s.queue, queuedText{id: id, msg: data.Message{Header: h, Rate: enums.DataTypeRate12, Payload: packet}})
	r.nextText(now, i)
	return nil
}

// located handles a data message that is not a text: a position, or a
// location request to this radio. It reports whether it was one.
func (r *Radio) located(now time.Duration, i int, e *data.Event) bool {
	f, err := r.loc.Decode(&e.Message.Header, e.Message.Payload)
	switch {
	case err == nil, errors.Is(err, ip.ErrChecksum), errors.Is(err, location.ErrNoPosition):
		r.fix(i, &f, err)
		return true
	case errors.Is(err, location.ErrNoFix):
		return r.locationRequest(now, i, e)
	}
	return false
}

func (r *Radio) fix(i int, f *location.Fix, err error) {
	ev := Event{Kind: EventFix, Slot: i + 1, Source: f.Source, Target: f.Destination, Format: f.Format.String(), Fix: *f}
	if f.RequestIDLength == 4 {
		ev.ID = binary.BigEndian.Uint32(f.RequestID[:4])
	}
	if errors.Is(err, location.ErrNoPosition) {
		ev.Reason = "noPosition"
	}
	r.sink.Event(&ev)
}

func (r *Radio) locationRequest(now time.Duration, i int, e *data.Event) bool {
	sap, ok := e.Message.Header.SAP()
	if !ok {
		return false
	}
	d, err := ip.Decode(sap, e.Message.Payload)
	if (err != nil && !errors.Is(err, ip.ErrChecksum)) || d.DestinationPort != ip.PortLRRP {
		return false
	}
	if err := lrrp.DecodeMessageInto(&r.lrrpIn, d.Payload); err != nil {
		return false
	}
	_, source, _ := e.Message.Header.Addresses()
	req := &r.lrrpIn.Request
	rid := append([]byte(nil), req.RequestID...)
	reason := "answered"
	switch r.lrrpIn.Document {
	case lrrp.DocumentImmediateRequest:
		r.answer(now, i, source, lrrp.DocumentImmediateReport, rid)
	case lrrp.DocumentTriggeredRequest:
		r.answerTriggered(now, i, source, rid, req)
	case lrrp.DocumentStopRequest:
		r.stopTrigger(source, rid)
		r.answerResult(now, i, source, lrrp.DocumentStopAnswer, rid, lrrp.ResultSuccess)
		reason = "stopped"
	default:
		return true
	}
	if !r.share {
		reason = "notShared"
	}
	r.sink.Event(&Event{Kind: EventLocationRequest, Slot: i + 1, Source: source, Reason: reason})
	return true
}

func (r *Radio) answerTriggered(now time.Duration, i int, source uint32, rid []byte, req *lrrp.Request) {
	if !r.share {
		r.answerResult(now, i, source, lrrp.DocumentTriggeredAnswer, rid, lrrp.ResultNoGPS)
		return
	}
	r.answerResult(now, i, source, lrrp.DocumentTriggeredAnswer, rid, lrrp.ResultSuccess)
	if !req.Periodic || !req.HasInterval {
		r.answer(now, i, source, lrrp.DocumentTriggeredReport, rid)
		return
	}
	interval := max(time.Duration(req.Interval)*time.Second, MinInterval)
	r.stopTrigger(source, rid)
	if len(r.triggers) >= maxTriggers {
		r.triggers = r.triggers[1:]
	}
	r.triggers = append(r.triggers, trigger{target: source, slot: i + 1, requestID: rid, interval: interval, next: now})
}

func (r *Radio) stopTrigger(source uint32, rid []byte) {
	kept := r.triggers[:0]
	for _, t := range r.triggers {
		if t.target != source || string(t.requestID) != string(rid) {
			kept = append(kept, t)
		}
	}
	r.triggers = kept
}

func (r *Radio) answer(now time.Duration, i int, target uint32, doc lrrp.DocumentID, rid []byte) {
	if !r.share || !r.here.Valid {
		r.answerResult(now, i, target, doc, rid, lrrp.ResultNoGPS)
		return
	}
	m := &lrrp.Message{Document: doc}
	rep := &m.Report
	rep.RequestID, rep.HasRequestID = rid, len(rid) > 0
	t := r.here.At.UTC()
	rep.Time = lrrp.Time{Year: u16(t.Year()), Month: u8(int(t.Month())), Day: u8(t.Day()), Hour: u8(t.Hour()), Minute: u8(t.Minute()), Second: u8(t.Second())}
	rep.HasTime = !r.here.At.IsZero()
	rep.Circle2D = lrrp.Circle2D{Latitude: r.here.Latitude, Longitude: r.here.Longitude, Radius: r.here.Radius}
	rep.HasCircle2D = true
	rep.Speed, rep.HasSpeed = r.here.Speed, r.here.HasSpeed
	if r.here.HasCourse {
		rep.Direction, rep.HasDirection = u8(int(r.here.Course+1)/2%180), true
	}
	buf, err := m.AppendBinary(nil)
	if err != nil {
		return
	}
	_ = r.queueLRRP(now, i, 0, target, buf, false)
}

func (r *Radio) answerResult(now time.Duration, i int, target uint32, doc lrrp.DocumentID, rid []byte, res lrrp.ResultCode) {
	m := &lrrp.Message{Document: doc}
	rep := &m.Report
	rep.RequestID, rep.HasRequestID = rid, len(rid) > 0
	rep.Result, rep.HasResult = res, true
	buf, err := m.AppendBinary(nil)
	if err != nil {
		return
	}
	_ = r.queueLRRP(now, i, 0, target, buf, false)
}

func (r *Radio) triggerDeadline(consider func(time.Duration, bool)) {
	for _, t := range r.triggers {
		consider(t.next, true)
	}
}

func (r *Radio) triggerTick(now time.Duration) {
	if !r.up {
		return
	}
	for k := range r.triggers {
		t := &r.triggers[k]
		if t.next > now {
			continue
		}
		t.next = now + t.interval
		r.answer(now, t.slot-1, t.target, lrrp.DocumentTriggeredReport, t.requestID)
	}
}

func u8(v int) uint8 {
	if v < 0 || v > math.MaxUint8 {
		return 0
	}
	return uint8(v)
}

func u16(v int) uint16 {
	if v < 0 || v > math.MaxUint16 {
		return 0
	}
	return uint16(v)
}
