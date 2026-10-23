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

import { defineStore } from 'pinia';
import { computed, ref, toRaw, watch } from 'vue';

import { kvGet, kvSet } from '@/lib/kv';
import type { VocoderChoice } from '@/radio/protocol';

export type TalkgroupEntry = { id: number; name: string; static: boolean };
export type Slot = 1 | 2;

export type Settings = {
  hub: { host: string };
  hotspot: { id: number; password: string; callsign: string; location: string };
  vocoder: VocoderChoice;
  jitterMs: number;
  audio: {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    micGainDb: number;
    volume: number;
    pttMode: 'hold' | 'toggle';
    pttKey: string;
  };
  talkgroups: { 1: TalkgroupEntry[]; 2: TalkgroupEntry[] };
  selected: { slot: Slot; index: { 1: number; 2: number }; manual: { 1: number | null; 2: number | null } };
  display: { reduceMotion: boolean; keepScreenOn: boolean };
};

const KEY = 'settings';

export function defaultSettings(): Settings {
  return {
    hub: { host: 'dmrhub.net' },
    hotspot: { id: 0, password: '', callsign: '', location: '' },
    vocoder: 'auto',
    jitterMs: 360,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
      micGainDb: 0,
      volume: 0.6,
      pttMode: 'hold',
      pttKey: 'Space',
    },
    talkgroups: { 1: [], 2: [{ id: 9990, name: 'Parrot', static: false }] },
    selected: { slot: 2, index: { 1: 0, 2: 0 }, manual: { 1: null, 2: null } },
    display: { reduceMotion: false, keepScreenOn: true },
  };
}

export function mergeSettings(base: Settings, saved: Partial<Settings> | undefined): Settings {
  if (!saved) {
    return base;
  }
  return {
    ...base,
    ...saved,
    hub: { host: saved.hub?.host ?? base.hub.host },
    hotspot: { ...base.hotspot, ...saved.hotspot },
    audio: { ...base.audio, ...saved.audio },
    talkgroups: { ...base.talkgroups, ...saved.talkgroups },
    selected: {
      ...base.selected,
      ...saved.selected,
      index: { ...base.selected.index, ...saved.selected?.index },
      manual: { ...base.selected.manual, ...saved.selected?.manual },
    },
    display: { ...base.display, ...saved.display },
  };
}

export function radioIdOf(hotspot: number): number {
  const s = String(hotspot);
  if (s.length === 9) {
    return Number(s.slice(0, 7));
  }
  return hotspot;
}

export function validHotspot(id: number): boolean {
  const s = String(id);
  return Number.isInteger(id) && id > 0 && (s.length === 7 || s.length === 9);
}

export function rptoOptions(tg: Settings['talkgroups']): string {
  const list = (slot: Slot) =>
    tg[slot]
      .filter((t) => t.static)
      .map((t) => t.id)
      .join(',');
  const ts1 = list(1);
  const ts2 = list(2);
  if (!ts1 && !ts2) {
    return '';
  }
  return `TS1=${ts1};TS2=${ts2}`;
}

export const useSettings = defineStore('settings', () => {
  const settings = ref<Settings>(defaultSettings());
  const loaded = ref(false);

  async function load(): Promise<void> {
    settings.value = mergeSettings(defaultSettings(), await kvGet<Partial<Settings>>(KEY));
    loaded.value = true;
  }

  function replace(next: Settings): void {
    settings.value = mergeSettings(defaultSettings(), next);
  }

  watch(
    settings,
    (s) => {
      if (loaded.value) {
        void kvSet(KEY, structuredClone(toRaw(s)));
      }
    },
    { deep: true },
  );

  const configured = computed(() => validHotspot(settings.value.hotspot.id) && settings.value.hotspot.password !== '');
  const radioId = computed(() => radioIdOf(settings.value.hotspot.id));

  function target(slot: Slot): number | null {
    const s = settings.value;
    const manual = s.selected.manual[slot];
    if (manual) {
      return manual;
    }
    return s.talkgroups[slot][s.selected.index[slot]]?.id ?? null;
  }

  function targetName(slot: Slot): string {
    const s = settings.value;
    if (s.selected.manual[slot]) {
      return 'MANUAL';
    }
    return s.talkgroups[slot][s.selected.index[slot]]?.name ?? '';
  }

  return { settings, loaded, load, replace, configured, radioId, target, targetName };
});
