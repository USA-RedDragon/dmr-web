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

// Command radio is the WebAssembly side of the dmr-web worker. It sets the
// global dmrweb object, whose functions drive a radio.Radio with the time
// that the worker passes, and calls back into the worker for packets,
// events and audio.
package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"syscall/js"
	"time"

	"github.com/USA-RedDragon/dmr-web/wasm/ambe"
	"github.com/USA-RedDragon/dmr-web/wasm/radio"
	"github.com/USA-RedDragon/dmrgo/v2/vocoder"
	"github.com/USA-RedDragon/dmrgo/v2/vocoder/codec2"
)

var errNoRadio = errors.New("dmrweb: not started")

type bridge struct {
	r      *radio.Radio
	ambe   *ambe.Module
	choice radio.Vocoder
	send   js.Value
	event  js.Value
	audio  js.Value
	pcm    []int16
	raw    []byte
	out    []byte
	funcs  []js.Func
}

func main() {
	b := &bridge{}
	obj := js.Global().Get("Object").New()
	b.export(obj, "start", b.start)
	b.export(obj, "stop", b.stop)
	b.export(obj, "packet", b.onPacket)
	b.export(obj, "tick", b.tick)
	b.export(obj, "ptt", b.ptt)
	b.export(obj, "frame", b.frame)
	b.export(obj, "loadAmbe", b.loadAmbe)
	b.export(obj, "removeAmbe", b.removeAmbe)
	b.export(obj, "setVocoder", b.setVocoder)
	js.Global().Set("dmrweb", obj)
	select {}
}

func (b *bridge) export(obj js.Value, name string, f func(args []js.Value) any) {
	fn := js.FuncOf(func(_ js.Value, args []js.Value) any {
		return f(args)
	})
	b.funcs = append(b.funcs, fn)
	obj.Set(name, fn)
}

func at(v js.Value) time.Duration {
	ms := v.Float()
	if math.IsNaN(ms) || ms < 0 {
		return 0
	}
	return time.Duration(ms * float64(time.Millisecond))
}

func arg(args []js.Value, i int) js.Value {
	if i < len(args) {
		return args[i]
	}
	return js.Undefined()
}

func result(err error) js.Value {
	o := js.Global().Get("Object").New()
	o.Set("ok", err == nil)
	if err != nil {
		o.Set("error", err.Error())
	}
	return o
}

func (b *bridge) deadline() any {
	if b.r == nil {
		return -1
	}
	d, ok := b.r.Deadline()
	if !ok {
		return -1
	}
	return float64(d) / float64(time.Millisecond)
}

func vocoderOf(s string) radio.Vocoder {
	switch s {
	case "codec2":
		return radio.VocoderCodec2
	case "ambe":
		return radio.VocoderAMBE
	default:
		return radio.VocoderAuto
	}
}

func (b *bridge) codecs() radio.Codecs {
	c := radio.Codecs{
		Codec2: func() (vocoder.Codec, error) {
			c, err := codec2.New(nil)
			if err != nil {
				return nil, fmt.Errorf("codec2: %w", err)
			}
			return c, nil
		},
	}
	if m := b.ambe; m != nil {
		c.AMBE = func() (vocoder.Codec, error) { return m.New() }
	}
	return c
}

func (b *bridge) start(args []js.Value) any {
	cfg, cb := arg(args, 0), arg(args, 1)
	if cfg.Type() != js.TypeObject || cb.Type() != js.TypeObject {
		return result(errors.New("dmrweb: start needs a config and callbacks"))
	}
	if b.r != nil {
		b.r.Close(at(arg(args, 2)))
	}
	b.send, b.event, b.audio = cb.Get("send"), cb.Get("event"), cb.Get("audio")
	b.choice = vocoderOf(cfg.Get("vocoder").String())
	r, err := radio.New(&radio.Config{
		Hotspot:  id(cfg.Get("hotspot")),
		RadioID:  id(cfg.Get("radioId")),
		Password: []byte(cfg.Get("password").String()),
		Callsign: cfg.Get("callsign").String(),
		Options:  stringOr(cfg.Get("options")),
		Jitter:   time.Duration(cfg.Get("jitterMs").Int()) * time.Millisecond,
		Codecs:   b.codecs(),
		Vocoder:  b.choice,
	}, b)
	if err != nil {
		b.r = nil
		return result(err)
	}
	b.r = r
	return result(nil)
}

func id(v js.Value) uint32 {
	if v.Type() != js.TypeNumber {
		return 0
	}
	n := v.Int()
	if n < 0 || n > math.MaxUint32 {
		return 0
	}
	return uint32(n)
}

func stringOr(v js.Value) string {
	if v.Type() == js.TypeString {
		return v.String()
	}
	return ""
}

func (b *bridge) stop(args []js.Value) any {
	if b.r != nil {
		b.r.Close(at(arg(args, 0)))
		b.r = nil
	}
	return result(nil)
}

func (b *bridge) onPacket(args []js.Value) any {
	if b.r == nil {
		return -1
	}
	p := arg(args, 1)
	buf := make([]byte, p.Length())
	js.CopyBytesToGo(buf, p)
	b.r.Packet(at(arg(args, 0)), buf)
	return b.deadline()
}

func (b *bridge) tick(args []js.Value) any {
	if b.r == nil {
		return -1
	}
	b.r.Tick(at(arg(args, 0)))
	return b.deadline()
}

func (b *bridge) ptt(args []js.Value) any {
	if b.r == nil {
		return result(errNoRadio)
	}
	now := at(arg(args, 0))
	if !arg(args, 1).Bool() {
		b.r.StopTransmit()
		return result(nil)
	}
	err := b.r.StartTransmit(now, arg(args, 2).Int(), arg(args, 3).Bool(), id(arg(args, 4)))
	return result(err)
}

func (b *bridge) frame(args []js.Value) any {
	if b.r == nil {
		return result(errNoRadio)
	}
	p := arg(args, 0)
	n := p.Length()
	bytes := js.Global().Get("Uint8Array").New(p.Get("buffer"), p.Get("byteOffset"), 2*n)
	if cap(b.raw) < 2*n {
		b.raw = make([]byte, 2*n)
		b.pcm = make([]int16, n)
	}
	b.raw, b.pcm = b.raw[:2*n], b.pcm[:n]
	js.CopyBytesToGo(b.raw, bytes)
	for i := range n {
		b.pcm[i] = int16(binary.LittleEndian.Uint16(b.raw[2*i:]))
	}
	return result(b.r.Frame(b.pcm))
}

func (b *bridge) loadAmbe(args []js.Value) any {
	p := arg(args, 0)
	buf := make([]byte, p.Length())
	js.CopyBytesToGo(buf, p)
	m, err := ambe.Load(buf)
	if err == nil {
		err = m.SelfTest()
	}
	if err != nil {
		return result(err)
	}
	b.ambe = m
	if b.r != nil {
		b.r.SetAMBE(b.codecs().AMBE)
	}
	o := result(nil)
	o.Set("version", m.Version())
	return o
}

func (b *bridge) removeAmbe([]js.Value) any {
	b.ambe = nil
	if b.r != nil {
		b.r.SetAMBE(nil)
	}
	return result(nil)
}

func (b *bridge) setVocoder(args []js.Value) any {
	b.choice = vocoderOf(arg(args, 0).String())
	if b.r != nil {
		b.r.SetVocoder(b.choice)
	}
	o := result(nil)
	if b.r != nil {
		o.Set("transmit", b.r.TransmitVocoder().String())
	}
	return o
}

// Send passes a datagram to the worker.
func (b *bridge) Send(p []byte) {
	a := js.Global().Get("Uint8Array").New(len(p))
	js.CopyBytesToJS(a, p)
	b.send.Invoke(a)
}

// Event passes an event to the worker as a plain object.
func (b *bridge) Event(e *radio.Event) {
	o := js.Global().Get("Object").New()
	o.Set("kind", e.Kind.String())
	o.Set("slot", e.Slot)
	o.Set("group", e.Group)
	o.Set("target", e.Target)
	o.Set("source", e.Source)
	o.Set("fid", e.FID)
	o.Set("vocoder", e.Vocoder.String())
	o.Set("text", e.Text)
	o.Set("latitude", e.Latitude)
	o.Set("longitude", e.Longitude)
	o.Set("reason", e.Reason)
	if e.Err != nil {
		o.Set("error", e.Err.Error())
	}
	b.event.Invoke(o)
}

// Audio passes decoded PCM of a slot to the worker.
func (b *bridge) Audio(slot int, pcm []int16) {
	if cap(b.out) < 2*len(pcm) {
		b.out = make([]byte, 2*len(pcm))
	}
	b.out = b.out[:2*len(pcm)]
	for i, s := range pcm {
		binary.LittleEndian.PutUint16(b.out[2*i:], uint16(s))
	}
	a := js.Global().Get("Int16Array").New(len(pcm))
	js.CopyBytesToJS(js.Global().Get("Uint8Array").New(a.Get("buffer")), b.out)
	b.audio.Invoke(slot, a)
}
