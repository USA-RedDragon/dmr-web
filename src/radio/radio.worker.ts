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

import './wasm_exec.js';

import type { FromWorker, LinkState, RadioConfig, RadioEvent, ToWorker } from './protocol';
import { Transport } from './transport';

type Result = { ok: boolean; error?: string; version?: number; transmit?: string };

type DmrWeb = {
  start: (
    config: Omit<RadioConfig, 'url'>,
    callbacks: {
      send: (packet: Uint8Array) => void;
      event: (event: RadioEvent) => void;
      audio: (slot: number, samples: Int16Array) => void;
    },
    now: number,
  ) => Result;
  stop: (now: number) => Result;
  packet: (now: number, data: Uint8Array) => number;
  tick: (now: number) => number;
  ptt: (now: number, on: boolean, slot: number, group: boolean, target: number) => Result;
  frame: (samples: Int16Array) => Result;
  loadAmbe: (bytes: Uint8Array) => Result;
  removeAmbe: () => Result;
  setVocoder: (value: string) => Result;
};

type GoRuntime = {
  importObject: WebAssembly.Imports;
  run: (instance: WebAssembly.Instance) => Promise<void>;
};

const MAX_ATTEMPTS = 6;
const MAX_RETRY_MS = 30_000;

const scope = self as unknown as {
  postMessage: (message: FromWorker, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
  Go: new () => GoRuntime;
  dmrweb?: DmrWeb;
};

let dmr: DmrWeb | null = null;
let transport: Transport | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let config: RadioConfig | null = null;
let playback: MessagePort | null = null;
let attempt = 0;
let everUp = false;
let wanted = false;

function post(message: FromWorker, transfer?: Transferable[]): void {
  scope.postMessage(message, transfer);
}

function link(state: LinkState, detail = '', retryInMs = 0): void {
  post({ type: 'link', state, detail, attempt, retryInMs });
}

function schedule(deadline: number): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!dmr || deadline < 0) {
    return;
  }
  const delay = Math.max(0, deadline - performance.now());
  timer = setTimeout(() => {
    timer = null;
    if (dmr) {
      schedule(dmr.tick(performance.now()));
    }
  }, delay);
}

function stopRadio(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  dmr?.stop(performance.now());
}

function lost(reason: string): void {
  stopRadio();
  transport?.close();
  transport = null;
  if (!wanted || !config) {
    link('idle', reason);
    return;
  }
  attempt += 1;
  if (attempt > MAX_ATTEMPTS || (!everUp && attempt > 2)) {
    wanted = false;
    link('failed', reason);
    return;
  }
  const retryInMs = Math.min(MAX_RETRY_MS, 1000 * 2 ** (attempt - 1));
  link('reconnecting', reason, retryInMs);
  const cfg = config;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect(cfg);
  }, retryInMs);
}

async function connect(cfg: RadioConfig): Promise<void> {
  if (!dmr) {
    return;
  }
  config = cfg;
  wanted = true;
  link(attempt === 0 ? 'connecting' : 'reconnecting');
  const t = new Transport({
    onDatagram: (data) => {
      if (dmr && transport === t) {
        schedule(dmr.packet(performance.now(), data));
      }
    },
    onClosed: (reason) => {
      if (transport === t) {
        lost(reason);
      }
    },
  });
  transport = t;
  try {
    await t.connect(cfg.url);
  } catch (err) {
    if (transport === t) {
      lost(err instanceof Error ? err.message : String(err));
    }
    return;
  }
  if (transport !== t) {
    t.close();
    return;
  }
  const { url: _url, ...radioConfig } = cfg;
  void _url;
  const res = dmr.start(
    radioConfig,
    {
      send: (packet) => t.send(packet),
      event: (event) => onEvent(event, t),
      audio: (slot, samples) => playback?.postMessage({ slot, samples }, [samples.buffer]),
    },
    performance.now(),
  );
  if (!res.ok) {
    wanted = false;
    t.close();
    transport = null;
    link('failed', res.error ?? 'the radio could not start');
    return;
  }
  schedule(dmr.tick(performance.now()));
}

function onEvent(event: RadioEvent, t: Transport): void {
  post({ type: 'event', event: { ...event } });
  if (event.kind === 'up') {
    attempt = 0;
    everUp = true;
    link('up');
  } else if (event.kind === 'down' && transport === t && wanted) {
    queueMicrotask(() => lost(event.reason || 'logged out by the hub'));
  }
}

function disconnect(): void {
  wanted = false;
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  stopRadio();
  transport?.close();
  transport = null;
  attempt = 0;
  link('idle');
}

function handle(msg: ToWorker): void {
  switch (msg.type) {
    case 'connect':
      disconnect();
      everUp = false;
      void connect(msg.config);
      return;
    case 'disconnect':
      disconnect();
      return;
    case 'ptt': {
      if (!dmr) {
        return;
      }
      const res = dmr.ptt(performance.now(), msg.on, msg.slot, msg.group, msg.target);
      post({ type: 'ptt', ok: res.ok, error: res.error });
      schedule(dmr.tick(performance.now()));
      return;
    }
    case 'ambe': {
      const res = dmr?.loadAmbe(msg.bytes) ?? { ok: false, error: 'the radio is not loaded' };
      post({ type: 'ambe', ok: res.ok, error: res.error, version: res.version });
      return;
    }
    case 'ambeRemove':
      dmr?.removeAmbe();
      return;
    case 'vocoder': {
      const res = dmr?.setVocoder(msg.value);
      post({ type: 'vocoder', transmit: res?.transmit ?? msg.value });
      return;
    }
    case 'capturePort':
      msg.port.onmessage = (e: MessageEvent<Int16Array>) => {
        dmr?.frame(e.data);
      };
      return;
    case 'playbackPort':
      playback = msg.port;
      return;
  }
}

async function boot(): Promise<void> {
  const go = new scope.Go();
  const url = new URL('/radio.wasm', self.location.origin);
  const { instance } = await WebAssembly.instantiateStreaming(fetch(url), go.importObject);
  void go.run(instance);
  if (!scope.dmrweb) {
    throw new Error('the radio module did not start');
  }
  dmr = scope.dmrweb;
  post({ type: 'ready' });
}

const queue: ToWorker[] = [];
scope.onmessage = (e) => {
  if (dmr) {
    handle(e.data);
  } else {
    queue.push(e.data);
  }
};

boot().then(
  () => {
    for (const msg of queue.splice(0)) {
      handle(msg);
    }
  },
  (err: unknown) => post({ type: 'fatal', error: err instanceof Error ? err.message : String(err) }),
);
