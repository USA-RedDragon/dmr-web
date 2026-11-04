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
import { describe, expect, it } from 'vitest';

import { ListenLink, listenURL, parseListen, POLICY_CLOSE, tuneMessage, type ListenMessage, type SocketConstructor } from '@/radio/listen';

describe('listenURL', () => {
  it('opens the monitor of the hub over TLS unless the hub is plain HTTP', () => {
    expect(listenURL('dmrhub.example.org')).toBe('wss://dmrhub.example.org/ws/listen');
    expect(listenURL('https://dmrhub.example.org/')).toBe('wss://dmrhub.example.org/ws/listen');
    expect(listenURL('http://127.0.0.1:3005')).toBe('ws://127.0.0.1:3005/ws/listen');
  });
});

describe('parseListen', () => {
  it('reads the hello, the tune answer and a call', () => {
    expect(parseListen('{"type":"hello","network":"Demo","talkgroups":[{"id":91,"name":"World"},{"id":0},{"name":"x"}]}')).toEqual({
      type: 'hello',
      network: 'Demo',
      talkgroups: [{ id: 91, name: 'World' }],
    });
    expect(parseListen('{"type":"tuned","talkgroup":0,"error":"no"}')).toEqual({ type: 'tuned', talkgroup: 0, error: 'no' });
    expect(
      parseListen('{"type":"call","talkgroup":91,"source":3000001,"callsign":"N0CALL","repeater":{"id":300000101,"callsign":"N0CALL"},"alias":"","active":true,"duration_ms":1200}'),
    ).toEqual({
      type: 'call',
      talkgroup: 91,
      source: 3000001,
      callsign: 'N0CALL',
      repeater: { id: 300000101, callsign: 'N0CALL' },
      alias: '',
      active: true,
      durationMs: 1200,
    });
  });

  it('drops what it does not know', () => {
    expect(parseListen('not json')).toBeNull();
    expect(parseListen('{"type":"voice"}')).toBeNull();
    expect(parseListen('null')).toBeNull();
  });
});

class FakeSocket {
  static last: FakeSocket;
  binaryType = 'blob';
  readyState = 0;
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }
}

function link() {
  const got = { open: 0, packets: [] as Uint8Array[], messages: [] as ListenMessage[], closed: [] as [string, boolean][] };
  const l = new ListenLink(
    {
      onOpen: () => got.open++,
      onPacket: (p) => got.packets.push(p),
      onMessage: (m) => got.messages.push(m),
      onClosed: (r, refused) => got.closed.push([r, refused]),
    },
    FakeSocket as unknown as SocketConstructor,
  );
  return { l, got };
}

describe('ListenLink', () => {
  it('takes packets as bytes and messages as text, and sends only tunes', () => {
    const { l, got } = link();
    l.open('dmrhub.example.org');
    const ws = FakeSocket.last;
    expect(ws.url).toBe('wss://dmrhub.example.org/ws/listen');
    expect(ws.binaryType).toBe('arraybuffer');
    l.tune(91);
    expect(ws.sent).toEqual([]);
    ws.readyState = 1;
    ws.onopen?.();
    l.tune(91);
    ws.onmessage?.({ data: new Uint8Array([0x44, 0x4d, 0x52, 0x44]).buffer });
    ws.onmessage?.({ data: '{"type":"tuned","talkgroup":91}' });
    expect(got.open).toBe(1);
    expect(ws.sent).toEqual([tuneMessage(91)]);
    expect(got.packets).toEqual([new Uint8Array([0x44, 0x4d, 0x52, 0x44])]);
    expect(got.messages).toEqual([{ type: 'tuned', talkgroup: 91, error: '' }]);
  });

  it('reports a refusal of the hub apart from a lost connection', () => {
    const { l, got } = link();
    l.open('dmrhub.example.org');
    FakeSocket.last.onclose?.({ code: POLICY_CLOSE, reason: 'too many listeners, try again later' });
    l.open('dmrhub.example.org');
    FakeSocket.last.onclose?.({ code: 1006, reason: '' });
    expect(got.closed).toEqual([
      ['too many listeners, try again later', true],
      ['the connection to the hub closed', false],
    ]);
  });

  it('does not report the close of a socket that it closed', () => {
    const { l, got } = link();
    l.open('dmrhub.example.org');
    const ws = FakeSocket.last;
    l.close();
    expect(ws.closed).toEqual({ code: 1000, reason: 'closed by the radio' });
    ws.onclose?.({ code: 1000, reason: '' });
    expect(got.closed).toEqual([]);
  });
});
