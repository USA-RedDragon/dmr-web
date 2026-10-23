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
import { ref, watch, type Ref } from 'vue';

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

export function useOnAir(host: Ref<string>, limit: number) {
  const entries = ref<OnAirEntry[]>([]);
  const failed = ref(false);
  let ctrl: AbortController | null = null;

  async function load(): Promise<void> {
    const h = host.value.trim();
    ctrl?.abort();
    if (!h) {
      entries.value = [];
      return;
    }
    const mine = new AbortController();
    ctrl = mine;
    try {
      const got = await fetchOnAir(h, limit, mine.signal);
      if (ctrl === mine) {
        entries.value = got;
        failed.value = false;
      }
    } catch {
      if (ctrl === mine) {
        entries.value = [];
        failed.value = true;
      }
    }
  }

  const later = useDebounceFn(load, 600);
  watch(host, () => void later());
  useEventListener(window, 'focus', () => void load());
  useEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void load();
    }
  });
  void load();
  return { entries, failed, load };
}
