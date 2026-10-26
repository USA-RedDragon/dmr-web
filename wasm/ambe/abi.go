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

// Package ambe runs a user-supplied AMBE+2 WebAssembly module as a dmrgo
// vocoder.Codec. The module speaks ABI version 1: no imports, exports of
// exactly memory and eight ambe_ functions, 49-bit frames, and negative
// return codes for errors.
package ambe

import (
	"errors"

	"github.com/USA-RedDragon/dmrgo/v2/fec"
	"github.com/USA-RedDragon/dmrgo/v2/vocoder"
	"github.com/USA-RedDragon/dmrgo/v2/voice"
)

// ABIVersion is the module ABI that this package speaks.
const ABIVersion = 1

const (
	frameSamples = 160
	pcmBytes     = frameSamples * 2
	frameBytes   = 7
	qualityBad   = 1 << 8

	memoryExport = "memory"
)

// Exports lists the exports that a module must have, and no others.
func Exports() []string {
	return []string{
		memoryExport,
		"ambe_abi_version",
		"ambe_alloc",
		"ambe_free",
		"ambe_init",
		"ambe_reset",
		"ambe_close",
		"ambe_encode",
		"ambe_decode",
	}
}

// Errors of a module or its codecs.
var (
	// ErrImports is a module that has imports.
	ErrImports = errors.New("ambe: the module has imports")
	// ErrExports is a module whose exports are not exactly the ABI exports.
	ErrExports = errors.New("ambe: the module does not have exactly the ABI exports")
	// ErrABI is a module of another ABI version.
	ErrABI = errors.New("ambe: the module speaks another ABI version")
	// ErrCompile is a file that is not a WebAssembly module.
	ErrCompile = errors.New("ambe: the file is not a WebAssembly module")
	// ErrAlloc is an ambe_alloc that returned 0.
	ErrAlloc = errors.New("ambe: ambe_alloc returned 0")
	// ErrHandle is code -1: the handle is not open.
	ErrHandle = errors.New("ambe: the handle is not open")
	// ErrPointer is code -2: a pointer outside a block from ambe_alloc.
	ErrPointer = errors.New("ambe: a pointer is not inside a block from ambe_alloc")
	// ErrTooMany is code -3: 256 codecs are open.
	ErrTooMany = errors.New("ambe: too many codecs are open")
	// ErrQuality is code -4: a quality bit above bit 8 is set.
	ErrQuality = errors.New("ambe: a quality bit other than bits 0 to 8 is set")
	// ErrCode is another negative return code.
	ErrCode = errors.New("ambe: the module returned an unknown error code")
	// ErrPadding is an encoded frame whose padding bits are set.
	ErrPadding = errors.New("ambe: the encoded frame has padding bits set")
	// ErrSamples is a PCM frame that is not 160 samples.
	ErrSamples = errors.New("ambe: a PCM frame must have 160 samples")
	// ErrClosed is a call on a closed codec.
	ErrClosed = errors.New("ambe: the codec is closed")
	// ErrCall is a module call that threw.
	ErrCall = errors.New("ambe: the module call failed")
)

// Quality returns the ABI quality value of a frame quality: bits 0 to 7
// are the corrected errors, capped at 255, and bit 8 is Bad.
func Quality(q voice.FrameQuality) uint32 {
	v := uint32(q.ErrorsCorrected)
	if q.Bad {
		v |= qualityBad
	}
	return v
}

// FrameQualityOf maps the FEC result of DecodeAMBE72 to a frame quality.
func FrameQualityOf(r fec.Result) voice.FrameQuality {
	return voice.FrameQuality{
		ErrorsCorrected: uint8(min(max(r.ErrorsCorrected, 0), 255)),
		Bad:             r.Uncorrectable,
	}
}

// ReportV1 returns the report on a frame that a module of ABI version 1
// decoded with quality q: FrameErased for a bad frame, else FrameGood. The
// ABI does not tell what the module put in the samples, so Output is
// OutputRepeat for a bad frame and OutputVoice for a good one. The FEC
// result does not split the corrected bits by section, so CountsKnown is
// false.
func ReportV1(q voice.FrameQuality) vocoder.FrameReport {
	if q.Bad {
		return vocoder.FrameReport{Frame: vocoder.FrameErased, Output: vocoder.OutputRepeat}
	}
	return vocoder.FrameReport{}
}

// LostReportV1 returns the report on a frame that a module of ABI version 1
// filled in for a lost one: FrameLost and, as for a bad frame,
// OutputRepeat.
func LostReportV1() vocoder.FrameReport {
	return vocoder.FrameReport{Frame: vocoder.FrameLost, Output: vocoder.OutputRepeat}
}
