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

import "encoding/binary"

const (
	opUnreachable = 0x00
	opEnd         = 0x0b
	opLocalGet    = 0x20
	opGlobalGet   = 0x23
	opGlobalSet   = 0x24
	opI64Load     = 0x29
	opI32Load8S   = 0x2c
	opI32Store8   = 0x3a
	opI64Store    = 0x37
	opI32Const    = 0x41
	opI64Const    = 0x42
	opI32Add      = 0x6a
	opI32And      = 0x71
	opMemoryGrow  = 0x40
	opDrop        = 0x1a
)

const (
	heapStart = 1024
	lostPCM   = 0x7777
)

type fakeFunc struct {
	name   string
	params int
	body   []byte
}

type fakeModule struct {
	funcs   []fakeFunc
	exports []string
	globals []string
	imports bool
}

type fakeOptions struct {
	version      int32
	versionFn    string
	lostReport   [8]byte
	newResult    int32
	newFixed     bool
	allocFixed   bool
	allocAt      int32
	trapDecode   bool
	growOnDecode bool
	resetCode    int32
	params       map[string]int
	drop         string
	extra        string
	global       string
	imports      bool
}

func uleb(b []byte, v uint64) []byte {
	return binary.AppendUvarint(b, v)
}

func sleb(b []byte, v int64) []byte {
	for {
		c := byte(v & 0x7f)
		v >>= 7
		if (v == 0 && c&0x40 == 0) || (v == -1 && c&0x40 != 0) {
			return append(b, c)
		}
		b = append(b, c|0x80)
	}
}

func i32(v int32) []byte {
	return sleb([]byte{opI32Const}, int64(v))
}

func local(i int) []byte {
	return []byte{opLocalGet, byte(i)}
}

func cat(parts ...[]byte) []byte {
	var b []byte
	for _, p := range parts {
		b = append(b, p...)
	}
	return b
}

func memarg(op byte) []byte {
	return []byte{op, 0, 0}
}

func lenPrefixed(b []byte, payload []byte) []byte {
	return append(uleb(b, uint64(len(payload))), payload...)
}

func name(b []byte, s string) []byte {
	return lenPrefixed(b, []byte(s))
}

func section(b []byte, id byte, payload []byte) []byte {
	return lenPrefixed(append(b, id), payload)
}

func vec(items [][]byte) []byte {
	b := uleb(nil, uint64(len(items)))
	for _, it := range items {
		b = append(b, it...)
	}
	return b
}

func (m *fakeModule) encode() []byte {
	out := []byte{0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00}
	types := make([][]byte, 0, 5)
	for n := range 5 {
		t := []byte{0x60}
		t = uleb(t, uint64(n))
		for range n {
			t = append(t, 0x7f)
		}
		types = append(types, append(t, 0x01, 0x7f))
	}
	out = section(out, 1, vec(types))
	base := 0
	if m.imports {
		imp := name(name(nil, "env"), "f")
		imp = append(imp, 0x00, 0x00)
		out = section(out, 2, vec([][]byte{imp}))
		base = 1
	}
	fns := make([][]byte, 0, len(m.funcs))
	for _, f := range m.funcs {
		fns = append(fns, uleb(nil, uint64(f.params)))
	}
	out = section(out, 3, vec(fns))
	out = section(out, 5, vec([][]byte{{0x00, 0x01}}))
	globals := make([][]byte, 0, 2)
	for _, g := range []int32{heapStart, 1} {
		globals = append(globals, cat([]byte{0x7f, 0x01}, i32(g), []byte{opEnd}))
	}
	out = section(out, 6, vec(globals))
	var exps [][]byte
	for _, e := range m.exports {
		if e == "memory" {
			exps = append(exps, append(name(nil, e), 0x02, 0x00))
			continue
		}
		for i, f := range m.funcs {
			if f.name == e {
				exps = append(exps, uleb(append(name(nil, e), 0x00), uint64(base+i)))
			}
		}
	}
	for _, g := range m.globals {
		exps = append(exps, append(name(nil, g), 0x03, 0x00))
	}
	out = section(out, 7, vec(exps))
	bodies := make([][]byte, 0, len(m.funcs))
	for _, f := range m.funcs {
		bodies = append(bodies, lenPrefixed(nil, cat([]byte{0x00}, f.body, []byte{opEnd})))
	}
	return section(out, 10, vec(bodies))
}

func ret(v int32) []byte {
	return i32(v)
}

func allocBody(o *fakeOptions) []byte {
	if o.allocFixed {
		return ret(o.allocAt)
	}
	return cat(
		[]byte{opGlobalGet, 0, opGlobalGet, 0}, local(0), []byte{opI32Add},
		i32(15), []byte{opI32Add}, i32(-16), []byte{opI32And, opGlobalSet, 0},
	)
}

func newBody(o *fakeOptions) []byte {
	if o.newFixed {
		return ret(o.newResult)
	}
	return cat([]byte{opGlobalGet, 1, opGlobalGet, 1}, i32(1), []byte{opI32Add, opGlobalSet, 1})
}

func decodeBody(o *fakeOptions) []byte {
	if o.trapDecode {
		return []byte{opUnreachable}
	}
	var grow []byte
	if o.growOnDecode {
		grow = cat(i32(1), []byte{opMemoryGrow, 0x00, opDrop})
	}
	return cat(
		grow,
		local(3), local(1), memarg(opI64Load), memarg(opI64Store),
		local(2), local(1), memarg(opI64Load), memarg(opI64Store),
		local(1), []byte{opI32Load8S, 0, 8},
	)
}

func lostBody(o *fakeOptions) []byte {
	return cat(
		local(2), sleb([]byte{opI64Const}, int64(binary.LittleEndian.Uint64(o.lostReport[:]))), memarg(opI64Store),
		local(1), sleb([]byte{opI64Const}, lostPCM), memarg(opI64Store),
		ret(0),
	)
}

func encodeBody() []byte {
	return cat(
		local(2), local(1), memarg(opI64Load), memarg(opI64Store),
		local(2), local(1), []byte{opI32Load8S, 0, 8}, []byte{opI32Store8, 0, 8},
		ret(0),
	)
}

func fakeV2(o fakeOptions) []byte {
	if o.version == 0 {
		o.version = 2
	}
	if o.versionFn == "" {
		o.versionFn = "ambe_version"
	}
	if o.lostReport == ([8]byte{}) {
		o.lostReport = [8]byte{0, 0, 1, 2}
	}
	params := map[string]int{
		o.versionFn: 0, "ambe_alloc": 1, "ambe_free": 1, "ambe_new": 0, "ambe_encode": 3,
		"ambe_decode": 4, "ambe_decode_lost": 3, "ambe_reset": 1, "ambe_close": 1,
	}
	for k, v := range o.params {
		params[k] = v
	}
	bodies := map[string][]byte{
		o.versionFn:        ret(o.version),
		"ambe_alloc":       allocBody(&o),
		"ambe_free":        ret(0),
		"ambe_new":         newBody(&o),
		"ambe_encode":      encodeBody(),
		"ambe_decode":      decodeBody(&o),
		"ambe_decode_lost": lostBody(&o),
		"ambe_reset":       ret(o.resetCode),
		"ambe_close":       ret(0),
	}
	names := []string{o.versionFn, "ambe_alloc", "ambe_free", "ambe_new", "ambe_encode", "ambe_decode", "ambe_decode_lost", "ambe_reset", "ambe_close"}
	if o.extra != "" {
		names = append(names, o.extra)
		params[o.extra] = 0
		bodies[o.extra] = ret(0)
	}
	m := &fakeModule{imports: o.imports, exports: []string{"memory"}}
	if o.global != "" {
		m.globals = []string{o.global}
	}
	for _, n := range names {
		if n == o.drop {
			continue
		}
		p := params[n]
		body := bodies[n]
		if p != paramsOf(n, o.versionFn) {
			body = ret(0)
		}
		m.funcs = append(m.funcs, fakeFunc{name: n, params: p, body: body})
		m.exports = append(m.exports, n)
	}
	return m.encode()
}

func paramsOf(n, versionFn string) int {
	switch n {
	case versionFn, "ambe_new":
		return 0
	case "ambe_alloc", "ambe_free", "ambe_reset", "ambe_close":
		return 1
	case "ambe_encode", "ambe_decode_lost":
		return 3
	case "ambe_decode":
		return 4
	default:
		return 0
	}
}

func fakeV1(version int32) []byte {
	m := &fakeModule{exports: []string{"memory"}}
	o := &fakeOptions{}
	add := func(n string, p int, body []byte) {
		m.funcs = append(m.funcs, fakeFunc{name: n, params: p, body: body})
		m.exports = append(m.exports, n)
	}
	add("ambe_abi_version", 0, ret(version))
	add("ambe_alloc", 1, allocBody(o))
	add("ambe_free", 1, ret(0))
	add("ambe_init", 0, newBody(o))
	add("ambe_reset", 1, ret(0))
	add("ambe_close", 1, ret(0))
	add("ambe_encode", 3, ret(0))
	add("ambe_decode", 4, ret(0))
	return m.encode()
}
