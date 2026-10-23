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
	"time"

	"github.com/USA-RedDragon/dmrgo/v2/location"
)

// EventKind is the kind of an Event.
type EventKind uint8

// The EventKind values.
const (
	// EventUp reports that the hotspot logged in to the hub.
	EventUp EventKind = iota + 1
	// EventDown reports that the session ended. Reason says why.
	EventDown
	// EventCallStart starts a received call on Slot.
	EventCallStart
	// EventCallEnd ends the received call on Slot. Reason says why.
	EventCallEnd
	// EventTalkerAlias is the talker alias of the call on Slot, in Text.
	EventTalkerAlias
	// EventPosition is a position from the embedded LC of the call on Slot.
	EventPosition
	// EventTransmitStart reports that a transmission began on Slot.
	EventTransmitStart
	// EventTransmitEnd reports that the transmission on Slot ended.
	EventTransmitEnd
	// EventError reports an error that the radio recovered from, in Err.
	EventError
	// EventText is a text message received on Slot, in Text and Format.
	EventText
	// EventTextStatus reports on the text message ID that SendText sent:
	// Reason is "sent", "delivered", "refused", "noAnswer" or "cancelled".
	EventTextStatus
	// EventCheck reports how the radio check, call alert or presence check
	// ID ended after Elapsed: Reason is "answered", "refused",
	// "notSupported", "noAnswer" or "cancelled".
	EventCheck
	// EventCallAlert is a call alert from Source on Slot.
	EventCallAlert
	// EventRequest is a CSBK request that the radio answered, named in
	// Text, from Source on Slot.
	EventRequest
	// EventRegistered reports that the ARS registration went out: Reason
	// is "sent", or why not.
	EventRegistered
	// EventStats reports that Stats changed.
	EventStats
	// EventFix is a position in a data message from Source, in Fix. ID is
	// the ID of the RequestLocation it answers, and Reason is "noPosition"
	// for an answer without one.
	EventFix
	// EventLocationRequest reports that Source asked for this radio's
	// position. Reason is "answered", "stopped" or "notShared".
	EventLocationRequest
	// EventData reports a data message for the data console: Reason "rx"
	// or "tx", its addresses, Format its kind and Text its payload in
	// short. ID is the ID of the SendData or text that sent it, if any.
	EventData
)

// String returns the name of the kind.
func (k EventKind) String() string {
	switch k {
	case EventUp:
		return "up"
	case EventDown:
		return "down"
	case EventCallStart:
		return "callStart"
	case EventCallEnd:
		return "callEnd"
	case EventTalkerAlias:
		return "talkerAlias"
	case EventPosition:
		return "position"
	case EventTransmitStart:
		return "transmitStart"
	case EventTransmitEnd:
		return "transmitEnd"
	case EventError:
		return "error"
	case EventText:
		return "text"
	case EventTextStatus:
		return "textStatus"
	case EventCheck:
		return "check"
	case EventCallAlert:
		return "callAlert"
	case EventRequest:
		return "request"
	case EventRegistered:
		return "registered"
	case EventStats:
		return "stats"
	case EventFix:
		return "fix"
	case EventLocationRequest:
		return "locationRequest"
	case EventData:
		return "data"
	default:
		return "unknown"
	}
}

// Event is something that the radio reports to its user. Fields that do
// not apply to Kind are zero.
type Event struct {
	Kind      EventKind
	Slot      int
	Group     bool
	Target    uint32
	Source    uint32
	FID       uint8
	Vocoder   Vocoder
	Text      string
	Latitude  float64
	Longitude float64
	Reason    string
	Err       error
	ID        uint32
	Format    string
	Elapsed   time.Duration
	Fix       location.Fix
}
