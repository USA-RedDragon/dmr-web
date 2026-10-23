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

import "errors"

// Errors of the radio.
var (
	// ErrNotConnected is a transmission while the hotspot is not logged in.
	ErrNotConnected = errors.New("radio: not connected")
	// ErrBusy is a transmission while one is already running.
	ErrBusy = errors.New("radio: already transmitting")
	// ErrNoAMBE is an AMBE codec while no AMBE module is loaded.
	ErrNoAMBE = errors.New("radio: no AMBE module is loaded")
	// ErrNoCodec2 is a Codec2 codec while no Codec2 factory is set.
	ErrNoCodec2 = errors.New("radio: Codec2 is not available")
	// ErrSlot is a slot other than 1 or 2.
	ErrSlot = errors.New("radio: the slot must be 1 or 2")
	// ErrTarget is a talkgroup or radio ID that does not fit in 24 bits.
	ErrTarget = errors.New("radio: the target must be from 1 to 16777215")
)
