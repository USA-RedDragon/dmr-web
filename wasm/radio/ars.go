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
	"fmt"
	"time"

	"github.com/USA-RedDragon/dmrgo/v2/data"
	"github.com/USA-RedDragon/dmrgo/v2/enums"
	"github.com/USA-RedDragon/dmrgo/v2/ip"
	"github.com/USA-RedDragon/dmrgo/v2/layer2/pdu"
	"github.com/USA-RedDragon/dmrgo/v2/mototrbo/ars"
)

// ARSServer is the radio ID that the radio sends its ARS registration
// to: 5057, one of the location service IDs 5050 to 5059 that
// BrandMeister uses as its radios' ARS and location server.
const ARSServer = 5057

const (
	arsSlot = 2
	arsID   = ^uint32(0) - 1
)

// Register queues a MOTOTRBO ARS registration on slot 2, which tells the
// hub and MOTOTRBO systems that the radio is on. Its EventRegistered
// reports how it went.
func (r *Radio) Register(now time.Duration) error {
	i, err := r.dataTarget(arsSlot, ARSServer)
	if err != nil {
		return err
	}
	m := ars.NewRegistration(ars.EventInitial)
	buf, err := m.SetDeviceID(nil, r.cfg.RadioID)
	if err != nil {
		return fmt.Errorf("radio: ARS: %w", err)
	}
	n := len(buf)
	if buf, err = m.AppendBinary(buf); err != nil {
		return fmt.Errorf("radio: ARS: %w", err)
	}
	d := ip.Datagram{
		Source:          ip.RadioAddress(ip.DefaultNetwork, r.cfg.RadioID),
		Destination:     ip.RadioAddress(ip.DefaultNetwork, ARSServer),
		SourcePort:      ip.PortARS,
		DestinationPort: ip.PortARS,
		TTL:             64,
		Payload:         buf[n:],
	}
	payload, err := ip.AppendIPv4(nil, &d)
	if err != nil {
		return fmt.Errorf("radio: ARS: %w", err)
	}
	var h pdu.DataHeader
	if err := h.SetUnconfirmed(pdu.UnconfirmedDataHeader{
		SAP:             enums.SAPIPBasedPacketData,
		LLIDDestination: ARSServer,
		LLIDSource:      r.cfg.RadioID,
		FullMessageFlag: true,
	}); err != nil {
		return fmt.Errorf("radio: ARS: %w", err)
	}
	s := &r.dslots[i]
	if len(s.queue) >= maxQueue {
		return ErrBusy
	}
	s.queue = append(s.queue, queuedText{id: arsID, msg: data.Message{Header: h, Rate: enums.DataTypeRate12, Payload: payload}})
	r.nextText(now, i)
	return nil
}
