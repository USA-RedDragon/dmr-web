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
	"encoding/hex"
	"errors"
	"fmt"
	"net/netip"
	"strings"
	"time"

	"github.com/USA-RedDragon/dmrgo/v2/data"
	"github.com/USA-RedDragon/dmrgo/v2/enums"
	"github.com/USA-RedDragon/dmrgo/v2/ip"
	"github.com/USA-RedDragon/dmrgo/v2/layer2/pdu"
)

// MaxData is the longest payload SendData takes, in octets.
const MaxData = 1500

const shownOctets = 48

// SendData queues payload to target, a talkgroup when group is set, on slot
// 1 or 2, with service access point sap at rate. A group message is always
// unconfirmed. Its EventTextStatus events carry id.
func (r *Radio) SendData(now time.Duration, id uint32, slot int, group bool, target uint32, confirmed bool, sap enums.SAP, rate enums.DataType, payload []byte) error {
	i, err := r.dataTarget(slot, target)
	if err != nil {
		return err
	}
	switch {
	case len(payload) == 0 || len(payload) > MaxData:
		return ErrData
	case group && confirmed:
		return ErrConfirmedGroup
	case rate != enums.DataTypeRate12 && rate != enums.DataTypeRate34 && rate != enums.DataTypeRate1:
		return ErrRate
	}
	var h pdu.DataHeader
	if confirmed {
		err = h.SetConfirmed(pdu.ConfirmedDataHeader{SAP: sap, LLIDDestination: target, LLIDSource: r.cfg.RadioID, FullMessageFlag: true, Group: group})
	} else {
		err = h.SetUnconfirmed(pdu.UnconfirmedDataHeader{SAP: sap, LLIDDestination: target, LLIDSource: r.cfg.RadioID, FullMessageFlag: true, Group: group})
	}
	if err != nil {
		return fmt.Errorf("radio: data: %w", err)
	}
	s := &r.dslots[i]
	if len(s.queue) >= maxQueue {
		return ErrBusy
	}
	s.queue = append(s.queue, queuedText{id: id, group: group, msg: data.Message{Header: h, Rate: rate, Payload: append([]byte(nil), payload...)}})
	r.nextText(now, i)
	return nil
}

// traffic reports a data message that went out or came in, for the data
// console. A message the radio sends on its own carries ID 0.
func (r *Radio) traffic(i int, id uint32, out bool, m *data.Message) {
	target, source, ok := m.Header.Addresses()
	if !ok {
		return
	}
	if id == arsID || id == ^uint32(0) {
		id = 0
	}
	kind, text := Describe(&m.Header, m.Payload)
	dir := "rx"
	if out {
		dir = "tx"
	}
	r.sink.Event(&Event{Kind: EventData, Slot: i + 1, ID: id, Source: source, Target: target, Group: groupOf(&m.Header), Format: kind, Text: text, Reason: dir})
}

func groupOf(h *pdu.DataHeader) bool {
	if p, ok := h.AsUnconfirmed(); ok {
		return p.Group
	}
	if p, ok := h.AsConfirmed(); ok {
		return p.Group
	}
	if p, ok := h.AsDefinedData(); ok {
		return p.Group
	}
	return false
}

// Describe names the kind of a data message and sums up its payload: the
// addresses, ports and size of an IP datagram, or the octets of any other.
func Describe(h *pdu.DataHeader, payload []byte) (kind, text string) {
	sap, _ := h.SAP()
	d, err := ip.Decode(sap, payload)
	if err == nil || errors.Is(err, ip.ErrChecksum) {
		kind = fmt.Sprintf("IP, UDP %d", uint16(d.DestinationPort))
		text = fmt.Sprintf("%s:%d \u2192 %s:%d  %s, %d octets", netip.AddrFrom4(d.Source), uint16(d.SourcePort), netip.AddrFrom4(d.Destination), uint16(d.DestinationPort), d.DestinationPort, len(d.Payload))
		return kind, text
	}
	kind = "Unconfirmed"
	if _, ok := h.AsConfirmed(); ok {
		kind = "Confirmed"
	}
	return kind, octets(payload)
}

func octets(b []byte) string {
	more := len(b) > shownOctets
	if more {
		b = b[:shownOctets]
	}
	s := strings.ToUpper(hex.EncodeToString(b))
	var sb strings.Builder
	for k := 0; k < len(s); k += 2 {
		if k > 0 {
			sb.WriteByte(' ')
		}
		sb.WriteString(s[k : k+2])
	}
	if more {
		sb.WriteString(" \u2026")
	}
	return sb.String()
}
