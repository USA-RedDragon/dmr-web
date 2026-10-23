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
import { useDebounceFn, useEventListener } from '@vueuse/core';
import { onScopeDispose, ref, watch, type Ref } from 'vue';

import { retryDelay } from '@/lib/hubMessages';
import { hubOrigin } from '@/radio/discover';

export type OnAirEntry = {
  id: number;
  callsign: string;
  source: number;
  target: string;
  start: Date;
  seconds: number;
  active: boolean;
};

type Call = {
  id: number;
  kind?: string;
  user?: { id?: number; callsign?: string };
  start_time: string;
  duration: number;
  active: boolean;
  group_call: boolean;
  is_to_talkgroup: boolean;
  to_talkgroup?: { id?: number; name?: string };
  destination_id: number;
  source_id: number;
};

export function entryOf(c: Call): OnAirEntry {
  const source = c.source_id || c.user?.id || 0;
  const tg = c.to_talkgroup?.id || c.destination_id;
  return {
    id: c.id,
    callsign: c.user?.callsign || String(source),
    source,
    target: c.is_to_talkgroup || c.group_call ? `TG ${tg}` : 'Private',
    start: new Date(c.start_time),
    seconds: Math.round(c.duration / 1e9),
    active: c.active,
  };
}

/** lastHeardSocketURL is the hub's public websocket of the calls on the air. */
export function lastHeardSocketURL(host: string): string {
  const u = hubOrigin(host);
  u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
  u.pathname = '/ws/lastheard';
  return u.toString();
}

/** mergeCall puts a pushed call into entries, newest first, keeping at most limit of them. Calls other than voice are left out. */
export function mergeCall(entries: OnAirEntry[], c: Call, limit: number): OnAirEntry[] {
  if (c.kind && c.kind !== 'voice') {
    return entries;
  }
  const e = entryOf(c);
  const rest = entries.filter((x) => x.id !== e.id);
  return [e, ...rest].sort((a, b) => b.start.getTime() - a.start.getTime()).slice(0, limit);
}

export async function fetchOnAir(host: string, limit: number, signal?: AbortSignal): Promise<OnAirEntry[]> {
  const url = new URL('/api/v1/lastheard', hubOrigin(host));
  url.searchParams.set('types', 'voice');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('page', '1');
  const res = await fetch(url, { signal, credentials: 'omit', cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`${url.host} answered ${res.status}`);
  }
  const body = (await res.json()) as { calls?: Call[] };
  return (body.calls ?? []).map(entryOf);
}

const NEVER_OPENED_TRIES = 3;

/** useOnAir keeps the latest voice calls of the hub at host, live over its public websocket. */
export function useOnAir(host: Ref<string>, limit: number) {
  const entries = ref<OnAirEntry[]>([]);
  const failed = ref(false);
  let ctrl: AbortController | null = null;
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let opened = false;
  let generation = 0;

  async function load(h: string, gen: number): Promise<void> {
    ctrl?.abort();
    const mine = new AbortController();
    ctrl = mine;
    try {
      const got = await fetchOnAir(h, limit, mine.signal);
      if (gen === generation) {
        let merged = got;
        for (const e of entries.value) {
          if (!merged.some((x) => x.id === e.id)) {
            merged = [...merged, e];
          }
        }
        entries.value = merged.sort((a, b) => b.start.getTime() - a.start.getTime()).slice(0, limit);
        failed.value = false;
      }
    } catch {
      if (gen === generation && !mine.signal.aborted) {
        failed.value = true;
      }
    }
  }

  function close(): void {
    clearTimeout(timer);
    ctrl?.abort();
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  }

  function open(h: string, gen: number): void {
    let socket: WebSocket;
    try {
      socket = new WebSocket(lastHeardSocketURL(h), ['dmrhub']);
    } catch {
      failed.value = true;
      return;
    }
    ws = socket;
    socket.onopen = () => {
      opened = true;
      if (attempt > 0) {
        void load(h, gen);
      }
      attempt = 0;
    };
    socket.onmessage = (e: MessageEvent<string>) => {
      let c: Call;
      try {
        c = JSON.parse(e.data) as Call;
      } catch {
        return;
      }
      if (typeof c?.id === 'number') {
        entries.value = mergeCall(entries.value, c, limit);
        failed.value = false;
      }
    };
    socket.onclose = () => {
      if (ws !== socket || gen !== generation) {
        return;
      }
      ws = null;
      if (document.visibilityState === 'visible' && (opened || attempt < NEVER_OPENED_TRIES)) {
        clearTimeout(timer);
        timer = setTimeout(() => open(h, gen), retryDelay(attempt++));
      }
    };
  }

  function start(): void {
    generation++;
    close();
    attempt = 0;
    opened = false;
    const h = host.value.trim();
    if (!h) {
      entries.value = [];
      failed.value = false;
      return;
    }
    void load(h, generation);
    open(h, generation);
  }

  const later = useDebounceFn(() => {
    entries.value = [];
    start();
  }, 600);
  watch(host, () => void later());
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible' && !ws) {
      start();
    }
  });
  onScopeDispose(() => {
    generation++;
    close();
  });
  start();
  return { entries, failed };
}
