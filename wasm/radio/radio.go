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

// Package radio is the DMR radio of dmr-web: an MMDVM hotspot session with
// two receive slots and a transmitter. It is sans-IO: every method takes
// the time from the caller, packets go out through a Sink, and Deadline
// says when to call Tick next.
package radio

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"time"

	"github.com/USA-RedDragon/dmrgo/v2/enums"
	"github.com/USA-RedDragon/dmrgo/v2/layer2"
	"github.com/USA-RedDragon/dmrgo/v2/transport/dmrd"
	"github.com/USA-RedDragon/dmrgo/v2/transport/dmrd/dmrdsession"
	"github.com/USA-RedDragon/dmrgo/v2/vocoder"
	"github.com/USA-RedDragon/dmrgo/v2/voice"
)

const (
	slots       = 2
	maxTarget   = 1<<24 - 1
	txLead      = 120 * time.Millisecond
	maxLostFill = 5
	softwareID  = "dmr-web"
	colorCode   = enums.ColorCode(1)
)

// Config configures a Radio.
type Config struct {
	// Hotspot is the hotspot ID that the radio logs in as.
	Hotspot uint32
	// RadioID is the DMR ID of the user, the source of transmissions.
	RadioID uint32
	// Password is the hotspot password.
	Password []byte
	// Callsign goes in the RPTC configuration.
	Callsign string
	// Options is the RPTO options text, such as "TS1=8;TS2=1", or empty.
	Options string
	// Jitter is the playout delay of received voice; 0 is the dmrgo default.
	Jitter time.Duration
	// Codecs makes the vocoders.
	Codecs Codecs
	// Vocoder is the transmit vocoder choice.
	Vocoder Vocoder
	// ARS sends a MOTOTRBO ARS registration after each login, which also
	// tells the hub where to send private calls and texts for RadioID.
	ARS bool
}

// Sink takes what the radio produces. Send and Audio must copy what they
// keep, since the radio reuses the slices.
type Sink interface {
	Send(packet []byte)
	Event(e *Event)
	Audio(slot int, pcm []int16)
}

type rxSlot struct {
	jitter  *voice.Jitter
	recv    *voice.Receiver
	events  []voice.Event
	codec   vocoder.Codec
	vocoder Vocoder
	active  bool
}

type txState struct {
	t      *voice.Transmitter
	codec  vocoder.Codec
	cv     Vocoder
	slot   enums.Slot
	call   voice.Call
	seq    uint8
	stream uint32
	out    []voice.Output
	active bool
}

// Radio is the radio. It is not safe for concurrent use.
type Radio struct {
	cfg        Config
	codecs     Codecs
	choice     Vocoder
	sink       Sink
	peer       *dmrdsession.Peer
	out        []dmrdsession.Output
	rx         [slots]rxSlot
	tx         txState
	dslots     [slots]dataSlot
	up         bool
	buf        []byte
	pcm        []int16
	text       []byte
	tmsSeq     uint8
	tmsWait    map[uint8]uint32
	nextStream uint32
}

// New returns a radio for cfg that reports to sink. The first Tick starts
// the login.
func New(cfg *Config, sink Sink) (*Radio, error) {
	if cfg == nil {
		return nil, fmt.Errorf("radio: %w", ErrNotConnected)
	}
	rptc, err := rptcFor(cfg)
	if err != nil {
		return nil, err
	}
	peer, err := dmrdsession.NewPeer(&dmrdsession.PeerConfig{
		Dialect:  dmrd.DialectMMDVM,
		ID:       cfg.Hotspot,
		Password: cfg.Password,
		Config:   rptc,
		Options:  []byte(cfg.Options),
	})
	if err != nil {
		return nil, fmt.Errorf("radio: session: %w", err)
	}
	r := &Radio{
		cfg:     *cfg,
		codecs:  cfg.Codecs,
		choice:  cfg.Vocoder,
		sink:    sink,
		peer:    peer,
		out:     make([]dmrdsession.Output, 0, dmrdsession.MaxOutputs),
		buf:     make([]byte, 0, dmrdsession.MaxPacket),
		pcm:     make([]int16, 0, 160*maxLostFill*layer2.VoiceSlotsPerBurst),
		tmsWait: map[uint8]uint32{},
	}
	for i := range r.rx {
		j, err := voice.NewJitter(&voice.JitterConfig{Delay: cfg.Jitter})
		if err != nil {
			return nil, fmt.Errorf("radio: jitter: %w", err)
		}
		rv, err := voice.NewReceiver(&voice.ReceiverConfig{})
		if err != nil {
			return nil, fmt.Errorf("radio: receiver: %w", err)
		}
		r.rx[i] = rxSlot{jitter: j, recv: rv, events: make([]voice.Event, 0, voice.MaxEvents)}
		es := enums.Slot1
		if i == 1 {
			es = enums.Slot2
		}
		ds, err := newDataSlot(cfg, es)
		if err != nil {
			return nil, err
		}
		r.dslots[i] = ds
	}
	return r, nil
}

func rptcFor(cfg *Config) ([]byte, error) {
	var c dmrd.MMDVMConfig
	c.Reset()
	c.SetID(cfg.Hotspot)
	if err := c.SetCallsign([]byte(cfg.Callsign)); err != nil {
		return nil, fmt.Errorf("radio: callsign: %w", err)
	}
	if err := c.SetColorCode(colorCode); err != nil {
		return nil, fmt.Errorf("radio: color code: %w", err)
	}
	if err := c.SetSlots(3); err != nil {
		return nil, fmt.Errorf("radio: slots: %w", err)
	}
	if err := c.SetSoftwareID([]byte(softwareID)); err != nil {
		return nil, fmt.Errorf("radio: software ID: %w", err)
	}
	if err := c.SetPackageID([]byte(softwareID)); err != nil {
		return nil, fmt.Errorf("radio: package ID: %w", err)
	}
	if err := c.SetDescription([]byte("dmr-web radio")); err != nil {
		return nil, fmt.Errorf("radio: description: %w", err)
	}
	return c[:], nil
}

// Up reports whether the hotspot is logged in.
func (r *Radio) Up() bool {
	return r.up
}

// Transmitting reports whether a transmission is running.
func (r *Radio) Transmitting() bool {
	return r.tx.active
}

// SetVocoder sets the transmit vocoder choice. It applies from the next
// transmission.
func (r *Radio) SetVocoder(v Vocoder) {
	r.choice = v
}

// SetAMBE sets the AMBE codec factory, nil when no module is loaded. Codecs
// made by the old factory are closed when their stream ends.
func (r *Radio) SetAMBE(f func() (vocoder.Codec, error)) {
	r.codecs.AMBE = f
	for i := range r.rx {
		if r.rx[i].vocoder == VocoderAMBE && !r.rx[i].active {
			r.closeRX(i)
		}
	}
	if r.tx.cv == VocoderAMBE && !r.tx.active {
		r.closeTX()
	}
}

// TransmitVocoder returns the vocoder that the next transmission uses.
func (r *Radio) TransmitVocoder() Vocoder {
	return r.txVocoder()
}

// Deadline returns when Tick must run next. ok is false when nothing waits.
func (r *Radio) Deadline() (at time.Duration, ok bool) {
	at, ok = r.peer.Deadline()
	consider := func(t time.Duration, has bool) {
		if has && (!ok || t < at) {
			at, ok = t, true
		}
	}
	for i := range r.rx {
		consider(r.rx[i].jitter.Deadline())
		consider(r.rx[i].recv.Deadline())
		r.dslots[i].deadline(consider)
	}
	if r.tx.active {
		consider(r.tx.t.Deadline())
	}
	return at, ok
}

// Tick runs the timers that are due at now.
func (r *Radio) Tick(now time.Duration) {
	r.out = r.peer.Tick(now, r.out[:0])
	r.handle(now)
	for i := range r.rx {
		r.drain(now, i)
		r.dataTick(now, i)
	}
	r.txTick(now)
}

// Packet takes one datagram from the hub.
func (r *Radio) Packet(now time.Duration, b []byte) {
	r.out = r.peer.Packet(now, b, r.out[:0])
	r.handle(now)
}

// Close logs out and closes the codecs.
func (r *Radio) Close(now time.Duration) {
	r.out = r.peer.Close(now, r.out[:0])
	r.handle(now)
	for i := range r.rx {
		r.closeRX(i)
	}
	r.tx.active = false
	r.closeTX()
}

func (r *Radio) handle(now time.Duration) {
	for i := range r.out {
		o := &r.out[i]
		switch o.Kind {
		case dmrdsession.OutputSend:
			r.sink.Send(o.Packet)
		case dmrdsession.OutputUp:
			r.up = true
			r.sink.Event(&Event{Kind: EventUp})
			if r.cfg.ARS {
				if err := r.Register(now); err != nil {
					r.sink.Event(&Event{Kind: EventRegistered, Slot: arsSlot, Reason: err.Error()})
				}
			}
		case dmrdsession.OutputDown:
			r.down(o.Reason.String())
		case dmrdsession.OutputData:
			if o.Command == dmrd.CommandDMRD {
				r.data(now, o.Packet)
			}
		default:
		}
	}
}

func (r *Radio) down(reason string) {
	r.up = false
	for i := range r.rx {
		r.rx[i].jitter.Reset()
		r.rx[i].recv.Reset()
		r.dslots[i].reset()
		if r.rx[i].active {
			r.rx[i].active = false
			r.sink.Event(&Event{Kind: EventCallEnd, Slot: i + 1, Reason: "disconnected"})
		}
	}
	if r.tx.active {
		r.tx.active = false
		r.sink.Event(&Event{Kind: EventTransmitEnd, Slot: slotNumber(r.tx.slot), Reason: "disconnected"})
	}
	r.sink.Event(&Event{Kind: EventDown, Reason: reason})
}

func (r *Radio) data(now time.Duration, b []byte) {
	d, err := dmrd.DecodeData(b)
	if err != nil {
		r.sink.Event(&Event{Kind: EventError, Err: fmt.Errorf("radio: DMRD: %w", err)})
		return
	}
	i, ok := slotIndex(d.Slot)
	if !ok {
		return
	}
	h := d.Hint(now)
	if r.rx[i].jitter.Push(now, &d.Burst, h, d.Source) == voice.JitterBypass {
		r.receive(now, i, &d.Burst, h)
	}
	r.drain(now, i)
	r.dataIn(now, i, &d, h)
}

func (r *Radio) drain(now time.Duration, i int) {
	s := &r.rx[i]
	var p voice.JitterPacket
	for s.jitter.Pop(now, &p) {
		if p.HasBurst {
			r.receive(p.Due, i, &p.Burst, p.Hint)
		}
	}
	s.events = s.recv.Tick(now, s.events[:0])
	r.events(now, i)
}

func (r *Radio) receive(at time.Duration, i int, raw *layer2.RawBurst, h layer2.Hint) {
	s := &r.rx[i]
	s.events = s.recv.Burst(at, raw, h, s.events[:0])
	r.events(at, i)
}

func (r *Radio) events(now time.Duration, i int) {
	s := &r.rx[i]
	for k := range s.events {
		e := &s.events[k]
		switch e.Kind {
		case voice.EventCallStart:
			r.callStart(i, &e.Call)
			r.channel(now, i)
		case voice.EventVoice:
			r.voice(i, e)
		case voice.EventEmbedded:
			if gps, ok := e.LC.AsGPSInfo(); ok {
				r.sink.Event(&Event{Kind: EventPosition, Slot: i + 1, Source: e.Call.Source, Latitude: gps.Latitude, Longitude: gps.Longitude})
			}
		case voice.EventTalkerAlias:
			r.sink.Event(&Event{Kind: EventTalkerAlias, Slot: i + 1, Source: e.Call.Source, Text: string(e.Text)})
		case voice.EventCallEnd:
			if s.active {
				s.active = false
				r.sink.Event(&Event{Kind: EventCallEnd, Slot: i + 1, Group: e.Call.Group, Target: e.Call.Target, Source: e.Call.Source, Reason: e.Reason.String()})
				r.channel(now, i)
			}
		default:
		}
	}
}

func (r *Radio) callStart(i int, c *voice.Call) {
	s := &r.rx[i]
	v := rxVocoder(c.FID)
	if s.codec == nil || s.vocoder != v {
		r.closeRX(i)
		codec, err := r.newCodec(v)
		if err != nil {
			r.sink.Event(&Event{Kind: EventError, Slot: i + 1, Err: err})
		} else {
			s.codec = codec
		}
		s.vocoder = v
	}
	if s.codec != nil {
		s.codec.Reset()
	}
	s.active = true
	r.sink.Event(&Event{
		Kind:    EventCallStart,
		Slot:    i + 1,
		Group:   c.Group,
		Target:  c.Target,
		Source:  c.Source,
		FID:     uint8(c.FID),
		Vocoder: v,
	})
}

func (r *Radio) voice(i int, e *voice.Event) {
	s := &r.rx[i]
	if s.codec == nil {
		return
	}
	pcm := r.pcm[:0]
	qd, quality := s.codec.(QualityDecoder)
	if quality && e.Lost > 0 {
		lost := min(int(e.Lost), maxLostFill) * layer2.VoiceSlotsPerBurst
		for range lost {
			if out, err := qd.DecodeQuality(pcm, [9]byte{}, voice.FrameQuality{Bad: true}); err == nil {
				pcm = out
			}
		}
	}
	frames := e.Burst.VoiceSlots()
	for k, f := range frames {
		var out []int16
		var err error
		if quality {
			out, err = qd.DecodeQuality(pcm, f, e.Frames[k])
		} else {
			out, err = s.codec.Decode(pcm, f)
		}
		if err != nil {
			r.sink.Event(&Event{Kind: EventError, Slot: i + 1, Err: fmt.Errorf("radio: decode: %w", err)})
			continue
		}
		pcm = out
	}
	r.pcm = pcm
	if len(pcm) > 0 {
		r.sink.Audio(i+1, pcm)
	}
}

func (r *Radio) closeRX(i int) {
	s := &r.rx[i]
	if s.codec != nil {
		if err := s.codec.Close(); err != nil {
			r.sink.Event(&Event{Kind: EventError, Slot: i + 1, Err: fmt.Errorf("radio: close codec: %w", err)})
		}
		s.codec = nil
	}
}

func (r *Radio) closeTX() {
	if r.tx.codec != nil {
		if err := r.tx.codec.Close(); err != nil {
			r.sink.Event(&Event{Kind: EventError, Err: fmt.Errorf("radio: close codec: %w", err)})
		}
		r.tx.codec = nil
	}
}

// StartTransmit starts a transmission on slot 1 or 2 to the talkgroup or
// radio target. Voice frames go in with Frame, and StopTransmit ends it.
func (r *Radio) StartTransmit(now time.Duration, slot int, group bool, target uint32) error {
	switch {
	case !r.up:
		return ErrNotConnected
	case r.tx.active:
		return ErrBusy
	case slot != 1 && slot != 2:
		return ErrSlot
	case target == 0 || target > maxTarget:
		return ErrTarget
	}
	v := r.txVocoder()
	if r.tx.codec == nil || r.tx.cv != v {
		r.closeTX()
		codec, err := r.newCodec(v)
		if err != nil {
			return err
		}
		r.tx.codec, r.tx.cv = codec, v
	}
	r.tx.codec.Reset()
	es := enums.Slot1
	if slot == 2 {
		es = enums.Slot2
	}
	t, err := voice.NewTransmitter(&voice.TransmitterConfig{
		ColorCode: colorCode,
		Slot:      es,
		Source:    layer2.SyncSourceMS,
		Silence:   r.tx.codec.Silence(),
		Access:    enums.AccessImpolite,
	})
	if err != nil {
		return fmt.Errorf("radio: transmitter: %w", err)
	}
	call := voice.Call{Group: group, Target: target, Source: r.cfg.RadioID, FID: r.tx.codec.FID()}
	if err := t.Start(now+txLead, call, nil); err != nil {
		return fmt.Errorf("radio: start: %w", err)
	}
	r.tx.t, r.tx.slot, r.tx.call = t, es, call
	r.tx.seq, r.tx.stream, r.tx.active = 0, r.streamID(), true
	r.channel(now, slot-1)
	if r.tx.out == nil {
		r.tx.out = make([]voice.Output, 0, 4)
	}
	r.sink.Event(&Event{Kind: EventTransmitStart, Slot: slot, Group: group, Target: target, Source: r.cfg.RadioID, FID: uint8(call.FID), Vocoder: v})
	return nil
}

// Frame takes one frame of PCM from the microphone: 160 samples at 8 kHz.
// It does nothing while no transmission runs.
func (r *Radio) Frame(pcm []int16) error {
	if !r.tx.active {
		return nil
	}
	s, err := r.tx.codec.Encode(pcm)
	if err != nil {
		return fmt.Errorf("radio: encode: %w", err)
	}
	if err := r.tx.t.VocoderSlot(s); err != nil {
		return fmt.Errorf("radio: queue: %w", err)
	}
	return nil
}

// StopTransmit ends the transmission after the frames already queued.
func (r *Radio) StopTransmit() {
	if r.tx.active {
		r.tx.t.Stop()
	}
}

func (r *Radio) txTick(now time.Duration) {
	for r.tx.active {
		r.tx.out = r.tx.t.Tick(now, r.tx.out[:0])
		if len(r.tx.out) == 0 {
			return
		}
		for k := range r.tx.out {
			r.txOutput(now, &r.tx.out[k])
		}
	}
}

func (r *Radio) txOutput(now time.Duration, o *voice.Output) {
	switch o.Kind {
	case voice.OutputBurst:
		if !r.up {
			return
		}
		d := dmrd.Data{
			Seq:      r.tx.seq,
			Repeater: r.cfg.Hotspot,
			Slot:     r.tx.slot,
			Stream:   r.tx.stream,
			Burst:    o.Burst,
		}
		r.tx.seq++
		if err := d.SetCall(r.tx.call.Group, r.tx.call.Target, r.tx.call.Source); err != nil {
			r.sink.Event(&Event{Kind: EventError, Err: fmt.Errorf("radio: call: %w", err)})
			return
		}
		if err := d.SetHint(o.Hint); err != nil {
			r.sink.Event(&Event{Kind: EventError, Err: fmt.Errorf("radio: hint: %w", err)})
			return
		}
		b, err := d.AppendBinary(r.buf[:0])
		if err != nil {
			r.sink.Event(&Event{Kind: EventError, Err: fmt.Errorf("radio: DMRD: %w", err)})
			return
		}
		r.buf = b
		r.sink.Send(b)
	case voice.OutputEnded:
		r.tx.active = false
		if i, ok := slotIndex(r.tx.slot); ok {
			r.channel(now, i)
		}
		r.sink.Event(&Event{Kind: EventTransmitEnd, Slot: slotNumber(r.tx.slot), Target: r.tx.call.Target, Reason: o.Reason.String()})
	default:
	}
}

func (r *Radio) streamID() uint32 {
	var id [4]byte
	if _, err := rand.Read(id[:]); err != nil {
		r.nextStream++
		return r.nextStream
	}
	return binary.BigEndian.Uint32(id[:])
}

func slotIndex(s enums.Slot) (int, bool) {
	switch s {
	case enums.Slot1:
		return 0, true
	case enums.Slot2:
		return 1, true
	default:
		return 0, false
	}
}

func slotNumber(s enums.Slot) int {
	if i, ok := slotIndex(s); ok {
		return i + 1
	}
	return 0
}
