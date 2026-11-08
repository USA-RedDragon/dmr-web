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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RadioConfig, ToWorker } from '@/radio/protocol';

vi.mock('@/radio/wasm_exec.js', () => ({}));
vi.mock('@/radio/radio.wasm?url', () => ({ default: '/assets/radio-test.wasm' }));

vi.mock('@/radio/discover', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/radio/discover')>()),
  discover: vi.fn(async () => ({ url: 'https://hub.example:62032/mmdvm', hashes: [] })),
  HubRefusedError: class extends Error {},
}));

function dmrd(seq: number): Uint8Array {
  const p = new Uint8Array(55);
  p.set([0x44, 0x4d, 0x52, 0x44]);
  p[4] = seq;
  p[19] = 7;
  return p;
}

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
}

class FakeSession {
  static all: FakeSession[] = [];
  ready = Promise.resolve();
  closed = new Promise(() => undefined);
  private incoming!: ReadableStreamDefaultController<Uint8Array>;
  private notices!: ReadableStreamDefaultController<ReadableStream<Uint8Array>>;
  private answer: (text: string) => void = () => undefined;
  datagrams = {
    readable: new ReadableStream<Uint8Array>({ start: (c) => void (this.incoming = c) }),
    writable: new WritableStream<Uint8Array>(),
  };
  incomingUnidirectionalStreams = new ReadableStream<ReadableStream<Uint8Array>>({
    start: (c) => void (this.notices = c),
  });
  private questions!: ReadableStreamDefaultController<{ readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }>;
  incomingBidirectionalStreams = new ReadableStream<{ readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }>({
    start: (c) => void (this.questions = c),
  });
  requests: string[] = [];

  constructor(readonly url: string) {
    FakeSession.all.push(this);
  }

  async createBidirectionalStream() {
    return {
      readable: new ReadableStream<Uint8Array>({
        start: (c) => {
          this.answer = (text) => {
            c.enqueue(new TextEncoder().encode(text));
            c.close();
          };
        },
      }),
      writable: new WritableStream<Uint8Array>({ write: (chunk) => void this.requests.push(new TextDecoder().decode(chunk)) }),
    };
  }

  ask(question: string): string[] {
    const answer: string[] = [];
    this.questions.enqueue({
      readable: streamOf(question),
      writable: new WritableStream<Uint8Array>({ write: (chunk) => void answer.push(new TextDecoder().decode(chunk)) }),
    });
    return answer;
  }

  close() {}

  send(seq: number) {
    this.incoming.enqueue(dmrd(seq));
  }

  sendRaw(data: Uint8Array) {
    this.incoming.enqueue(data);
  }

  drain(token: string) {
    this.notices.enqueue(streamOf(`${JSON.stringify({ drain: true, resume: token })}\n`));
  }

  resumed(ok: boolean) {
    this.answer(`${JSON.stringify({ resumed: ok })}\n`);
  }
}

const config: RadioConfig = {
  hub: 'hub.example',
  callsign: 'N0CALL',
  radioId: 1234567,
  password: 'pw',
} as unknown as RadioConfig;

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('radio worker', () => {
  let taken: number[];
  let scope: { onmessage: ((e: { data: ToWorker }) => void) | null; dmrweb?: unknown };

  beforeEach(async () => {
    vi.resetModules();
    FakeSession.all = [];
    taken = [];
    const dmr = {
      start: () => ({ ok: true }),
      stop: () => ({ ok: true }),
      packet: (_now: number, data: Uint8Array) => {
        taken.push(data[4]!);
        return -1;
      },
      tick: () => -1,
      setLocation: () => ({ ok: true, deadline: -1 }),
      setReporting: () => ({ ok: true, deadline: -1 }),
    };
    scope = globalThis as unknown as typeof scope;
    vi.stubGlobal('WebTransport', FakeSession);
    vi.stubGlobal('postMessage', () => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('')));
    vi.stubGlobal('WebAssembly', { instantiateStreaming: async () => ({ instance: {} }) });
    vi.stubGlobal(
      'Go',
      class {
        importObject = {};
        run() {
          scope.dmrweb = dmr;
          return new Promise(() => undefined);
        }
      },
    );
    await import('@/radio/radio.worker');
    scope.onmessage?.({ data: { type: 'connect', config } });
    await settle();
  });

  afterEach(async () => {
    scope.onmessage?.({ data: { type: 'disconnect' } });
    scope.onmessage = null;
    delete scope.dmrweb;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('takes the handover of the new session before the resume answer, and drops the old session', async () => {
    const old = FakeSession.all[0]!;
    old.send(1);
    await settle();
    old.drain('tok');
    await settle();
    const next = FakeSession.all[1]!;
    old.send(2);
    next.send(2);
    next.send(3);
    await settle();
    next.resumed(true);
    await settle();
    next.send(5);
    old.send(4);
    await settle();
    expect(taken).toEqual([1, 2, 3, 5]);
  });

  it('drops the copies of a handover after a move that retried', async () => {
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const old = FakeSession.all[0]!;
    old.send(1);
    await settle();
    old.drain('tok');
    await settle();
    old.send(2);
    await settle();
    FakeSession.all[1]!.resumed(false);
    await settle();
    expect(taken).toEqual([1, 2]);
    clock = 3_000;
    await new Promise((r) => setTimeout(r, 250));
    await settle();
    const next = FakeSession.all[2]!;
    next.send(1);
    next.send(2);
    next.send(3);
    await settle();
    next.resumed(true);
    await settle();
    expect(taken).toEqual([1, 2, 3]);
  });

  it('takes the held bursts of the old session in order when the resume fails', async () => {
    const old = FakeSession.all[0]!;
    old.send(1);
    await settle();
    old.drain('tok');
    await settle();
    const next = FakeSession.all[1]!;
    old.send(2);
    old.send(3);
    await settle();
    expect(taken).toEqual([1]);
    next.resumed(false);
    await settle();
    old.send(4);
    await settle();
    expect(taken).toEqual([1, 2, 3, 4]);
  });

  it('drops the MSTNAK of the old session that comes before the resume answer', async () => {
    const nak = new TextEncoder().encode('MSTNAK\x00\x12\xd6\x87');
    const old = FakeSession.all[0]!;
    old.send(1);
    await settle();
    old.drain('tok');
    await settle();
    const next = FakeSession.all[1]!;
    old.sendRaw(nak);
    await settle();
    expect(taken).toEqual([1]);
    next.resumed(true);
    await settle();
    next.send(2);
    await settle();
    expect(taken).toEqual([1, 2]);
  });

  it('takes the MSTNAK of the old session in order when the resume fails', async () => {
    const nak = new TextEncoder().encode('MSTNAK\x00\x12\xd6\x87');
    const old = FakeSession.all[0]!;
    old.send(1);
    await settle();
    old.drain('tok');
    await settle();
    const next = FakeSession.all[1]!;
    old.send(2);
    old.sendRaw(nak);
    await settle();
    next.resumed(false);
    await settle();
    expect(taken).toEqual([1, 2, nak[4]]);
  });

  it('opens its sessions as one that answers the anchor question', () => {
    expect(new URL(FakeSession.all[0]!.url).searchParams.get('anchor')).toBe('1');
  });

  it('sends the anchor of the bursts that it took in the resume request, not of those it held', async () => {
    const old = FakeSession.all[0]!;
    old.send(1);
    old.send(2);
    old.send(4);
    await settle();
    old.drain('tok');
    await settle();
    old.send(3);
    old.send(5);
    await settle();
    const next = FakeSession.all[1]!;
    expect(JSON.parse(next.requests.join(''))).toEqual({ resume: 'tok', anchor: [{ slot: 1, stream: 7, seq: 2, first: 1 }] });
  });

  it('answers the anchor question with the anchor of the bursts that it took', async () => {
    const s = FakeSession.all[0]!;
    for (const seq of [1, 2, 3, 5]) {
      s.send(seq);
    }
    await settle();
    const answer = s.ask('{"ask":"anchor"}\n');
    await settle();
    expect(JSON.parse(answer.join(''))).toEqual({ anchor: [{ slot: 1, stream: 7, seq: 3, first: 1 }] });
  });

  it('answers a question that it does not know with nothing', async () => {
    const answer = FakeSession.all[0]!.ask('{"ask":"weather"}\n');
    await settle();
    expect(answer).toEqual([]);
  });
});

class FakeSocket {
  static all: FakeSocket[] = [];
  binaryType = 'blob';
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: unknown): void {
    this.sent.push(data);
  }
  close(): void {}
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
}

describe('radio worker in listen mode', () => {
  let taken: number[];
  let started: unknown[];
  let posted: { type: string; state?: string; detail?: string }[];
  let scope: { onmessage: ((e: { data: ToWorker }) => void) | null; dmrweb?: unknown };

  beforeEach(async () => {
    vi.resetModules();
    FakeSocket.all = [];
    taken = [];
    started = [];
    posted = [];
    const dmr = {
      start: (cfg: unknown) => {
        started.push(cfg);
        return { ok: true };
      },
      stop: () => ({ ok: true }),
      packet: (_now: number, data: Uint8Array) => {
        taken.push(data[4]!);
        return -1;
      },
      tick: () => -1,
      ptt: () => ({ ok: false, error: 'radio: listen only, this radio cannot transmit' }),
    };
    scope = globalThis as unknown as typeof scope;
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('postMessage', (m: { type: string; state?: string; detail?: string }) => void posted.push(m));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('')));
    vi.stubGlobal('WebAssembly', { instantiateStreaming: async () => ({ instance: {} }) });
    vi.stubGlobal(
      'Go',
      class {
        importObject = {};
        run() {
          scope.dmrweb = dmr;
          return new Promise(() => undefined);
        }
      },
    );
    await import('@/radio/radio.worker');
    scope.onmessage?.({ data: { type: 'listen', hub: 'hub.example', talkgroup: 91, jitterMs: 360 } });
    await settle();
  });

  afterEach(() => {
    scope.onmessage?.({ data: { type: 'disconnect' } });
    scope.onmessage = null;
    delete scope.dmrweb;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts a listen-only radio, tunes, and plays the packets of the monitor', async () => {
    expect(started).toEqual([{ listen: true, jitterMs: 360, vocoder: 'auto' }]);
    const ws = FakeSocket.all[0]!;
    expect(ws.url).toBe('wss://hub.example/ws/listen');
    ws.open();
    ws.onmessage?.({ data: dmrd(1).buffer });
    scope.onmessage?.({ data: { type: 'tune', talkgroup: 3100 } });
    scope.onmessage?.({ data: { type: 'ptt', on: true, slot: 2, group: true, target: 3100 } });
    await settle();
    expect(taken).toEqual([1]);
    expect(ws.sent).toEqual(['{"tune":91}', '{"tune":3100}']);
    expect(posted).toContainEqual({ type: 'ptt', ok: false, error: 'radio: listen only, this radio cannot transmit' });
  });

  it('stops when the hub refuses the session, and connects again after a lost one', async () => {
    FakeSocket.all[0]!.open();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    FakeSocket.all[0]!.onclose?.({ code: 1006, reason: '' });
    expect(posted.filter((m) => m.type === 'link').at(-1)).toMatchObject({ state: 'reconnecting' });
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    await settle();
    expect(FakeSocket.all).toHaveLength(2);
    FakeSocket.all[1]!.onclose?.({ code: 1008, reason: 'too many listeners, try again later' });
    await settle();
    expect(posted.filter((m) => m.type === 'link').at(-1)).toMatchObject({ state: 'failed', detail: 'too many listeners, try again later' });
  });
});
