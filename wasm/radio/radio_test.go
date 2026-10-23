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

package radio_test

import (
	"testing"
	"time"

	"github.com/USA-RedDragon/dmr-web/wasm/radio"
	"github.com/USA-RedDragon/dmrgo/v2/enums"
	"github.com/USA-RedDragon/dmrgo/v2/layer2"
	"github.com/USA-RedDragon/dmrgo/v2/transport/dmrd"
	"github.com/USA-RedDragon/dmrgo/v2/transport/dmrd/dmrdsession"
	"github.com/USA-RedDragon/dmrgo/v2/vocoder"
	"github.com/USA-RedDragon/dmrgo/v2/voice"
	"github.com/stretchr/testify/require"
)

const (
	hotspotID = 310000101
	radioID   = 3100001
	step      = 10 * time.Millisecond
)

type fakeCodec struct {
	fid    enums.FID
	closed bool
}

func (c *fakeCodec) Close() error      { c.closed = true; return nil }
func (c *fakeCodec) FrameSamples() int { return 160 }
func (c *fakeCodec) Reset()            {}
func (c *fakeCodec) Silence() [9]byte  { return [9]byte{} }
func (c *fakeCodec) FID() enums.FID    { return c.fid }

func (c *fakeCodec) Encode(pcm []int16) ([9]byte, error) {
	var s [9]byte
	s[0] = byte(pcm[0])
	return s, nil
}

func (c *fakeCodec) Decode(dst []int16, slot [9]byte) ([]int16, error) {
	for range 160 {
		dst = append(dst, int16(slot[0]))
	}
	return dst, nil
}

type sink struct {
	sent   [][]byte
	events []radio.Event
	audio  map[int]int
}

func (s *sink) Send(p []byte) { s.sent = append(s.sent, append([]byte(nil), p...)) }
func (s *sink) Event(e *radio.Event) {
	s.events = append(s.events, *e)
}

func (s *sink) Audio(slot int, pcm []int16) {
	if s.audio == nil {
		s.audio = map[int]int{}
	}
	s.audio[slot] += len(pcm)
}

func (s *sink) has(k radio.EventKind) bool {
	for _, e := range s.events {
		if e.Kind == k {
			return true
		}
	}
	return false
}

func (s *sink) first(k radio.EventKind) (radio.Event, bool) {
	for _, e := range s.events {
		if e.Kind == k {
			return e, true
		}
	}
	return radio.Event{}, false
}

type hub struct {
	t      *testing.T
	m      *dmrdsession.Master
	r      *radio.Radio
	s      *sink
	now    time.Duration
	data   []dmrd.Data
	codecs []*fakeCodec
}

func newHub(t *testing.T, ambe bool) *hub {
	t.Helper()
	m, err := dmrdsession.NewMaster(&dmrdsession.MasterConfig{Dialect: dmrd.DialectMMDVM})
	require.NoError(t, err)
	h := &hub{t: t, m: m, s: &sink{}}
	codecs := radio.Codecs{
		Codec2: func() (vocoder.Codec, error) {
			c := &fakeCodec{fid: 0xC2}
			h.codecs = append(h.codecs, c)
			return c, nil
		},
	}
	if ambe {
		codecs.AMBE = func() (vocoder.Codec, error) {
			c := &fakeCodec{fid: enums.FIDStandardized}
			h.codecs = append(h.codecs, c)
			return c, nil
		}
	}
	r, err := radio.New(&radio.Config{
		Hotspot:  hotspotID,
		RadioID:  radioID,
		Password: []byte("secret"),
		Callsign: "N0CALL",
		Options:  "TS2=1",
		Codecs:   codecs,
	}, h.s)
	require.NoError(t, err)
	h.r = r
	return h
}

func (h *hub) pump() {
	for range 16 {
		sent := h.s.sent
		h.s.sent = nil
		if len(sent) == 0 {
			return
		}
		for _, p := range sent {
			for _, o := range h.m.Packet(h.now, p, nil) {
				h.master(o)
			}
		}
	}
}

func (h *hub) master(o dmrdsession.Output) {
	switch o.Kind {
	case dmrdsession.OutputSend:
		h.r.Packet(h.now, o.Packet)
	case dmrdsession.OutputLogin:
		for _, x := range h.m.Admit(h.now, 0x12345678, []byte("secret"), nil) {
			h.master(x)
		}
	case dmrdsession.OutputConfig:
		for _, x := range h.m.Accept(h.now, nil) {
			h.master(x)
		}
	case dmrdsession.OutputData:
		if o.Command == dmrd.CommandDMRD {
			d, err := dmrd.DecodeData(o.Packet)
			require.NoError(h.t, err)
			h.data = append(h.data, d)
		}
	default:
	}
}

func (h *hub) advance(d time.Duration) {
	end := h.now + d
	for h.now <= end {
		h.r.Tick(h.now)
		h.pump()
		h.now += step
	}
}

func (h *hub) login() {
	h.advance(100 * time.Millisecond)
	require.True(h.t, h.r.Up())
	require.True(h.t, h.s.has(radio.EventUp))
}

func TestLogin(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	require.Equal(t, uint32(hotspotID), h.m.ID())
}

func TestTransmitNeedsLogin(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	require.ErrorIs(t, h.r.StartTransmit(0, 2, true, 1), radio.ErrNotConnected)
}

func TestTransmitChecksArguments(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	require.ErrorIs(t, h.r.StartTransmit(h.now, 3, true, 1), radio.ErrSlot)
	require.ErrorIs(t, h.r.StartTransmit(h.now, 1, true, 0), radio.ErrTarget)
	require.ErrorIs(t, h.r.StartTransmit(h.now, 1, true, 1<<24), radio.ErrTarget)
}

func TestTransmitVocoder(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	require.Equal(t, radio.VocoderCodec2, h.r.TransmitVocoder())
	h.r.SetVocoder(radio.VocoderAMBE)
	require.Equal(t, radio.VocoderCodec2, h.r.TransmitVocoder())

	a := newHub(t, true)
	require.Equal(t, radio.VocoderAMBE, a.r.TransmitVocoder())
	a.r.SetVocoder(radio.VocoderCodec2)
	require.Equal(t, radio.VocoderCodec2, a.r.TransmitVocoder())
	a.r.SetAMBE(nil)
	a.r.SetVocoder(radio.VocoderAuto)
	require.Equal(t, radio.VocoderCodec2, a.r.TransmitVocoder())
}

func TestTransmitCall(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	require.NoError(t, h.r.StartTransmit(h.now, 2, true, 91))
	require.True(t, h.r.Transmitting())
	pcm := make([]int16, 160)
	for i := range 30 {
		pcm[0] = int16(i)
		require.NoError(t, h.r.Frame(pcm))
		h.advance(20 * time.Millisecond)
	}
	h.r.StopTransmit()
	h.advance(time.Second)
	require.False(t, h.r.Transmitting())
	end, ok := h.s.first(radio.EventTransmitEnd)
	require.True(t, ok)
	require.Equal(t, 2, end.Slot)

	require.NotEmpty(t, h.data)
	rv, err := voice.NewReceiver(&voice.ReceiverConfig{})
	require.NoError(t, err)
	var started, ended bool
	for i := range h.data {
		d := &h.data[i]
		require.Equal(t, enums.Slot2, d.Slot)
		require.False(t, d.Private)
		require.Equal(t, uint32(91), d.Destination)
		require.Equal(t, uint32(radioID), d.Source)
		require.Equal(t, uint32(hotspotID), d.Repeater)
		require.Equal(t, uint8(i), d.Seq)
		for _, e := range rv.Burst(time.Duration(i)*60*time.Millisecond, &d.Burst, d.Hint(0), nil) {
			switch e.Kind {
			case voice.EventCallStart:
				started = true
				require.Equal(t, enums.FID(0xC2), e.Call.FID)
				require.Equal(t, uint32(91), e.Call.Target)
			case voice.EventCallEnd:
				ended = true
			default:
			}
		}
	}
	require.True(t, started)
	require.True(t, ended)
}

func TestReceiveCall(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()

	tx, err := voice.NewTransmitter(&voice.TransmitterConfig{ColorCode: 1, Slot: enums.Slot1, Source: layer2.SyncSourceBS, Queue: 64})
	require.NoError(t, err)
	call := voice.Call{Group: true, Target: 8, Source: 3100002, FID: 0xC2}
	require.NoError(t, tx.Start(0, call, nil))
	for i := range 18 {
		var s [9]byte
		s[0] = byte(i + 1)
		require.NoError(t, tx.VocoderSlot(s))
	}
	tx.Stop()

	var seq uint8
	start := h.now
	for at := time.Duration(0); at < 2*time.Second; at += step {
		for _, o := range tx.Tick(at, nil) {
			if o.Kind != voice.OutputBurst {
				continue
			}
			d := dmrd.Data{Seq: seq, Repeater: 1, Slot: enums.Slot1, Stream: 0xABCDEF01, Burst: o.Burst}
			seq++
			require.NoError(t, d.SetCall(true, 8, 3100002))
			require.NoError(t, d.SetHint(o.Hint))
			b, err := d.AppendBinary(nil)
			require.NoError(t, err)
			h.r.Packet(h.now, b)
		}
		h.r.Tick(h.now)
		h.pump()
		h.now = start + at
	}
	h.advance(5 * time.Second)

	c, ok := h.s.first(radio.EventCallStart)
	require.True(t, ok)
	require.Equal(t, 1, c.Slot)
	require.True(t, c.Group)
	require.Equal(t, uint32(8), c.Target)
	require.Equal(t, uint32(3100002), c.Source)
	require.Equal(t, radio.VocoderCodec2, c.Vocoder)
	require.Equal(t, 18*160, h.s.audio[1])
	require.True(t, h.s.has(radio.EventCallEnd))
}

func TestCloseClosesCodecs(t *testing.T) {
	t.Parallel()
	h := newHub(t, false)
	h.login()
	require.NoError(t, h.r.StartTransmit(h.now, 1, true, 9))
	h.r.Close(h.now)
	require.False(t, h.r.Up())
	require.True(t, h.s.has(radio.EventDown))
	for _, c := range h.codecs {
		require.True(t, c.closed)
	}
}

func TestTransmit(t *testing.T) {
	t.Parallel()
	require.Equal(t, radio.VocoderAMBE, radio.Transmit(radio.VocoderAuto, true))
	require.Equal(t, radio.VocoderCodec2, radio.Transmit(radio.VocoderAuto, false))
	require.Equal(t, radio.VocoderCodec2, radio.Transmit(radio.VocoderCodec2, true))
	require.Equal(t, radio.VocoderAMBE, radio.Transmit(radio.VocoderAMBE, true))
	require.Equal(t, radio.VocoderCodec2, radio.Transmit(radio.VocoderAMBE, false))
}
