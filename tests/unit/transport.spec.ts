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
import { afterEach, describe, expect, it } from 'vitest';

import { datagramWriter, Transport } from '@/radio/transport';

describe('datagramWriter', () => {
  const sink = () => {
    const got: Uint8Array[] = [];
    return { got, stream: new WritableStream<Uint8Array>({ write: (c) => void got.push(c) }) };
  };

  it('prefers createWritable', async () => {
    const a = sink();
    const b = sink();
    const w = datagramWriter({ readable: new ReadableStream(), writable: b.stream, createWritable: () => a.stream });
    await w.write(new Uint8Array([1, 2]));
    expect(a.got).toHaveLength(1);
    expect(b.got).toHaveLength(0);
  });

  it('falls back to writable', async () => {
    const b = sink();
    const w = datagramWriter({ readable: new ReadableStream(), writable: b.stream });
    await w.write(new Uint8Array([3]));
    expect(b.got).toEqual([new Uint8Array([3])]);
  });

  it('fails without a writable side', () => {
    expect(() => datagramWriter({ readable: new ReadableStream() })).toThrow();
  });
});


function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
}

type Fake = { sent: string[] };

function fakeWebTransport(notices: string[], answer: string): Fake {
  const fake: Fake = { sent: [] };
  (globalThis as { WebTransport?: unknown }).WebTransport = class {
    ready = Promise.resolve();
    closed = new Promise(() => undefined);
    datagrams = { readable: new ReadableStream<Uint8Array>(), writable: new WritableStream<Uint8Array>() };
    incomingUnidirectionalStreams = new ReadableStream<ReadableStream<Uint8Array>>({
      start(c) {
        for (const n of notices) {
          c.enqueue(streamOf(n));
        }
      },
    });
    async createBidirectionalStream() {
      return {
        readable: streamOf(answer),
        writable: new WritableStream<Uint8Array>({ write: (chunk) => void fake.sent.push(new TextDecoder().decode(chunk)) }),
      };
    }
    close() {}
  };
  return fake;
}

describe('Transport', () => {
  afterEach(() => {
    delete (globalThis as { WebTransport?: unknown }).WebTransport;
  });

  it('hands over the token of a drain notice', async () => {
    fakeWebTransport(['{"drain":true,"resume":"tok"}\n'], '');
    const tokens: string[] = [];
    const t = new Transport({ onDatagram: () => undefined, onClosed: () => undefined, onDrain: (tok) => tokens.push(tok) });
    await t.connect('https://hub.example:62032/mmdvm');
    await new Promise((r) => setTimeout(r, 10));
    expect(tokens).toEqual(['tok']);
  });

  it('resumes a login on a new session', async () => {
    const fake = fakeWebTransport([], '{"resumed":true}\n');
    const t = new Transport({ onDatagram: () => undefined, onClosed: () => undefined });
    await t.connect('https://hub.example:62032/mmdvm');
    expect(await t.resume('tok')).toBe(true);
    expect(fake.sent.join('')).toBe('{"resume":"tok"}\n');
  });

  it('reports a refused resume', async () => {
    fakeWebTransport([], '{"resumed":false,"reason":"bad token"}\n');
    const t = new Transport({ onDatagram: () => undefined, onClosed: () => undefined });
    await t.connect('https://hub.example:62032/mmdvm');
    expect(await t.resume('tok')).toBe(false);
  });
});
