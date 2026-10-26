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

import "time"

const (
	pingPrefix = "RPTPING"
	pongPrefix = "MSTPONG"
)

func hasPrefix(p []byte, prefix string) bool {
	return len(p) >= len(prefix) && string(p[:len(prefix)]) == prefix
}

// Stats counts what the radio saw since it started.
type Stats struct {
	// RoundTrip is the time from the last ping to its pong, 0 before one.
	RoundTrip time.Duration
	// Bursts and Lost count the received voice bursts and the ones that
	// did not arrive.
	Bursts, Lost uint32
	// Late counts voice bursts that came too late to play.
	Late uint32
	// FrameErrors counts vocoder frames that did not decode.
	FrameErrors uint32
	// Concealed counts frames that the vocoder filled in, for lost frames
	// and for frames that it did not use, as Concealed reports.
	Concealed uint32
	// Codecs is the number of vocoder codecs open.
	Codecs int
}

// Stats returns the counts so far.
func (r *Radio) Stats() Stats {
	s := r.stats
	for i := range r.rx {
		s.Late += r.rx[i].jitter.Stats().Late
		if r.rx[i].codec != nil {
			s.Codecs++
		}
	}
	if r.tx.codec != nil {
		s.Codecs++
	}
	return s
}

func (r *Radio) sent(now time.Duration, p []byte) {
	if hasPrefix(p, pingPrefix) {
		r.pingAt, r.pinged = now, true
	}
}

func (r *Radio) received(now time.Duration, p []byte) {
	if r.pinged && hasPrefix(p, pongPrefix) {
		r.pinged = false
		r.stats.RoundTrip = now - r.pingAt
		r.sink.Event(&Event{Kind: EventStats})
	}
}
