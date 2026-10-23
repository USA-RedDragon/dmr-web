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

//go:build js && wasm

package ambe_test

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"

	"github.com/USA-RedDragon/dmr-web/wasm/ambe"
	"github.com/USA-RedDragon/dmrgo/v2/vocoder"
	"github.com/USA-RedDragon/dmrgo/v2/voice"
	"github.com/stretchr/testify/require"
)

const frames = 150

type vectors struct {
	input, clean, lossyPCM []int16
	frames, lossy          []vocoder.AMBEFrame
	quality                []uint16
}

func load(t *testing.T) (*ambe.Module, *vectors) {
	t.Helper()
	path, dir := os.Getenv("AMBE_WASM"), os.Getenv("AMBE_VECTORS")
	if path == "" || dir == "" {
		t.Skip("AMBE_WASM and AMBE_VECTORS are not set")
	}
	wasm, err := os.ReadFile(path)
	require.NoError(t, err)
	m, err := ambe.Load(wasm)
	require.NoError(t, err)
	read := func(name string) []byte {
		b, err := os.ReadFile(filepath.Join(dir, name))
		require.NoError(t, err)
		return b
	}
	v := &vectors{
		input:    samples(read("input.pcm")),
		clean:    samples(read("clean.pcm")),
		lossyPCM: samples(read("lossy.pcm")),
		frames:   frameList(read("frames.bin")),
		lossy:    frameList(read("lossy-frames.bin")),
	}
	q := read("quality.bin")
	for i := 0; i+1 < len(q); i += 2 {
		v.quality = append(v.quality, binary.LittleEndian.Uint16(q[i:]))
	}
	require.Len(t, v.frames, frames)
	require.Len(t, v.quality, frames)
	return m, v
}

func samples(b []byte) []int16 {
	s := make([]int16, len(b)/2)
	for i := range s {
		s[i] = int16(binary.LittleEndian.Uint16(b[2*i:]))
	}
	return s
}

func frameList(b []byte) []vocoder.AMBEFrame {
	f := make([]vocoder.AMBEFrame, len(b)/7)
	for i := range f {
		copy(f[i][:], b[7*i:])
	}
	return f
}

func quality(v uint16) voice.FrameQuality {
	return voice.FrameQuality{ErrorsCorrected: uint8(v), Bad: v&0x100 != 0}
}

func TestVectorsEncode(t *testing.T) {
	t.Parallel()
	m, v := load(t)
	c, err := m.New()
	require.NoError(t, err)
	defer func() { require.NoError(t, c.Close()) }()
	for i := range frames {
		slot, err := c.Encode(v.input[160*i : 160*(i+1)])
		require.NoError(t, err)
		f, r := vocoder.DecodeAMBE72(slot)
		require.Zero(t, r.ErrorsCorrected)
		require.Equal(t, v.frames[i], f, "frame %d", i)
	}
}

func TestVectorsDecodeClean(t *testing.T) {
	t.Parallel()
	m, v := load(t)
	c, err := m.New()
	require.NoError(t, err)
	defer func() { require.NoError(t, c.Close()) }()
	var pcm []int16
	for i := range frames {
		slot, err := vocoder.EncodeAMBE72(v.frames[i])
		require.NoError(t, err)
		pcm, err = c.Decode(pcm, slot)
		require.NoError(t, err)
	}
	require.Equal(t, v.clean, pcm)
}

func TestVectorsDecodeLossy(t *testing.T) {
	t.Parallel()
	m, v := load(t)
	c, err := m.New()
	require.NoError(t, err)
	defer func() { require.NoError(t, c.Close()) }()
	var pcm []int16
	for i := range frames {
		pcm, err = c.DecodeFrame(pcm, v.lossy[i], quality(v.quality[i]))
		require.NoError(t, err)
	}
	require.Equal(t, v.lossyPCM, pcm)
}

func TestVectorsLossyThroughFEC(t *testing.T) {
	t.Parallel()
	m, v := load(t)
	c, err := m.New()
	require.NoError(t, err)
	defer func() { require.NoError(t, c.Close()) }()
	var pcm []int16
	for i := range frames {
		q := quality(v.quality[i])
		if v.quality[i] == 0x100 {
			pcm, err = c.DecodeFrame(pcm, v.frames[i], q)
			require.NoError(t, err)
			continue
		}
		slot, ok := corrupt(v.frames[i], q)
		if !ok {
			t.Fatalf("frame %d: no slot gives quality %+v", i, q)
		}
		pcm, err = c.Decode(pcm, slot)
		require.NoError(t, err)
	}
	require.Equal(t, v.lossyPCM, pcm)
}

func corrupt(f vocoder.AMBEFrame, q voice.FrameQuality) ([9]byte, bool) {
	slot, err := vocoder.EncodeAMBE72(f)
	if err != nil {
		return slot, false
	}
	var fixable []int
	for b := range 72 {
		s := slot
		s[b/8] ^= 0x80 >> (b % 8)
		g, r := vocoder.DecodeAMBE72(s)
		if g == f && r.ErrorsCorrected == 1 && !r.Uncorrectable {
			fixable = append(fixable, b)
		}
	}
	if q.Bad {
		s := slot
		for _, b := range fixable {
			s[b/8] ^= 0x80 >> (b % 8)
			if _, r := vocoder.DecodeAMBE72(s); r.Uncorrectable {
				return s, true
			}
		}
		return slot, false
	}
	s := slot
	n := 0
	for _, b := range fixable {
		if n == int(q.ErrorsCorrected) {
			break
		}
		try := s
		try[b/8] ^= 0x80 >> (b % 8)
		if g, r := vocoder.DecodeAMBE72(try); g == f && !r.Uncorrectable && r.ErrorsCorrected == n+1 {
			s, n = try, n+1
		}
	}
	return s, n == int(q.ErrorsCorrected)
}

func TestLostFrameBytes(t *testing.T) {
	t.Parallel()
	m, _ := load(t)
	decode := func(f vocoder.AMBEFrame) []int16 {
		c, err := m.New()
		require.NoError(t, err)
		defer func() { require.NoError(t, c.Close()) }()
		pcm, err := c.DecodeFrame(nil, f, voice.FrameQuality{Bad: true})
		require.NoError(t, err)
		return pcm
	}
	want := decode(vocoder.AMBEFrame{})
	require.Equal(t, want, decode(vocoder.AMBEFrame{0xA5, 0xA5, 0xA5, 0xA5, 0xA5, 0xA5, 0xA5}))
	require.Equal(t, want, decode(vocoder.AMBEFrame{0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}))
}

func TestSelfTest(t *testing.T) {
	t.Parallel()
	m, _ := load(t)
	require.Equal(t, int32(ambe.ABIVersion), m.Version())
	require.NoError(t, m.SelfTest())
}

func TestErrorCodes(t *testing.T) {
	t.Parallel()
	m, _ := load(t)
	c, err := m.New()
	require.NoError(t, err)
	_, err = c.DecodeFrame(nil, vocoder.AMBEFrame{}, voice.FrameQuality{ErrorsCorrected: 255, Bad: true})
	require.NoError(t, err)
	require.NoError(t, c.Close())
	require.NoError(t, c.Close())
	_, err = c.EncodeFrame(make([]int16, 160))
	require.ErrorIs(t, err, ambe.ErrClosed)
	_, err = c.EncodeFrame(make([]int16, 10))
	require.ErrorIs(t, err, ambe.ErrClosed)
}

func TestRefusesBadModules(t *testing.T) {
	t.Parallel()
	_, err := ambe.Load([]byte("not wasm"))
	require.ErrorIs(t, err, ambe.ErrCompile)

	empty := []byte{0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00}
	_, err = ambe.Load(empty)
	require.ErrorIs(t, err, ambe.ErrExports)

	withImport := append(append([]byte(nil), empty...),
		0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
		0x02, 0x07, 0x01, 0x01, 'm', 0x01, 'f', 0x00, 0x00)
	_, err = ambe.Load(withImport)
	require.ErrorIs(t, err, ambe.ErrImports)
}
