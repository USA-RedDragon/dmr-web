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
	"encoding/binary"
	"errors"
	"testing"
	"time"

	"github.com/USA-RedDragon/dmr-web/wasm/radio"
	"github.com/USA-RedDragon/dmrgo/v2/data"
	"github.com/USA-RedDragon/dmrgo/v2/enums"
	"github.com/USA-RedDragon/dmrgo/v2/ip"
	"github.com/USA-RedDragon/dmrgo/v2/layer2/pdu"
	"github.com/USA-RedDragon/dmrgo/v2/mototrbo/lrrp"
	"github.com/stretchr/testify/require"
)

func lrrpFromStation(t *testing.T, m *lrrp.Message) data.Message {
	source, target := uint32(remoteID), uint32(radioID)
	t.Helper()
	body, err := m.AppendBinary(nil)
	require.NoError(t, err)
	d := ip.Datagram{
		Source:          ip.RadioAddress(ip.DefaultNetwork, source),
		Destination:     ip.RadioAddress(ip.DefaultNetwork, target),
		SourcePort:      ip.PortLRRP,
		DestinationPort: ip.PortLRRP,
		TTL:             64,
		Payload:         body,
	}
	packet, err := ip.AppendIPv4(nil, &d)
	require.NoError(t, err)
	var h pdu.DataHeader
	require.NoError(t, h.SetConfirmed(pdu.ConfirmedDataHeader{SAP: enums.SAPIPBasedPacketData, LLIDDestination: target, LLIDSource: source, FullMessageFlag: true}))
	return data.Message{Header: h, Rate: enums.DataTypeRate12, Payload: packet}
}

func (s *station) lrrpIn(evs []data.Event) {
	for k := range evs {
		e := &evs[k]
		if e.Kind != data.EventDelivered {
			continue
		}
		sap, _ := e.Message.Header.SAP()
		d, err := ip.Decode(sap, e.Message.Payload)
		if (err != nil && !errors.Is(err, ip.ErrChecksum)) || d.DestinationPort != ip.PortLRRP {
			continue
		}
		var m lrrp.Message
		require.NoError(s.t, lrrp.DecodeMessageInto(&m, d.Payload))
		m.Request.RequestID = append([]byte(nil), m.Request.RequestID...)
		m.Report.RequestID = append([]byte(nil), m.Report.RequestID...)
		s.lrrp = append(s.lrrp, m)
	}
}

func TestRequestLocation(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	s := newStation(t, h, true)
	require.NoError(t, h.r.RequestLocation(h.now, 0x2468ace0, 2, remoteID))
	s.run(3 * time.Second)

	require.Len(t, s.lrrp, 1)
	req := s.lrrp[0]
	require.Equal(t, lrrp.DocumentImmediateRequest, req.Document)
	require.Equal(t, uint32(0x2468ace0), binary.BigEndian.Uint32(req.Request.RequestID))

	rep := &lrrp.Message{Document: lrrp.DocumentImmediateReport}
	rep.Report.RequestID, rep.Report.HasRequestID = req.Request.RequestID, true
	rep.Report.Circle2D, rep.Report.HasCircle2D = lrrp.Circle2D{Latitude: 41.8853, Longitude: -87.6213, Radius: 10}, true
	rep.Report.Speed, rep.Report.HasSpeed = 9.5, true
	m := lrrpFromStation(t, rep)
	require.NoError(t, s.tx.Send(h.now, &m))
	s.run(3 * time.Second)

	got, ok := h.s.first(radio.EventFix)
	require.True(t, ok)
	require.Equal(t, uint32(0x2468ace0), got.ID)
	require.Equal(t, uint32(remoteID), got.Source)
	require.Equal(t, "LRRP", got.Format)
	require.InDelta(t, 41.8853, got.Fix.Latitude, 1e-6)
	require.InDelta(t, -87.6213, got.Fix.Longitude, 1e-6)
	require.True(t, got.Fix.HasRadius)
	require.InDelta(t, 9.5, got.Fix.Speed, 1e-3)
	require.Empty(t, got.Reason)
}

func TestAnswersLocationWhenSharing(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	h.r.SetLocation(radio.Here{Valid: true, Latitude: 30.2672, Longitude: -97.7431, Radius: 12, At: time.Date(2026, 10, 23, 15, 4, 5, 0, time.UTC)}, true)
	s := newStation(t, h, true)
	req := &lrrp.Message{Document: lrrp.DocumentImmediateRequest}
	req.Request.RequestID, req.Request.HasRequestID = []byte{1, 2, 3, 4}, true
	m := lrrpFromStation(t, req)
	require.NoError(t, s.tx.Send(h.now, &m))
	s.run(4 * time.Second)

	require.Len(t, s.lrrp, 1)
	rep := s.lrrp[0]
	require.Equal(t, lrrp.DocumentImmediateReport, rep.Document)
	require.Equal(t, []byte{1, 2, 3, 4}, rep.Report.RequestID)
	require.True(t, rep.Report.HasCircle2D)
	require.InDelta(t, 30.2672, rep.Report.Circle2D.Latitude, 1e-6)
	require.InDelta(t, -97.7431, rep.Report.Circle2D.Longitude, 1e-6)
	require.Equal(t, uint8(15), rep.Report.Time.Hour)
	ev, ok := h.s.first(radio.EventLocationRequest)
	require.True(t, ok)
	require.Equal(t, "answered", ev.Reason)
	require.Equal(t, uint32(remoteID), ev.Source)
}

func TestRefusesLocationWhenNotSharing(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	h.r.SetLocation(radio.Here{Valid: true, Latitude: 30.2672, Longitude: -97.7431}, false)
	s := newStation(t, h, true)
	req := &lrrp.Message{Document: lrrp.DocumentImmediateRequest}
	req.Request.RequestID, req.Request.HasRequestID = []byte{9}, true
	m := lrrpFromStation(t, req)
	require.NoError(t, s.tx.Send(h.now, &m))
	s.run(4 * time.Second)

	require.Len(t, s.lrrp, 1)
	rep := s.lrrp[0].Report
	require.False(t, rep.HasCircle2D)
	require.True(t, rep.HasResult)
	require.Equal(t, lrrp.ResultNoGPS, rep.Result)
	ev, ok := h.s.first(radio.EventLocationRequest)
	require.True(t, ok)
	require.Equal(t, "notShared", ev.Reason)
}

func TestPeriodicReports(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	h.r.SetLocation(radio.Here{Valid: true, Latitude: 1, Longitude: 2}, true)
	s := newStation(t, h, true)
	req := &lrrp.Message{Document: lrrp.DocumentTriggeredRequest}
	req.Request.RequestID, req.Request.HasRequestID = []byte{7}, true
	req.Request.Periodic = true
	req.Request.Interval, req.Request.HasInterval = 5, true
	m := lrrpFromStation(t, req)
	require.NoError(t, s.tx.Send(h.now, &m))
	s.run(radio.MinInterval + 5*time.Second)

	var answers, reports int
	for _, x := range s.lrrp {
		switch x.Document {
		case lrrp.DocumentTriggeredAnswer:
			answers++
		case lrrp.DocumentTriggeredReport:
			reports++
		default:
		}
	}
	require.Equal(t, 1, answers)
	require.Equal(t, 2, reports, "one report at once and one MinInterval later, not every 5 s")

	stop := &lrrp.Message{Document: lrrp.DocumentStopRequest}
	stop.Request.RequestID, stop.Request.HasRequestID = []byte{7}, true
	m = lrrpFromStation(t, stop)
	require.NoError(t, s.tx.Send(h.now, &m))
	s.run(radio.MinInterval + 5*time.Second)
	after := 0
	for _, x := range s.lrrp {
		if x.Document == lrrp.DocumentTriggeredReport {
			after++
		}
	}
	require.Equal(t, reports, after)
}
