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

package ambe_test

import (
	"testing"

	"github.com/USA-RedDragon/dmr-web/wasm/ambe"
	"github.com/USA-RedDragon/dmrgo/v2/fec"
	"github.com/USA-RedDragon/dmrgo/v2/vocoder"
	"github.com/USA-RedDragon/dmrgo/v2/voice"
	"github.com/stretchr/testify/require"
)

func TestQuality(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		q    voice.FrameQuality
		want uint32
	}{
		{"clean", voice.FrameQuality{}, 0},
		{"corrected", voice.FrameQuality{ErrorsCorrected: 3}, 3},
		{"max", voice.FrameQuality{ErrorsCorrected: 255}, 255},
		{"bad", voice.FrameQuality{Bad: true}, 0x100},
		{"bad corrected", voice.FrameQuality{ErrorsCorrected: 2, Bad: true}, 0x102},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, ambe.Quality(tt.q))
		})
	}
}

func TestFrameQualityOf(t *testing.T) {
	t.Parallel()
	require.Equal(t, voice.FrameQuality{}, ambe.FrameQualityOf(fec.Result{}))
	require.Equal(t, voice.FrameQuality{ErrorsCorrected: 4}, ambe.FrameQualityOf(fec.Result{ErrorsCorrected: 4}))
	require.Equal(t, voice.FrameQuality{ErrorsCorrected: 255}, ambe.FrameQualityOf(fec.Result{ErrorsCorrected: 900}))
	require.Equal(t, voice.FrameQuality{Bad: true, ErrorsCorrected: 1}, ambe.FrameQualityOf(fec.Result{ErrorsCorrected: 1, Uncorrectable: true}))
}

func TestReportV1(t *testing.T) {
	t.Parallel()
	require.Equal(t, vocoder.FrameReport{}, ambe.ReportV1(voice.FrameQuality{ErrorsCorrected: 5}))
	require.Equal(t, vocoder.FrameReport{Frame: vocoder.FrameErased, Output: vocoder.OutputRepeat}, ambe.ReportV1(voice.FrameQuality{Bad: true}))
	require.Equal(t, vocoder.FrameReport{Frame: vocoder.FrameLost, Output: vocoder.OutputRepeat}, ambe.LostReportV1())
}

func TestExports(t *testing.T) {
	t.Parallel()
	e := ambe.Exports()
	require.Len(t, e, 9)
	require.Equal(t, "memory", e[0])
	require.Contains(t, e, "ambe_abi_version")

	v2 := ambe.ExportsV2()
	require.Equal(t, []string{
		"memory", "ambe_version", "ambe_alloc", "ambe_free", "ambe_new",
		"ambe_encode", "ambe_decode", "ambe_decode_lost", "ambe_reset", "ambe_close",
	}, v2)
}

func TestReportV2(t *testing.T) {
	t.Parallel()
	r, err := ambe.ReportV2([8]byte{})
	require.NoError(t, err)
	require.Equal(t, vocoder.FrameReport{CountsKnown: true}, r)

	r, err = ambe.ReportV2([8]byte{4, 3, 2, 3, 1})
	require.NoError(t, err)
	require.Equal(t, vocoder.FrameReport{
		CorrectedA: 4, CorrectedB: 3, Frame: vocoder.FrameErased, Output: vocoder.OutputSilence,
		HighErrorRate: true, CountsKnown: true,
	}, r)

	r, err = ambe.ReportV2([8]byte{0, 0, 1, 2})
	require.NoError(t, err)
	require.Equal(t, vocoder.FrameReport{Frame: vocoder.FrameLost, Output: vocoder.OutputRepeat, CountsKnown: true}, r)

	r, err = ambe.ReportV2([8]byte{0, 0, 3, 0})
	require.NoError(t, err)
	require.Equal(t, vocoder.FrameInvalid, r.Frame)

	for _, b := range [][8]byte{
		{5}, {0, 4}, {0, 0, 4}, {0, 0, 0, 4}, {0, 0, 0, 0, 2},
		{0, 0, 0, 0, 0, 1}, {0, 0, 0, 0, 0, 0, 1}, {0, 0, 0, 0, 0, 0, 0, 0x80},
		{1, 0, 1}, {0, 1, 1}, {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF},
	} {
		r, err := ambe.ReportV2(b)
		require.ErrorIs(t, err, ambe.ErrReport, "% x", b)
		require.Equal(t, vocoder.FrameReport{}, r)
	}
}
