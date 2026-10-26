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
	version int32
	broken  error
}

// Load compiles and instantiates wasm with the browser WebAssembly API,
// synchronously, and checks it against its ABI version. It refuses a module
// with imports. A module that exports ambe_version must have exactly the
// exports of ExportsV2, each function with the parameters of the ABI, and
// ambe_version must return 2. Any other module must have exactly the
// exports of Exports, and ambe_abi_version must return 1.
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
	list, err := try(func() js.Value { return wa.Get("Module").Call("exports", mod) })
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrCompile, err)
	}
	v2 := hasExport(list, fnVersion)
	want, versionFn, version := Exports(), fnABIVersion, int32(ABIVersion1)
	if v2 {
		want, versionFn, version = ExportsV2(), fnVersion, ABIVersion2
	}
	if err := checkExports(list, want); err != nil {
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
	for _, name := range want[1:] {
		fn := m.exports.Get(name)
		if n, ok := intOf(fn.Get("length")); v2 && (!ok || int(n) != paramsV2(name)) {
			return nil, fmt.Errorf("%w: %s does not take %d parameters", ErrExports, name, paramsV2(name))
		}
		m.fns[name] = fn
	}
	v, err := m.call(versionFn)
	if err != nil {
		return nil, err
	}
	if v != version {
		return nil, fmt.Errorf("%w: %d", ErrABI, v)
	}
	m.version = v
	return m, nil
}

func paramsV2(name string) int {
	switch name {
	case fnAlloc, fnFree, fnReset, fnClose:
		return 1
	case fnEncode, fnDecodeLost:
		return 3
	case fnDecode:
		return 4
	default:
		return 0
	}
}

func hasExport(list js.Value, name string) bool {
	for i := range list.Length() {
		if list.Index(i).Get("name").String() == name {
			return true
		}
	}
	return false
}

func checkExports(list js.Value, want []string) error {
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

func intOf(v js.Value) (int32, bool) {
	if v.Type() != js.TypeNumber {
		return 0, false
	}
	f := v.Float()
	if f != math.Trunc(f) || f < math.MinInt32 || f > math.MaxInt32 {
		return 0, false
	}
	return int32(f), true
}

func sizeOf(v js.Value) float64 {
	if v.Type() != js.TypeNumber {
		return 0
	}
	return v.Float()
}

func (m *Module) call(name string, args ...any) (int32, error) {
	f := m.fns[name]
	v, err := try(func() js.Value { return f.Invoke(args...) })
	if err != nil {
		return 0, fmt.Errorf("%w: %s: %w", ErrCall, name, err)
	}
	n, ok := intOf(v)
	if !ok {
		return 0, fmt.Errorf("%w: %s returned %s", ErrCode, name, v.Type())
	}
	return n, nil
}

func (m *Module) view(ptr uint32, n int) js.Value {
	return js.Global().Get("Uint8Array").New(m.memory.Get("buffer"), ptr, n)
}

func (m *Module) fail(err error) error {
	if m.broken == nil {
		m.broken = fmt.Errorf("%w: %w", ErrBroken, err)
	}
	return m.broken
}

func (m *Module) codeV2(code int32) error {
	switch code {
	case -1:
		return ErrHandle
	case -2:
		return ErrPointer
	case -3:
		return ErrTooMany
	default:
		return m.fail(fmt.Errorf("%w: %d", ErrCode, code))
	}
}

func (m *Module) isBroken() bool {
	return m.broken != nil
}

// Version returns the ABI version of the module.
func (m *Module) Version() int32 {
	return m.version
}

// Broken returns the error that made a module of ABI version 2 broken, or
// nil. A module is broken after a call that threw, a return code that the
// ABI does not define, an invalid frame report or an invalid block from
// ambe_alloc. The codecs of a broken module return the error and make no
// more calls into it.
func (m *Module) Broken() error {
	return m.broken
}

// SelfTest encodes 160 zero samples and decodes the result with a new
// codec, and checks that both calls succeed. For ABI version 1 it checks
// that the padding bits are 0, and for ABI version 2 it also decodes a lost
// frame and checks the reports.
func (m *Module) SelfTest() error {
	c, err := m.New()
	if err != nil {
		return err
	}
	if m.version == ABIVersion2 {
		return errors.Join(c.selfTestV2(), c.Close())
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

func (c *Codec) selfTestV2() error {
	pcm := make([]int16, 0, frameSamples)
	slot, err := c.Encode(pcm[:frameSamples])
	if err != nil {
		return err
	}
	if _, _, err := c.Decode(pcm, slot); err != nil {
		return err
	}
	_, _, err = c.DecodeLost(pcm)
	return err
}

// Codec is one stream of the module: an encoder and a decoder.
type Codec struct {
	m      *Module
	handle int32
	pcm    uint32
	frame  uint32
	report uint32
	buf    [pcmBytes]byte
	slot   [slotBytes]byte
	rep    [reportBytes]byte
	views  views
	args   args
	closed bool
}

type views struct {
	pcm, slot, report js.Value
}

type args struct {
	encode, decode, lost, handle []any
}

var _ vocoder.Codec = (*Codec)(nil)

// New opens a codec with its own buffers in the module memory.
func (m *Module) New() (*Codec, error) {
	if m.version == ABIVersion2 {
		return m.newV2()
	}
	h, err := m.call(fnInit)
	if err != nil {
		return nil, err
	}
	if h <= 0 {
		return nil, codeError(h)
	}
	c := &Codec{m: m, handle: h}
	pcm, err := m.call(fnAlloc, pcmBytes)
	if err != nil || pcm <= 0 {
		return nil, errors.Join(ErrAlloc, err, c.Close())
	}
	c.pcm = uint32(pcm)
	frame, err := m.call(fnAlloc, frameBytes)
	if err != nil || frame <= 0 {
		return nil, errors.Join(ErrAlloc, err, c.Close())
	}
	c.frame = uint32(frame)
	return c, nil
}

func (m *Module) newV2() (*Codec, error) {
	if m.broken != nil {
		return nil, m.broken
	}
	h, err := m.call(fnNew)
	if err != nil {
		return nil, m.fail(err)
	}
	if h <= 0 {
		return nil, m.codeV2(h)
	}
	c := &Codec{m: m, handle: h}
	for _, b := range []struct {
		ptr *uint32
		n   int
	}{{&c.pcm, pcmBytes}, {&c.frame, slotBytes}, {&c.report, reportBytes}} {
		p, err := m.call(fnAlloc, b.n)
		if err != nil {
			return nil, errors.Join(m.fail(err), c.Close())
		}
		if p == 0 {
			return nil, errors.Join(ErrAlloc, c.Close())
		}
		if p < 0 || !m.block(p, b.n) {
			return nil, errors.Join(m.fail(fmt.Errorf("%w: ambe_alloc returned %d", ErrPointer, p)), c.Close())
		}
		*b.ptr = uint32(p)
	}
	hv, pcm, slot, rep := js.ValueOf(h), js.ValueOf(c.pcm), js.ValueOf(c.frame), js.ValueOf(c.report)
	c.args = args{
		encode: []any{hv, pcm, slot},
		decode: []any{hv, slot, pcm, rep},
		lost:   []any{hv, pcm, rep},
		handle: []any{hv},
	}
	c.refresh()
	return c, nil
}

func (m *Module) block(p int32, n int) bool {
	size := sizeOf(m.memory.Get("buffer").Get("byteLength"))
	return p > 0 && p%16 == 0 && float64(p)+float64(n) <= size
}

func (c *Codec) refresh() {
	c.views = views{
		pcm:    c.m.view(c.pcm, pcmBytes),
		slot:   c.m.view(c.frame, slotBytes),
		report: c.m.view(c.report, reportBytes),
	}
}

func (c *Codec) readyV2() error {
	switch {
	case c.closed:
		return ErrClosed
	case c.m.broken != nil:
		return c.m.broken
	}
	c.attach()
	return nil
}

func (c *Codec) attach() {
	if sizeOf(c.views.report.Get("byteLength")) == 0 {
		c.refresh()
	}
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
	if c.m.version == ABIVersion2 {
		if c.readyV2() != nil {
			return
		}
		rc, err := c.m.call(fnReset, c.args.handle...)
		switch {
		case err != nil:
			_ = c.m.fail(err)
		case rc != 0:
			_ = c.m.codeV2(rc)
		}
		return
	}
	if c.closed {
		return
	}
	_, _ = c.m.call(fnReset, c.handle)
}

// EncodeFrame encodes 160 samples into one 49-bit frame. It returns
// ErrFrames for a module of ABI version 2.
func (c *Codec) EncodeFrame(pcm []int16) (vocoder.AMBEFrame, error) {
	var f vocoder.AMBEFrame
	switch {
	case c.closed:
		return f, ErrClosed
	case c.m.version == ABIVersion2:
		return f, ErrFrames
	case len(pcm) != frameSamples:
		return f, ErrSamples
	}
	c.putPCM(pcm)
	js.CopyBytesToJS(c.m.view(c.pcm, pcmBytes), c.buf[:])
	rc, err := c.m.call(fnEncode, c.handle, c.pcm, c.frame)
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

func (c *Codec) putPCM(pcm []int16) {
	for i, s := range pcm {
		binary.LittleEndian.PutUint16(c.buf[2*i:], uint16(s))
	}
}

func (c *Codec) appendPCM(dst []int16) []int16 {
	for i := range frameSamples {
		dst = append(dst, int16(binary.LittleEndian.Uint16(c.buf[2*i:])))
	}
	return dst
}

// DecodeFrame decodes one 49-bit frame of quality q and appends 160 samples
// to dst. A frame with q.Bad set is not read. It returns ErrFrames for a
// module of ABI version 2.
func (c *Codec) DecodeFrame(dst []int16, f vocoder.AMBEFrame, q voice.FrameQuality) ([]int16, error) {
	switch {
	case c.closed:
		return dst, ErrClosed
	case c.m.version == ABIVersion2:
		return dst, ErrFrames
	}
	js.CopyBytesToJS(c.m.view(c.frame, frameBytes), f[:])
	rc, err := c.m.call(fnDecode, c.handle, c.frame, c.pcm, Quality(q))
	if err != nil {
		return dst, err
	}
	if rc != 0 {
		return dst, codeError(rc)
	}
	js.CopyBytesToGo(c.buf[:], c.m.view(c.pcm, pcmBytes))
	return c.appendPCM(dst), nil
}

// Encode encodes 160 samples into one 72-bit slot with FEC. A module of ABI
// version 2 applies the FEC itself.
func (c *Codec) Encode(pcm []int16) ([9]byte, error) {
	if c.m.version == ABIVersion2 {
		return c.encodeV2(pcm)
	}
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

func (c *Codec) encodeV2(pcm []int16) ([9]byte, error) {
	if err := c.readyV2(); err != nil {
		return [9]byte{}, err
	}
	if len(pcm) != frameSamples {
		return [9]byte{}, ErrSamples
	}
	c.putPCM(pcm)
	js.CopyBytesToJS(c.views.pcm, c.buf[:])
	rc, err := c.m.call(fnEncode, c.args.encode...)
	switch {
	case err != nil:
		return [9]byte{}, c.m.fail(err)
	case rc != 0:
		return [9]byte{}, c.m.codeV2(rc)
	}
	c.attach()
	js.CopyBytesToGo(c.slot[:], c.views.slot)
	return c.slot, nil
}

// Decode decodes one 72-bit slot and appends the 160 decoded samples to dst.
// For a module of ABI version 1 it removes the FEC, decodes the frame with
// the quality of the FEC result, and returns the report of ReportV1. A
// module of ABI version 2 gets the slot as it is and writes the report,
// which ReportV2 checks; it must not report FrameLost.
func (c *Codec) Decode(dst []int16, slot [9]byte) ([]int16, vocoder.FrameReport, error) {
	if c.m.version == ABIVersion2 {
		if err := c.readyV2(); err != nil {
			return dst, vocoder.FrameReport{}, err
		}
		c.slot = slot
		js.CopyBytesToJS(c.views.slot, c.slot[:])
		rc, err := c.m.call(fnDecode, c.args.decode...)
		return c.finishV2(dst, rc, err, false)
	}
	f, r := vocoder.DecodeAMBE72(slot)
	q := FrameQualityOf(r)
	out, err := c.DecodeFrame(dst, f, q)
	if err != nil {
		return dst, vocoder.FrameReport{}, err
	}
	return out, ReportV1(q), nil
}

// DecodeLost has the module conceal a frame that never arrived and appends
// the 160 samples to dst. A module of ABI version 1 decodes it as a bad
// frame, and DecodeLost returns LostReportV1. A module of ABI version 2
// writes the report, which must have Frame FrameLost.
func (c *Codec) DecodeLost(dst []int16) ([]int16, vocoder.FrameReport, error) {
	if c.m.version == ABIVersion2 {
		if err := c.readyV2(); err != nil {
			return dst, vocoder.FrameReport{}, err
		}
		rc, err := c.m.call(fnDecodeLost, c.args.lost...)
		return c.finishV2(dst, rc, err, true)
	}
	out, err := c.DecodeFrame(dst, vocoder.AMBEFrame{}, voice.FrameQuality{Bad: true})
	if err != nil {
		return dst, vocoder.FrameReport{}, err
	}
	return out, LostReportV1(), nil
}

func (c *Codec) finishV2(dst []int16, rc int32, err error, lost bool) ([]int16, vocoder.FrameReport, error) {
	switch {
	case err != nil:
		return dst, vocoder.FrameReport{}, c.m.fail(err)
	case rc != 0:
		return dst, vocoder.FrameReport{}, c.m.codeV2(rc)
	}
	c.attach()
	js.CopyBytesToGo(c.rep[:], c.views.report)
	r, err := ReportV2(c.rep)
	switch {
	case err != nil:
		return dst, vocoder.FrameReport{}, c.m.fail(err)
	case lost != (r.Frame == vocoder.FrameLost):
		return dst, vocoder.FrameReport{}, c.m.fail(fmt.Errorf("%w: frame %s", ErrReport, r.Frame))
	}
	js.CopyBytesToGo(c.buf[:], c.views.pcm)
	return c.appendPCM(dst), r, nil
}

// Close frees the buffers and the handle. For a broken module it makes no
// calls.
func (c *Codec) Close() error {
	if c.closed {
		return nil
	}
	c.closed = true
	if c.m.version == ABIVersion2 && c.m.isBroken() {
		return nil
	}
	var errs []error
	for _, p := range []uint32{c.pcm, c.frame, c.report} {
		if p != 0 {
			errs = append(errs, c.closeCall(fnFree, p))
		}
	}
	errs = append(errs, c.closeCall(fnClose, c.handle))
	return errors.Join(errs...)
}

func (c *Codec) closeCall(name string, arg any) error {
	rc, err := c.m.call(name, arg)
	switch {
	case err != nil && c.m.version == ABIVersion2:
		return c.m.fail(err)
	case err != nil:
		return err
	case rc != 0:
		return c.code(rc)
	}
	return nil
}

func (c *Codec) code(rc int32) error {
	if c.m.version == ABIVersion2 {
		return c.m.codeV2(rc)
	}
	return codeError(rc)
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
