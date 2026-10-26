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

import type { FromWorker, Here, LinkState, RadioConfig, RadioEvent, ToWorker } from './protocol';
import { discover, HubRefusedError, type HubEndpoint } from './discover';
import { isDMRD, moveSession, RecentBursts } from './handoff';
import { Transport } from './transport';

type Result = { ok: boolean; error?: string; version?: number; transmit?: string };

type DmrWeb = {
  start: (
    config: Omit<RadioConfig, 'hub'>,
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
  sendText: (now: number, id: number, slot: number, group: boolean, target: number, format: string, text: string) => Result & { deadline: number };
  check: (now: number, id: number, slot: number, kind: string, target: number) => Result & { deadline: number };
  requestLocation: (now: number, id: number, slot: number, target: number) => Result & { deadline: number };
  setLocation: (here: Here | null, share: boolean) => Result & { deadline: number };
  setLocationServer: (now: number, server: number) => Result & { deadline: number };
  setReporting: (now: number, intervalMs: number) => Result & { deadline: number };
  reportLocation: (now: number) => Result & { deadline: number };
  sendData: (now: number, id: number, slot: number, group: boolean, target: number, confirmed: boolean, sap: string, rate: string, payload: Uint8Array) => Result & { deadline: number };
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
const MOVE_TRIES = 100;
const MOVE_RETRY_MS = 200;
const MOVE_OVERLAP_MS = 1_000;
const DEDUP_MS = 2_000;

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
let located: { here: Here | null; share: boolean } = { here: null, share: false };
let endpoint: HubEndpoint | null = null;
let moving = false;
let pending: Transport | null = null;
let held: Uint8Array[] = [];
const retiring = new Set<Transport>();
const recent = new RecentBursts(DEDUP_MS);
let locationServer = 0;
let reportingMs = 0;

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
  pending = null;
  held = [];
  for (const t of retiring) {
    t.close();
  }
  retiring.clear();
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

/**
 * datagram takes the datagram data of t. The replica that the radio moves
 * to sends the bursts that the old one sent since the drain notice as soon
 * as it takes the login over, in order, so the radio reads the new session
 * from the start. While the move goes on it holds the DMRD packets of the
 * old session aside, drops them once the new session resumes, and takes
 * them only when it does not.
 */
function datagram(t: Transport, data: Uint8Array): void {
  if (!dmr) {
    return;
  }
  if (t !== pending && t !== transport) {
    return;
  }
  if (t === transport && pending && isDMRD(data)) {
    held.push(data);
    return;
  }
  take(data);
}

function take(data: Uint8Array): void {
  if (!dmr) {
    return;
  }
  if (isDMRD(data) && recent.repeated(data, performance.now())) {
    return;
  }
  schedule(dmr.packet(performance.now(), data));
}

function release(t: Transport, replay: boolean): void {
  if (pending !== t) {
    return;
  }
  pending = null;
  const bursts = held;
  held = [];
  if (replay) {
    for (const data of bursts) {
      take(data);
    }
  }
}

function openTransport(): Transport {
  const t: Transport = new Transport({
    onDatagram: (data) => datagram(t, data),
    onClosed: (reason) => {
      if (transport === t) {
        lost(reason);
      }
    },
    onDrain: (token) => {
      if (transport === t) {
        void move(t, token);
      }
    },
  });
  return t;
}

/**
 * move takes the radio from the session old, whose hub replica stops, to
 * one with another replica that resumes the login with token, and closes
 * old once the new one carries the radio. When no replica takes it over,
 * the radio stays on old until it closes, and then connects again.
 */
async function move(old: Transport, token: string): Promise<void> {
  const ep = endpoint;
  if (moving || !ep) {
    return;
  }
  moving = true;
  try {
    const next = await moveSession(
      async () => {
        const t = openTransport();
        pending = t;
        try {
          await t.connect(ep.url, ep.hashes);
        } catch (err) {
          release(t, transport === old);
          t.close();
          throw err;
        }
        return t;
      },
      (t) => t.resume(token),
      (t) => {
        release(t, transport === old);
        t.close();
      },
      { tries: MOVE_TRIES, retryMs: MOVE_RETRY_MS, still: () => transport === old && wanted },
    );
    if (!next) {
      return;
    }
    release(next, false);
    if (transport !== old) {
      next.close();
      return;
    }
    retiring.add(old);
    transport = next;
    setTimeout(() => {
      retiring.delete(old);
      old.close();
    }, MOVE_OVERLAP_MS);
  } finally {
    moving = false;
  }
}

async function connect(cfg: RadioConfig): Promise<void> {
  if (!dmr) {
    return;
  }
  config = cfg;
  wanted = true;
  link(attempt === 0 ? 'connecting' : 'reconnecting');
  const t = openTransport();
  transport = t;
  try {
    const ep = await discover(cfg.hub);
    if (transport !== t) {
      return;
    }
    endpoint = ep;
    post({ type: 'endpoint', url: ep.url });
    await t.connect(ep.url, ep.hashes);
  } catch (err) {
    if (transport !== t) {
      return;
    }
    const reason = err instanceof Error ? err.message : String(err);
    if (err instanceof HubRefusedError) {
      wanted = false;
      transport = null;
      link('failed', reason);
      return;
    }
    lost(reason);
    return;
  }
  if (transport !== t) {
    t.close();
    return;
  }
  const { hub: _hub, ...radioConfig } = cfg;
  void _hub;
  const res = dmr.start(
    { ...radioConfig, locationServer: locationServer || radioConfig.locationServer },
    {
      send: (packet) => transport?.send(packet),
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
  dmr.setLocation(located.here, located.share);
  dmr.setReporting(performance.now(), reportingMs);
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
      locationServer = msg.config.locationServer;
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
    case 'sendText': {
      if (!dmr) {
        post({ type: 'sendText', id: msg.id, ok: false, error: 'the radio is not loaded' });
        return;
      }
      const res = dmr.sendText(performance.now(), msg.id, msg.slot, msg.group, msg.target, msg.format, msg.text);
      post({ type: 'sendText', id: msg.id, ok: res.ok, error: res.error });
      schedule(res.deadline);
      return;
    }
    case 'check': {
      if (!dmr) {
        post({ type: 'check', id: msg.id, ok: false, error: 'the radio is not loaded' });
        return;
      }
      const res = dmr.check(performance.now(), msg.id, msg.slot, msg.kind, msg.target);
      post({ type: 'check', id: msg.id, ok: res.ok, error: res.error });
      schedule(res.deadline);
      return;
    }
    case 'requestLocation': {
      if (!dmr) {
        post({ type: 'requestLocation', id: msg.id, ok: false, error: 'the radio is not loaded' });
        return;
      }
      const res = dmr.requestLocation(performance.now(), msg.id, msg.slot, msg.target);
      post({ type: 'requestLocation', id: msg.id, ok: res.ok, error: res.error });
      schedule(res.deadline);
      return;
    }
    case 'sendData': {
      if (!dmr) {
        post({ type: 'sendData', id: msg.id, ok: false, error: 'the radio is not loaded' });
        return;
      }
      const res = dmr.sendData(performance.now(), msg.id, msg.slot, msg.group, msg.target, msg.confirmed, msg.sap, msg.rate, msg.payload);
      post({ type: 'sendData', id: msg.id, ok: res.ok, error: res.error });
      schedule(res.deadline);
      return;
    }
    case 'setLocationServer': {
      locationServer = msg.server;
      const res = dmr?.setLocationServer(performance.now(), msg.server);
      if (res?.ok) {
        schedule(res.deadline);
      }
      return;
    }
    case 'setReporting': {
      reportingMs = msg.intervalMs;
      const res = dmr?.setReporting(performance.now(), msg.intervalMs);
      if (res?.ok) {
        schedule(res.deadline);
      }
      return;
    }
    case 'reportLocation': {
      if (!dmr) {
        post({ type: 'reportLocation', id: msg.id, ok: false, error: 'the radio is not loaded' });
        return;
      }
      const res = dmr.reportLocation(performance.now());
      post({ type: 'reportLocation', id: msg.id, ok: res.ok, error: res.error });
      schedule(res.deadline);
      return;
    }
    case 'setLocation': {
      located = { here: msg.here, share: msg.share };
      const res = dmr?.setLocation(msg.here, msg.share);
      if (res?.ok) {
        schedule(res.deadline);
      }
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
