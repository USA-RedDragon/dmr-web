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
	"github.com/USA-RedDragon/dmrgo/v2/enums"
	"github.com/USA-RedDragon/dmrgo/v2/vocoder"
)

// codec2FID is the FID of Codec2 calls, as dmrgo codec2.DefaultFID.
const codec2FID enums.FID = 0xC2

// Vocoder names a vocoder, or the choice of one.
type Vocoder uint8

// The Vocoder values.
const (
	// VocoderAuto transmits AMBE when a module is loaded and Codec2 when not.
	VocoderAuto Vocoder = iota
	// VocoderCodec2 is Codec2.
	VocoderCodec2
	// VocoderAMBE is AMBE+2, from the module that the user loaded.
	VocoderAMBE
)

// String returns the name of the vocoder.
func (v Vocoder) String() string {
	switch v {
	case VocoderAuto:
		return "auto"
	case VocoderCodec2:
		return "codec2"
	case VocoderAMBE:
		return "ambe"
	default:
		return "unknown"
	}
}

// Codecs makes new codecs, one for each stream. AMBE is nil while no AMBE
// module is loaded.
type Codecs struct {
	Codec2 func() (vocoder.Codec, error)
	AMBE   func() (vocoder.Codec, error)
}

func rxVocoder(fid enums.FID) Vocoder {
	if fid == codec2FID {
		return VocoderCodec2
	}
	return VocoderAMBE
}

func (r *Radio) txVocoder() Vocoder {
	return Transmit(r.choice, r.codecs.AMBE != nil)
}

// Transmit returns the vocoder that a transmission uses for the choice
// v, given whether an AMBE module is loaded.
func Transmit(v Vocoder, ambe bool) Vocoder {
	if v != VocoderCodec2 && ambe {
		return VocoderAMBE
	}
	return VocoderCodec2
}

func (r *Radio) newCodec(v Vocoder) (vocoder.Codec, error) {
	switch v {
	case VocoderAMBE:
		if r.codecs.AMBE == nil {
			return nil, ErrNoAMBE
		}
		return r.codecs.AMBE()
	case VocoderCodec2, VocoderAuto:
		if r.codecs.Codec2 == nil {
			return nil, ErrNoCodec2
		}
		return r.codecs.Codec2()
	default:
		return nil, ErrNoCodec2
	}
}
