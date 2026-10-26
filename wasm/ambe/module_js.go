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

package ambe

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"slices"
	"syscall/js"

	"github.com/USA-RedDragon/dmrgo/v2/enums"
	"github.com/USA-RedDragon/dmrgo/v2/vocoder"
	"github.com/USA-RedDragon/dmrgo/v2/voice"
)

// Module is a loaded AMBE module: one instance whose codecs are handles.
type Module struct {
	exports js.Value
	fns     map[string]js.Value
	memory  js.Value
}

// Load compiles and instantiates wasm with the browser WebAssembly API,
// synchronously, and checks it against ABI version 1. It refuses a module
// with imports, with other exports than Exports, or of another version.
func Load(wasm []byte) (*Module, error) {
	wa := js.Global().Get("WebAssembly")
	src := js.Global().Get("Uint8Array").New(len(wasm))
	js.CopyBytesToJS(src, wasm)
	mod, err := try(func() js.Value { return wa.Get("Module").New(src) })
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrCompile, err)
	}
	imports, err := try(func() js.Value { return wa.Get("Module").Call("imports", mod) })
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrCompile, err)
	}
	if imports.Length() != 0 {
		return nil, ErrImports
	}
	if err := checkExports(wa, mod); err != nil {
		return nil, err
	}
	inst, err := try(func() js.Value {
		return wa.Get("Instance").New(mod, js.Global().Get("Object").New())
	})
	if err != nil {
		return nil, fmt.Errorf("%w: instantiate: %w", ErrCompile, err)
	}
	m := &Module{exports: inst.Get("exports"), fns: map[string]js.Value{}}
	m.memory = m.exports.Get(memoryExport)
	for _, name := range Exports()[1:] {
		m.fns[name] = m.exports.Get(name)
	}
	v, err := m.call("ambe_abi_version")
	if err != nil {
		return nil, err
	}
	if v != ABIVersion {
		return nil, fmt.Errorf("%w: %d", ErrABI, v)
	}
	return m, nil
}

func checkExports(wa js.Value, mod js.Value) error {
	list, err := try(func() js.Value { return wa.Get("Module").Call("exports", mod) })
	if err != nil {
		return fmt.Errorf("%w: %w", ErrCompile, err)
	}
	want := Exports()
	if list.Length() != len(want) {
		return ErrExports
	}
	for i := range list.Length() {
		e := list.Index(i)
		name, kind := e.Get("name").String(), e.Get("kind").String()
		switch {
		case !slices.Contains(want, name):
			return ErrExports
		case name == memoryExport && kind != memoryExport:
			return ErrExports
		case name != memoryExport && kind != "function":
			return ErrExports
		}
	}
	return nil
}

func try(f func() js.Value) (v js.Value, err error) {
	defer func() {
		if r := recover(); r != nil {
			if e, ok := r.(error); ok {
				err = e
				return
			}
			err = fmt.Errorf("%w: %v", ErrCall, r)
		}
	}()
	return f(), nil
}

func (m *Module) call(name string, args ...any) (int32, error) {
	f := m.fns[name]
	v, err := try(func() js.Value { return f.Invoke(args...) })
	if err != nil {
		return 0, fmt.Errorf("%w: %s: %w", ErrCall, name, err)
	}
	n := v.Int()
	if n < math.MinInt32 || n > math.MaxInt32 {
		return 0, fmt.Errorf("%w: %s returned %d", ErrCode, name, n)
	}
	return int32(n), nil
}

func (m *Module) view(ptr uint32, n int) js.Value {
	return js.Global().Get("Uint8Array").New(m.memory.Get("buffer"), ptr, n)
}

// Version returns the ABI version that the module reports, or 0 when the
// call fails.
func (m *Module) Version() int32 {
	v, err := m.call("ambe_abi_version")
	if err != nil {
		return 0
	}
	return v
}

// SelfTest encodes 160 zero samples and decodes the result with a new
// codec, and checks that both calls succeed and the padding bits are 0.
func (m *Module) SelfTest() error {
	c, err := m.New()
	if err != nil {
		return err
	}
	f, err := c.EncodeFrame(make([]int16, frameSamples))
	if err != nil {
		return errors.Join(err, c.Close())
	}
	if _, err := c.DecodeFrame(nil, f, voice.FrameQuality{}); err != nil {
		return errors.Join(err, c.Close())
	}
	return c.Close()
}

// Codec is one stream of the module: an encoder and a decoder.
type Codec struct {
	m      *Module
	handle int32
	pcm    uint32
	frame  uint32
	buf    [pcmBytes]byte
	closed bool
}

var _ vocoder.Codec = (*Codec)(nil)

// New opens a codec with its own buffers in the module memory.
func (m *Module) New() (*Codec, error) {
	h, err := m.call("ambe_init")
	if err != nil {
		return nil, err
	}
	if h <= 0 {
		return nil, codeError(h)
	}
	c := &Codec{m: m, handle: h}
	pcm, err := m.call("ambe_alloc", pcmBytes)
	if err != nil || pcm <= 0 {
		return nil, errors.Join(ErrAlloc, err, c.Close())
	}
	c.pcm = uint32(pcm)
	frame, err := m.call("ambe_alloc", frameBytes)
	if err != nil || frame <= 0 {
		return nil, errors.Join(ErrAlloc, err, c.Close())
	}
	c.frame = uint32(frame)
	return c, nil
}

// FrameSamples returns 160.
func (c *Codec) FrameSamples() int {
	return frameSamples
}

// FID returns the standardized FID of AMBE+2 calls.
func (c *Codec) FID() enums.FID {
	return enums.FIDStandardized
}

// Silence returns the AMBE+2 silence slot.
func (c *Codec) Silence() [9]byte {
	return vocoder.AMBESilenceSlot()
}

// Reset resets the encoder and decoder to the state of a new codec.
func (c *Codec) Reset() {
	if c.closed {
		return
	}
	_, _ = c.m.call("ambe_reset", c.handle)
}

// EncodeFrame encodes 160 samples into one 49-bit frame.
func (c *Codec) EncodeFrame(pcm []int16) (vocoder.AMBEFrame, error) {
	var f vocoder.AMBEFrame
	switch {
	case c.closed:
		return f, ErrClosed
	case len(pcm) != frameSamples:
		return f, ErrSamples
	}
	for i, s := range pcm {
		binary.LittleEndian.PutUint16(c.buf[2*i:], uint16(s))
	}
	js.CopyBytesToJS(c.m.view(c.pcm, pcmBytes), c.buf[:])
	rc, err := c.m.call("ambe_encode", c.handle, c.pcm, c.frame)
	if err != nil {
		return f, err
	}
	if rc != 0 {
		return f, codeError(rc)
	}
	js.CopyBytesToGo(f[:], c.m.view(c.frame, frameBytes))
	if f[6]&0x7F != 0 {
		return f, ErrPadding
	}
	return f, nil
}

// DecodeFrame decodes one 49-bit frame of quality q and appends 160 samples
// to dst. A frame with q.Bad set is not read.
func (c *Codec) DecodeFrame(dst []int16, f vocoder.AMBEFrame, q voice.FrameQuality) ([]int16, error) {
	if c.closed {
		return dst, ErrClosed
	}
	js.CopyBytesToJS(c.m.view(c.frame, frameBytes), f[:])
	rc, err := c.m.call("ambe_decode", c.handle, c.frame, c.pcm, Quality(q))
	if err != nil {
		return dst, err
	}
	if rc != 0 {
		return dst, codeError(rc)
	}
	js.CopyBytesToGo(c.buf[:], c.m.view(c.pcm, pcmBytes))
	for i := range frameSamples {
		dst = append(dst, int16(binary.LittleEndian.Uint16(c.buf[2*i:])))
	}
	return dst, nil
}

// Encode encodes 160 samples into one 72-bit slot with FEC.
func (c *Codec) Encode(pcm []int16) ([9]byte, error) {
	f, err := c.EncodeFrame(pcm)
	if err != nil {
		return [9]byte{}, err
	}
	s, err := vocoder.EncodeAMBE72(f)
	if err != nil {
		return [9]byte{}, fmt.Errorf("ambe: %w", err)
	}
	return s, nil
}

// Decode removes the FEC of one 72-bit slot, decodes the frame with the
// quality of the FEC result, and appends the 160 decoded samples to dst. It
// returns the report of ReportV1.
func (c *Codec) Decode(dst []int16, slot [9]byte) ([]int16, vocoder.FrameReport, error) {
	f, r := vocoder.DecodeAMBE72(slot)
	q := FrameQualityOf(r)
	out, err := c.DecodeFrame(dst, f, q)
	if err != nil {
		return dst, vocoder.FrameReport{}, err
	}
	return out, ReportV1(q), nil
}

// DecodeLost has the module conceal a frame that never arrived, as a bad
// frame, and appends the 160 samples to dst. It returns LostReportV1.
func (c *Codec) DecodeLost(dst []int16) ([]int16, vocoder.FrameReport, error) {
	out, err := c.DecodeFrame(dst, vocoder.AMBEFrame{}, voice.FrameQuality{Bad: true})
	if err != nil {
		return dst, vocoder.FrameReport{}, err
	}
	return out, LostReportV1(), nil
}

// Close frees the buffers and the handle.
func (c *Codec) Close() error {
	if c.closed {
		return nil
	}
	c.closed = true
	var errs []error
	for _, p := range []uint32{c.pcm, c.frame} {
		if p == 0 {
			continue
		}
		if rc, err := c.m.call("ambe_free", p); err != nil {
			errs = append(errs, err)
		} else if rc != 0 {
			errs = append(errs, codeError(rc))
		}
	}
	if rc, err := c.m.call("ambe_close", c.handle); err != nil {
		errs = append(errs, err)
	} else if rc != 0 {
		errs = append(errs, codeError(rc))
	}
	return errors.Join(errs...)
}

func codeError(code int32) error {
	switch code {
	case -1:
		return ErrHandle
	case -2:
		return ErrPointer
	case -3:
		return ErrTooMany
	case -4:
		return ErrQuality
	default:
		return fmt.Errorf("%w: %d", ErrCode, code)
	}
}
