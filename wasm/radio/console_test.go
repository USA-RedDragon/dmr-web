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
	"strings"
	"testing"
	"time"

	"github.com/USA-RedDragon/dmr-web/wasm/radio"
	"github.com/USA-RedDragon/dmrgo/v2/data"
	"github.com/USA-RedDragon/dmrgo/v2/enums"
	"github.com/USA-RedDragon/dmrgo/v2/layer2/pdu"
	"github.com/stretchr/testify/require"
)

func (s *sink) all(k radio.EventKind) []radio.Event {
	var out []radio.Event
	for _, e := range s.events {
		if e.Kind == k {
			out = append(out, e)
		}
	}
	return out
}

func TestSendDataChecksArguments(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	require.ErrorIs(t, h.r.SendData(h.now, 1, 2, false, remoteID, true, enums.SAPProprietaryPacketData, enums.DataTypeRate12, nil), radio.ErrData)
	require.ErrorIs(t, h.r.SendData(h.now, 1, 2, false, remoteID, true, enums.SAPProprietaryPacketData, enums.DataTypeRate12, make([]byte, radio.MaxData+1)), radio.ErrData)
	require.ErrorIs(t, h.r.SendData(h.now, 1, 2, true, 91, true, enums.SAPProprietaryPacketData, enums.DataTypeRate12, []byte{1}), radio.ErrConfirmedGroup)
	require.ErrorIs(t, h.r.SendData(h.now, 1, 2, false, remoteID, true, enums.SAPProprietaryPacketData, enums.DataTypeVoiceLCHeader, []byte{1}), radio.ErrRate)
	require.ErrorIs(t, h.r.SendData(h.now, 1, 3, false, remoteID, true, enums.SAPProprietaryPacketData, enums.DataTypeRate12, []byte{1}), radio.ErrSlot)
}

func TestSendConfirmedData(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	s := newStation(t, h, true)
	payload := []byte("Hello")
	require.NoError(t, h.r.SendData(h.now, 21, 2, false, remoteID, true, enums.SAPProprietaryPacketData, enums.DataTypeRate12, payload))
	s.run(3 * time.Second)

	tx := h.s.all(radio.EventData)
	require.NotEmpty(t, tx)
	require.Equal(t, "tx", tx[0].Reason)
	require.Equal(t, uint32(21), tx[0].ID)
	require.Equal(t, uint32(remoteID), tx[0].Target)
	require.Equal(t, "Confirmed", tx[0].Format)
	require.Equal(t, "48 65 6C 6C 6F", tx[0].Text)
	var delivered bool
	for _, e := range h.s.statuses() {
		if e.ID == 21 && e.Reason == "delivered" {
			delivered = true
		}
	}
	require.True(t, delivered)
}

func TestReceivedDataIsReported(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	s := newStation(t, h, true)
	var hdr pdu.DataHeader
	require.NoError(t, hdr.SetUnconfirmed(pdu.UnconfirmedDataHeader{SAP: enums.SAPProprietaryPacketData, LLIDDestination: radioID, LLIDSource: remoteID, FullMessageFlag: true}))
	require.NoError(t, s.tx.Send(h.now, &data.Message{Header: hdr, Rate: enums.DataTypeRate12, Payload: []byte{0xde, 0xad, 0xbe, 0xef}}))
	s.run(2 * time.Second)

	var rx *radio.Event
	for _, e := range h.s.all(radio.EventData) {
		if e.Reason == "rx" {
			rx = &e
		}
	}
	require.NotNil(t, rx)
	require.Equal(t, uint32(remoteID), rx.Source)
	require.Equal(t, "Unconfirmed", rx.Format)
	require.Equal(t, "DE AD BE EF", rx.Text)
}

func TestDescribeIP(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	newStation(t, h, true)
	require.NoError(t, h.r.RequestLocation(h.now, 5, 2, remoteID))
	tx := h.s.all(radio.EventData)
	require.NotEmpty(t, tx)
	require.Equal(t, "IP, UDP 4001", tx[0].Format)
	require.True(t, strings.HasPrefix(tx[0].Text, "12."), tx[0].Text)
	require.Contains(t, tx[0].Text, ":4001")
}

func TestDescribeCutsLongPayloads(t *testing.T) {
	t.Parallel()
	var hdr pdu.DataHeader
	require.NoError(t, hdr.SetConfirmed(pdu.ConfirmedDataHeader{SAP: enums.SAPProprietaryPacketData, LLIDDestination: 1, LLIDSource: 2, FullMessageFlag: true}))
	kind, text := radio.Describe(&hdr, make([]byte, 100))
	require.Equal(t, "Confirmed", kind)
	require.True(t, strings.HasSuffix(text, "\u2026"))
	require.Equal(t, 48, strings.Count(text, "00"))
}
