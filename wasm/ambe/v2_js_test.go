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
	"testing"

	"github.com/USA-RedDragon/dmr-web/wasm/ambe"
	"github.com/USA-RedDragon/dmrgo/v2/vocoder"
	"github.com/USA-RedDragon/dmrgo/v2/voice"
	"github.com/stretchr/testify/require"
)

func loadFake(t *testing.T, o fakeOptions) *ambe.Module {
	t.Helper()
	m, err := ambe.Load(fakeV2(o))
	require.NoError(t, err)
	require.Equal(t, int32(ambe.ABIVersion2), m.Version())
	return m
}

func newFake(t *testing.T, o fakeOptions) (*ambe.Module, *ambe.Codec) {
	t.Helper()
	m := loadFake(t, o)
	c, err := m.New()
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.Close() })
	return m, c
}

func TestFakeV1(t *testing.T) {
	t.Parallel()
	m, err := ambe.Load(fakeV1(1))
	require.NoError(t, err)
	require.Equal(t, int32(ambe.ABIVersion1), m.Version())
	require.NoError(t, m.SelfTest())
	c, err := m.New()
	require.NoError(t, err)
	pcm, rep, err := c.DecodeLost(nil)
	require.NoError(t, err)
	require.Len(t, pcm, 160)
	require.Equal(t, ambe.LostReportV1(), rep)
	slot, err := vocoder.EncodeAMBE72(vocoder.AMBEFrame{})
	require.NoError(t, err)
	pcm, rep, err = c.Decode(pcm, slot)
	require.NoError(t, err)
	require.Len(t, pcm, 320)
	require.Equal(t, vocoder.FrameReport{}, rep)
	_, err = c.EncodeFrame(make([]int16, 160))
	require.NoError(t, err)
	require.NoError(t, c.Close())

	_, err = ambe.Load(fakeV1(2))
	require.ErrorIs(t, err, ambe.ErrABI)
}

func TestV2Load(t *testing.T) {
	t.Parallel()
	m := loadFake(t, fakeOptions{})
	require.NoError(t, m.SelfTest())
	require.NoError(t, m.Broken())

	for _, v := range []int32{1, 3, 0x7fffffff, -2} {
		_, err := ambe.Load(fakeV2(fakeOptions{version: v}))
		require.ErrorIs(t, err, ambe.ErrABI, "version %d", v)
	}
}

func TestV2Exports(t *testing.T) {
	t.Parallel()
	for _, name := range ambe.ExportsV2()[1:] {
		_, err := ambe.Load(fakeV2(fakeOptions{drop: name}))
		require.ErrorIs(t, err, ambe.ErrExports, "without %s", name)

		_, err = ambe.Load(fakeV2(fakeOptions{drop: name, global: name}))
		require.ErrorIs(t, err, ambe.ErrExports, "%s as a global", name)

		_, err = ambe.Load(fakeV2(fakeOptions{params: map[string]int{name: 2}}))
		require.ErrorIs(t, err, ambe.ErrExports, "%s with 2 parameters", name)
	}
	for _, extra := range []string{"ambe_init", "ambe_abi_version", "other"} {
		_, err := ambe.Load(fakeV2(fakeOptions{extra: extra}))
		require.ErrorIs(t, err, ambe.ErrExports, "with %s", extra)
	}
	_, err := ambe.Load(fakeV2(fakeOptions{global: "other"}))
	require.ErrorIs(t, err, ambe.ErrExports)

	_, err = ambe.Load(fakeV2(fakeOptions{versionFn: "ambe_abi_version"}))
	require.ErrorIs(t, err, ambe.ErrExports, "a v2 module that reports its version as v1 does")

	_, err = ambe.Load(fakeV2(fakeOptions{imports: true}))
	require.ErrorIs(t, err, ambe.ErrImports)
}

func samplesOf(b ...byte) []int16 {
	s := make([]int16, len(b)/2)
	for i := range s {
		s[i] = int16(binary.LittleEndian.Uint16(b[2*i:]))
	}
	return s
}

func TestV2Decode(t *testing.T) {
	t.Parallel()
	_, c := newFake(t, fakeOptions{})
	slot := [9]byte{4, 3, 2, 3, 1}
	f, _ := vocoder.DecodeAMBE72(slot)
	require.NotEqual(t, slot[:7], f[:], "the FEC of dmr-web would change the bytes")
	pcm, rep, err := c.Decode(nil, slot)
	require.NoError(t, err)
	require.Len(t, pcm, 160)
	require.Equal(t, samplesOf(4, 3, 2, 3, 1, 0, 0, 0), pcm[:4])
	require.Equal(t, vocoder.FrameReport{
		CorrectedA: 4, CorrectedB: 3, Frame: vocoder.FrameErased, Output: vocoder.OutputSilence,
		HighErrorRate: true, CountsKnown: true,
	}, rep)

	pcm, rep, err = c.Decode(pcm, [9]byte{0, 0, 3, 0})
	require.NoError(t, err)
	require.Len(t, pcm, 320)
	require.Equal(t, vocoder.FrameReport{Frame: vocoder.FrameInvalid, CountsKnown: true}, rep)

	pcm, rep, err = c.DecodeLost(pcm)
	require.NoError(t, err)
	require.Len(t, pcm, 480)
	require.Equal(t, int16(0x7777), pcm[320])
	require.Equal(t, vocoder.FrameReport{Frame: vocoder.FrameLost, Output: vocoder.OutputRepeat, CountsKnown: true}, rep)
}

func TestV2Encode(t *testing.T) {
	t.Parallel()
	_, c := newFake(t, fakeOptions{})
	pcm := make([]int16, 160)
	copy(pcm, samplesOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10))
	slot, err := c.Encode(pcm)
	require.NoError(t, err)
	require.Equal(t, [9]byte{1, 2, 3, 4, 5, 6, 7, 8, 9}, slot)

	_, err = c.Encode(pcm[:10])
	require.ErrorIs(t, err, ambe.ErrSamples)
	_, err = c.EncodeFrame(pcm)
	require.ErrorIs(t, err, ambe.ErrFrames)
	_, err = c.DecodeFrame(nil, vocoder.AMBEFrame{}, voice.FrameQuality{})
	require.ErrorIs(t, err, ambe.ErrFrames)
}

func TestV2ErrorCodes(t *testing.T) {
	t.Parallel()
	m, c := newFake(t, fakeOptions{})
	for code, want := range map[byte]error{0xFF: ambe.ErrHandle, 0xFE: ambe.ErrPointer, 0xFD: ambe.ErrTooMany} {
		dst := make([]int16, 3, 200)
		out, rep, err := c.Decode(dst, [9]byte{8: code})
		require.ErrorIs(t, err, want)
		require.Equal(t, dst, out)
		require.Equal(t, vocoder.FrameReport{}, rep)
	}
	require.NoError(t, m.Broken())
	_, _, err := c.Decode(nil, [9]byte{})
	require.NoError(t, err)

	for _, code := range []byte{0xFC, 0x80, 0x01} {
		m, c := newFake(t, fakeOptions{})
		_, _, err := c.Decode(nil, [9]byte{8: code})
		require.ErrorIs(t, err, ambe.ErrBroken, "code %d", int8(code))
		require.ErrorIs(t, err, ambe.ErrCode)
		requireBroken(t, m, c)
	}
}

func requireBroken(t *testing.T, m *ambe.Module, c *ambe.Codec) {
	t.Helper()
	require.ErrorIs(t, m.Broken(), ambe.ErrBroken)
	_, _, err := c.Decode(nil, [9]byte{})
	require.ErrorIs(t, err, ambe.ErrBroken)
	_, _, err = c.DecodeLost(nil)
	require.ErrorIs(t, err, ambe.ErrBroken)
	_, err = c.Encode(make([]int16, 160))
	require.ErrorIs(t, err, ambe.ErrBroken)
	c.Reset()
	_, err = m.New()
	require.ErrorIs(t, err, ambe.ErrBroken)
	require.ErrorIs(t, m.SelfTest(), ambe.ErrBroken)
	require.NoError(t, c.Close())
}

func TestV2BadReports(t *testing.T) {
	t.Parallel()
	for _, b := range [][8]byte{
		{5}, {0, 4}, {0, 0, 4}, {0, 0, 0, 4}, {0, 0, 0, 0, 2},
		{0, 0, 0, 0, 0, 1}, {0, 0, 0, 0, 0, 0, 1}, {0, 0, 0, 0, 0, 0, 0, 1},
		{0, 0, 1, 0},
	} {
		m, c := newFake(t, fakeOptions{})
		var slot [9]byte
		copy(slot[:], b[:])
		dst := make([]int16, 0, 160)
		out, rep, err := c.Decode(dst, slot)
		require.ErrorIs(t, err, ambe.ErrReport, "% x", b)
		require.ErrorIs(t, err, ambe.ErrBroken)
		require.Empty(t, out)
		require.Equal(t, vocoder.FrameReport{}, rep)
		requireBroken(t, m, c)
	}
	for _, b := range [][8]byte{{0, 0, 0, 3}, {1, 0, 1, 2}, {0, 1, 1, 2}, {0, 0, 1, 2, 0, 0, 1}} {
		m, c := newFake(t, fakeOptions{lostReport: b})
		_, _, err := c.DecodeLost(nil)
		require.ErrorIs(t, err, ambe.ErrReport, "% x", b)
		requireBroken(t, m, c)
	}
}

func TestV2Trap(t *testing.T) {
	t.Parallel()
	m, c := newFake(t, fakeOptions{trapDecode: true})
	_, _, err := c.Decode(nil, [9]byte{})
	require.ErrorIs(t, err, ambe.ErrCall)
	require.ErrorIs(t, err, ambe.ErrBroken)
	requireBroken(t, m, c)

	m = loadFake(t, fakeOptions{trapDecode: true})
	require.ErrorIs(t, m.SelfTest(), ambe.ErrBroken)
}

func TestV2New(t *testing.T) {
	t.Parallel()
	m := loadFake(t, fakeOptions{newFixed: true, newResult: -3})
	_, err := m.New()
	require.ErrorIs(t, err, ambe.ErrTooMany)
	require.NoError(t, m.Broken())

	for _, h := range []int32{0, -4, -9} {
		m := loadFake(t, fakeOptions{newFixed: true, newResult: h})
		_, err := m.New()
		require.ErrorIs(t, err, ambe.ErrBroken, "handle %d", h)
	}

	m = loadFake(t, fakeOptions{allocFixed: true})
	_, err = m.New()
	require.ErrorIs(t, err, ambe.ErrAlloc)
	require.NoError(t, m.Broken())

	for _, p := range []int32{1028, -16, 65536 - 16, 65536} {
		m := loadFake(t, fakeOptions{allocFixed: true, allocAt: p})
		_, err := m.New()
		require.ErrorIs(t, err, ambe.ErrPointer, "block at %d", p)
		require.ErrorIs(t, err, ambe.ErrBroken)
	}

	m = loadFake(t, fakeOptions{})
	a, err := m.New()
	require.NoError(t, err)
	b, err := m.New()
	require.NoError(t, err)
	_, _, err = a.Decode(nil, [9]byte{})
	require.NoError(t, err)
	_, _, err = b.DecodeLost(nil)
	require.NoError(t, err)
	require.NoError(t, a.Close())
	require.NoError(t, b.Close())
}

func TestV2Reset(t *testing.T) {
	t.Parallel()
	_, c := newFake(t, fakeOptions{})
	c.Reset()
	_, _, err := c.Decode(nil, [9]byte{})
	require.NoError(t, err)

	m, c := newFake(t, fakeOptions{resetCode: -1})
	c.Reset()
	require.NoError(t, m.Broken())

	m, c = newFake(t, fakeOptions{resetCode: -7})
	c.Reset()
	requireBroken(t, m, c)
}

func TestV2Closed(t *testing.T) {
	t.Parallel()
	m, c := newFake(t, fakeOptions{})
	require.NoError(t, c.Close())
	require.NoError(t, c.Close())
	_, _, err := c.Decode(nil, [9]byte{})
	require.ErrorIs(t, err, ambe.ErrClosed)
	_, _, err = c.DecodeLost(nil)
	require.ErrorIs(t, err, ambe.ErrClosed)
	_, err = c.Encode(make([]int16, 160))
	require.ErrorIs(t, err, ambe.ErrClosed)
	c.Reset()
	require.NoError(t, m.Broken())
}

func TestV2MemoryGrow(t *testing.T) {
	t.Parallel()
	_, c := newFake(t, fakeOptions{growOnDecode: true})
	for i := range 3 {
		pcm, rep, err := c.Decode(nil, [9]byte{1, 2, 0, 1})
		require.NoError(t, err, "decode %d", i)
		require.Equal(t, samplesOf(1, 2, 0, 1), pcm[:2])
		require.Equal(t, vocoder.FrameReport{CorrectedA: 1, CorrectedB: 2, Output: vocoder.OutputTone, CountsKnown: true}, rep)
	}
}

//nolint:paralleltest // AllocsPerRun counts the allocations of every goroutine.
func TestV2NoAllocs(t *testing.T) {
	_, c := newFake(t, fakeOptions{})
	dst := make([]int16, 0, 160)
	pcm := make([]int16, 160)
	var err error
	decode := testing.AllocsPerRun(100, func() {
		_, _, err = c.Decode(dst, [9]byte{})
	})
	require.NoError(t, err)
	lost := testing.AllocsPerRun(100, func() {
		_, _, err = c.DecodeLost(dst)
	})
	require.NoError(t, err)
	encode := testing.AllocsPerRun(100, func() {
		_, err = c.Encode(pcm)
	})
	require.NoError(t, err)
	require.Zero(t, decode, "Decode")
	require.Zero(t, lost, "DecodeLost")
	require.Zero(t, encode, "Encode")
}
