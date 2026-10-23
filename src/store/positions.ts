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
import { computed, ref, watch } from 'vue';

import { kvGet, kvSet } from '@/lib/kv';
import type { FixDetail, Here } from '@/radio/protocol';

/** PositionFormat is how a station's position reached this radio. */
export type PositionFormat = 'lrrp' | 'nmea' | 'hdap' | 'talker';

/** Position is the latest position heard from a station. */
export type Position = {
  id: number;
  latitude: number;
  longitude: number;
  format: PositionFormat;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  at: number;
  slot: number;
};

/** LocationRequest is a request for a station's position that this radio sent. */
export type LocationRequest = { id: number; target: number; slot: number; startedAt: number; status: 'asking' | 'answered' | 'noPosition' | 'failed'; reason: string };

/** KEEP_MS is how long a position stays on the map. */
export const KEEP_MS = 24 * 60 * 60 * 1000;

const KEY = 'positions';
const SHARE_KEY = 'share-location';

/** fromFix reads a position out of a fix event, or returns null for a fix without one. */
export function fromFix(source: number, slot: number, latitude: number, longitude: number, fix: FixDetail | undefined, now: number): Position | null {
  if (!fix?.valid || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  const format = (['lrrp', 'nmea', 'hdap'] as const).find((f) => f === fix.format) ?? 'lrrp';
  return {
    id: source,
    latitude,
    longitude,
    format,
    accuracy: fix.accuracy ?? null,
    speed: fix.speed ?? null,
    heading: fix.heading ?? null,
    at: now,
    slot,
  };
}

/** prune drops positions older than KEEP_MS at now. */
export function prune(list: Position[], now: number): Position[] {
  return list.filter((p) => now - p.at < KEEP_MS);
}

/** upsert keeps the newest position of each station. */
export function upsert(list: Position[], p: Position): Position[] {
  return [p, ...list.filter((x) => x.id !== p.id)];
}

/** describe words a position the way the list and the popup show it. */
export function describe(p: Position): string {
  const parts: string[] = [{ lrrp: 'LRRP', nmea: 'NMEA RMC', hdap: 'Hytera HDAP', talker: 'From talker GPS' }[p.format]];
  if (p.speed !== null && p.speed > 0.5) {
    parts.push(`${Math.round(p.speed * 3.6)} km/h${p.heading !== null ? ` heading ${compass(p.heading)}` : ''}`);
  } else if (p.speed !== null) {
    parts.push('stationary');
  }
  if (p.accuracy !== null) {
    parts.push(`±${Math.round(p.accuracy)} m`);
  }
  return parts.join(' · ');
}

/** compass names the eight-point direction of a heading in degrees. */
export function compass(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
}

/** degrees writes a latitude and longitude as 41.8853 N, 87.6213 W. */
export function degrees(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(4)} ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(4)} ${lon < 0 ? 'W' : 'E'}`;
}

function newID(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 0x7fffffff || 1;
}

export const usePositions = defineStore('positions', () => {
  const list = ref<Position[]>([]);
  const requests = ref<Record<number, LocationRequest>>({});
  const share = ref(false);
  const here = ref<Here | null>(null);
  const hereError = ref('');
  const loaded = ref(false);

  const positions = computed(() => [...list.value].sort((a, b) => b.at - a.at));

  const save = useDebounceFn(() => {
    void kvSet(KEY, JSON.parse(JSON.stringify(list.value)) as Position[]).catch(() => undefined);
  }, 500);

  async function load(): Promise<void> {
    list.value = prune((await kvGet<Position[]>(KEY)) ?? [], Date.now());
    share.value = (await kvGet<boolean>(SHARE_KEY)) ?? false;
    loaded.value = true;
  }

  function add(p: Position): void {
    list.value = prune(upsert(list.value, p), Date.now());
    save();
  }

  function setShare(on: boolean): void {
    share.value = on;
    void kvSet(SHARE_KEY, on).catch(() => undefined);
  }

  let watchId: number | null = null;

  function onFix(p: GeolocationPosition): void {
    hereError.value = '';
    here.value = {
      latitude: p.coords.latitude,
      longitude: p.coords.longitude,
      accuracy: p.coords.accuracy,
      speed: p.coords.speed,
      heading: p.coords.heading,
      at: p.timestamp,
    };
  }

  function onError(err: GeolocationPositionError): void {
    hereError.value = err.code === err.PERMISSION_DENIED ? 'Location is blocked for this site' : 'No location fix yet';
  }

  function locate(): void {
    if (!('geolocation' in navigator)) {
      hereError.value = 'This browser has no location';
      return;
    }
    navigator.geolocation.getCurrentPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 });
  }

  watch(
    () => share.value && loaded.value,
    (on) => {
      if (on && watchId === null && 'geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 30_000 });
      } else if (!on && watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    },
  );

  function startRequest(target: number, slot: number): LocationRequest {
    const r: LocationRequest = { id: newID(), target, slot, startedAt: Date.now(), status: 'asking', reason: '' };
    requests.value[r.id] = r;
    return r;
  }

  function requestStatus(id: number, status: LocationRequest['status'], reason = ''): void {
    const r = requests.value[id];
    if (r && (r.status === 'asking' || status === 'answered')) {
      Object.assign(r, { status, reason });
    }
  }

  function latestRequest(target: number): LocationRequest | undefined {
    return Object.values(requests.value)
      .filter((r) => r.target === target)
      .sort((a, b) => b.startedAt - a.startedAt)[0];
  }

  return { positions, requests, share, here, hereError, loaded, load, add, setShare, locate, startRequest, requestStatus, latestRequest };
});
