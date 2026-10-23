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
import { useDebounceFn } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

import { kvGet, kvSet } from '@/lib/kv';
import { HubError, useAccount } from '@/store/account';

/** Listing is what the hub's copy of the RadioID database says about an ID. */
export type Listing = {
  callsign: string;
  name: string;
  city: string;
  state: string;
  country: string;
  flag: string;
};

type Cached = { listing: Listing | null; at: number };

type Answer = {
  callsign?: string;
  fname?: string;
  name?: string;
  surname?: string;
  city?: string;
  state?: string;
  country?: string;
  flag?: string;
};

const KEY = 'directory';

/** FOUND_MS is how long a listing is kept before it is looked up again. */
export const FOUND_MS = 30 * 24 * 3600_000;

/** MISSING_MS is how long an ID the database does not have is left alone. */
export const MISSING_MS = 24 * 3600_000;

const PARALLEL = 2;

/** listable reports whether id can be a radio in the RadioID database, not a talkgroup or a hotspot. */
export function listable(id: number): boolean {
  return Number.isInteger(id) && ((id >= 1_000_000 && id <= 9_999_999) || id === 9990);
}

/** listingOf reads the hub's answer for one ID. */
export function listingOf(a: Answer): Listing {
  const first = (a.fname || a.name || '').trim();
  return {
    callsign: (a.callsign ?? '').trim().toUpperCase(),
    name: [first, (a.surname ?? '').trim()].filter(Boolean).join(' '),
    city: (a.city ?? '').trim(),
    state: (a.state ?? '').trim(),
    country: (a.country ?? '').trim(),
    flag: a.flag ?? '',
  };
}

/** stale reports whether a cached lookup should be made again at now. */
export function stale(c: Cached | undefined, now: number): boolean {
  return !c || now - c.at > (c.listing ? FOUND_MS : MISSING_MS);
}

export const useDirectory = defineStore('directory', () => {
  const account = useAccount();
  const cache = ref<Record<number, Cached>>({});
  const loaded = ref(false);
  const wanted = new Set<number>();
  const queue: number[] = [];
  let running = 0;

  const save = useDebounceFn(() => {
    void kvSet(KEY, JSON.parse(JSON.stringify(cache.value)) as Record<number, Cached>).catch(() => undefined);
  }, 1000);

  async function load(): Promise<void> {
    cache.value = (await kvGet<Record<number, Cached>>(KEY)) ?? {};
    loaded.value = true;
    pump();
  }

  async function fetchOne(id: number): Promise<void> {
    try {
      const got = await account.api<Answer>(`/api/v1/userdb/${id}`);
      cache.value[id] = { listing: listingOf(got), at: Date.now() };
      save();
    } catch (err) {
      if (err instanceof HubError && err.status === 404) {
        cache.value[id] = { listing: null, at: Date.now() };
        save();
      }
    }
  }

  function pump(): void {
    if (!loaded.value || !account.loggedIn) {
      return;
    }
    while (running < PARALLEL && queue.length > 0) {
      const id = queue.shift()!;
      running++;
      void fetchOne(id).finally(() => {
        running--;
        pump();
      });
    }
  }

  /** listing is what is known about id, and asks the hub when it is not known yet. */
  function listing(id: number): Listing | null {
    const c = cache.value[id];
    if (listable(id) && !wanted.has(id) && account.loggedIn && stale(c, Date.now())) {
      wanted.add(id);
      queue.push(id);
      queueMicrotask(pump);
    }
    return c?.listing ?? null;
  }

  watch(
    () => account.loggedIn,
    () => {
      wanted.clear();
      queue.length = 0;
      pump();
    },
  );

  return { load, listing };
});
