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

// DefaultLocationServer is the radio ID that the radio registers with and
// reports its position to unless Config says otherwise: 5057, one of the
// location service IDs 5050 to 5059 that BrandMeister uses as its radios'
// ARS and location server, and whose APRS symbol is a person.
const DefaultLocationServer = 5057

// ValidLocationServer reports whether id is one of the location service
// IDs 5050 to 5059.
func ValidLocationServer(id uint32) bool {
	return id >= 5050 && id <= 5059
}

func (r *Radio) locationServer() uint32 {
	if ValidLocationServer(r.cfg.LocationServer) {
		return r.cfg.LocationServer
	}
	return DefaultLocationServer
}

// SetLocationServer makes server the ID that this radio registers with and
// reports its position to. While ARS is on and the hotspot is logged in,
// it deregisters from the previous server and registers with server, even
// when it did not change, so that the server asks for positions again.
func (r *Radio) SetLocationServer(now time.Duration, server uint32) error {
	if !ValidLocationServer(server) {
		return ErrLocationServer
	}
	old := r.locationServer()
	r.cfg.LocationServer = server
	if !r.cfg.ARS || !r.up {
		return nil
	}
	if old != server {
		if err := r.queueARS(now, old, ars.Message{Header: ars.Header{Extension: true, Priority: true, Control: true, Type: ars.TypeDeviceDeregistration}}); err != nil {
			return err
		}
	}
	return r.Register(now)
}

const (
	arsSlot = 2
	arsID   = ^uint32(0) - 1
)

// Register queues an ARS registration on slot 2, which tells the
// hub and location servers that the radio is on. Its EventRegistered
// reports how it went.
func (r *Radio) Register(now time.Duration) error {
	return r.queueARS(now, r.locationServer(), ars.NewRegistration(ars.EventInitial))
}

func (r *Radio) queueARS(now time.Duration, server uint32, m ars.Message) error {
	i, err := r.dataTarget(arsSlot, server)
	if err != nil {
		return err
	}
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
		Destination:     ip.RadioAddress(ip.DefaultNetwork, server),
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
		LLIDDestination: server,
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
