<!--
  SPDX-License-Identifier: AGPL-3.0-or-later
  dmr-web - A DMR radio in the browser
  Copyright (C) 2026 Jacob McSwain

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program. If not, see <https://www.gnu.org/licenses/>.

  The source code is available at <https://github.com/USA-RedDragon/dmr-web>
-->

<script setup lang="ts">
import { useIntervalFn, useMediaQuery } from '@vueuse/core';
import { formatDistanceToNowStrict } from 'date-fns';
import { LocateFixed, Maximize, Minus, Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import AppNav from '@/components/AppNav.vue';
import BaseMap from '@/components/map/BaseMap.vue';
import ShareLocation from '@/components/map/ShareLocation.vue';
import SymbolIcon from '@/components/map/SymbolIcon.vue';
import { useColorMode } from '@/composables/useColorMode';
import { useNames } from '@/lib/names';
import { keyOf } from '@/lib/threads';
import { useMessages } from '@/store/messages';
import { compass, degrees, describe, usePositions, type Position } from '@/store/positions';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

const desktop = useMediaQuery('(min-width: 1024px)');
const { isDark } = useColorMode();
const positions = usePositions();
const mySymbol = computed(() => (positions.share ? positions.service : null));
const radio = useRadio();
const settings = useSettings();
const messages = useMessages();
const names = useNames();
const router = useRouter();
const route = useRoute();
const base = ref<InstanceType<typeof BaseMap> | null>(null);
const station = Number(route.query.station) || null;
const selected = ref<number | null>(positions.positions.find((p) => p.id === station)?.id ?? positions.positions[0]?.id ?? null);
const now = ref(Date.now());
useIntervalFn(() => (now.value = Date.now()), 15_000);

const sel = computed(() => positions.positions.find((p) => p.id === selected.value) ?? null);
const request = computed(() => (sel.value ? positions.latestRequest(sel.value.id) : undefined));
const asking = computed(() => request.value?.status === 'asking' && now.value - request.value.startedAt < 30_000);
const myCall = computed(() => settings.settings.hotspot.callsign || (settings.radioId ? String(settings.radioId) : ''));

function label(id: number): string {
  return names.callsign(id) || String(id);
}

function ago(at: number): string {
  void now.value;
  return formatDistanceToNowStrict(at, { addSuffix: true });
}

function received(p: Position): string {
  const t = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).format(p.at);
  return `${t}, TS${p.slot}`;
}

function moving(p: Position): string {
  if (p.speed === null) {
    return '-';
  }
  if (p.speed <= 0.5) {
    return 'Stationary';
  }
  return `${Math.round(p.speed * 3.6)} km/h${p.heading !== null ? `, heading ${Math.round(p.heading)}°` : ''}`;
}

function badge(p: Position): string {
  return { lrrp: 'LRRP', nmea: 'NMEA', hdap: 'HDAP', talker: 'GPS' }[p.format];
}

function pick(id: number | null): void {
  selected.value = id;
  const p = id === null ? null : positions.positions.find((x) => x.id === id);
  if (p) {
    base.value?.center(p.latitude, p.longitude);
  }
}

function ready(): void {
  if (station !== null && selected.value === station) {
    pick(station);
  }
}

function update(): void {
  if (sel.value) {
    radio.requestLocation(sel.value.id, sel.value.slot);
  }
}

function message(): void {
  if (!sel.value) {
    return;
  }
  const peer = { group: false, id: sel.value.id };
  messages.thread(peer, sel.value.slot);
  void router.push(`/messages/${keyOf(peer)}`);
}

function showMe(): void {
  positions.locate();
  const h = positions.here;
  if (h) {
    base.value?.center(h.latitude, h.longitude, 14);
  }
}

const requestNote = computed(() => {
  const r = request.value;
  if (!r || now.value - r.startedAt > 120_000) {
    return '';
  }
  switch (r.status) {
    case 'asking':
      return 'Asking for a new position';
    case 'noPosition':
      return 'The radio answered without a position';
    case 'failed':
      return r.reason === 'notConnected' ? 'Not connected to the hub' : `Not sent: ${r.reason}`;
    default:
      return '';
  }
});

const ctl = 'flex size-11 items-center justify-center rounded-[10px] border border-radio-line bg-radio-raised text-radio-text shadow-sm';
</script>

<template>
  <main v-if="desktop" class="flex min-h-0 grow">
    <aside aria-label="Positions" class="flex w-[340px] shrink-0 flex-col border-r border-radio-line">
      <div class="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 class="m-0 text-lg font-bold">Positions</h1>
        <span class="text-xs text-radio-muted">Last 24 h</span>
      </div>
      <ul class="m-0 flex min-h-0 flex-col overflow-y-auto p-0">
        <li v-for="p in positions.positions" :key="p.id" class="list-none">
          <button
            type="button"
            class="flex w-full gap-3 border-l-[3px] px-4 py-3 text-left"
            :class="p.id === selected ? 'border-radio-amber bg-radio-raised' : 'border-transparent'"
            :aria-current="p.id === selected ? 'true' : undefined"
            @click="pick(p.id)"
          >
            <span class="mt-1 size-3 shrink-0 rounded-full" :class="p.id === selected ? 'bg-radio-amber' : ['bg-radio-cyan', 'bg-radio-text/80', 'bg-radio-green'][p.id % 3]" />
            <span class="flex min-w-0 grow flex-col gap-0.5">
              <span class="flex justify-between gap-2">
                <span class="truncate font-mono text-sm font-semibold">{{ label(p.id) }}</span>
                <span class="shrink-0 text-xs text-radio-muted">{{ ago(p.at) }}</span>
              </span>
              <span class="truncate text-xs text-radio-text/75">{{ describe(p) }}</span>
            </span>
          </button>
        </li>
        <li class="list-none">
          <button type="button" class="flex w-full gap-3 border-l-[3px] border-transparent px-4 py-3 text-left" @click="showMe">
            <span class="mt-px flex size-[18px] shrink-0 items-center justify-center">
              <SymbolIcon v-if="mySymbol" :service="mySymbol" class="size-4 text-radio-green" />
              <span v-else class="box-border size-3 rounded-full border-2 border-radio-green" />
            </span>
            <span class="flex min-w-0 grow flex-col gap-0.5">
              <span class="flex justify-between gap-2">
                <span class="truncate font-mono text-sm font-semibold">{{ myCall ? `${myCall} (you)` : 'You' }}</span>
                <span class="shrink-0 text-xs text-radio-muted">{{ positions.share ? 'Shared' : 'Not shared' }}</span>
              </span>
              <span class="truncate text-xs text-radio-text/75">{{ positions.hereError || 'Browser location' }}</span>
            </span>
          </button>
        </li>
      </ul>
      <p v-if="!positions.positions.length" class="m-0 px-4 py-2 text-sm text-radio-muted">
        No positions yet. They appear when a radio sends one, or answers a request.
      </p>
      <ShareLocation class="mt-auto border-t border-radio-line p-4" />
    </aside>
    <BaseMap ref="base" class="grow" :positions="positions.positions" :selected="selected" :here="positions.here" :symbol="mySymbol" :dark="isDark" :label="label" @select="selected = $event" @ready="ready">
      <template #popup="{ point }">
        <div
          v-if="sel && point"
          role="dialog"
          :aria-label="`${label(sel.id)} position`"
          class="pointer-events-auto absolute flex w-[300px] -translate-x-[86px] flex-col gap-2.5 rounded-2xl border border-radio-line bg-radio-raised p-4 shadow-2xl"
          :class="point.y < 280 ? '' : '-translate-y-full'"
          :style="{ left: `${point.x}px`, top: `${point.y < 280 ? point.y + 24 : point.y - 24}px` }"
          @click.stop
        >
          <div class="flex items-center justify-between">
            <span class="font-mono text-base font-bold">{{ label(sel.id) }}</span>
            <span class="rounded-[5px] border border-radio-amber/50 px-[7px] py-0.5 text-[11px] font-semibold text-radio-accent">{{ badge(sel) }}</span>
          </div>
          <dl class="m-0 grid grid-cols-[80px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[13px]">
            <dt class="text-radio-muted">Position</dt>
            <dd class="m-0 font-mono text-xs">{{ degrees(sel.latitude, sel.longitude) }}</dd>
            <dt class="text-radio-muted">Accuracy</dt>
            <dd class="m-0">{{ sel.accuracy !== null ? `±${Math.round(sel.accuracy)} m` : '-' }}</dd>
            <dt class="text-radio-muted">Moving</dt>
            <dd class="m-0">{{ moving(sel) }}</dd>
            <dt class="text-radio-muted">Received</dt>
            <dd class="m-0">{{ received(sel) }}</dd>
          </dl>
          <p v-if="requestNote" role="status" class="m-0 text-xs text-radio-muted">{{ requestNote }}</p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="h-10 rounded-[10px] bg-radio-amber text-[13px] font-bold text-radio-amber-ink disabled:opacity-50" :disabled="asking" @click="update">
              {{ asking ? 'Asking' : 'Request update' }}
            </button>
            <button type="button" class="h-10 rounded-[10px] border border-radio-line text-[13px]" @click="message">Message</button>
          </div>
          <span
            aria-hidden="true"
            class="absolute left-[79px] size-3.5 rotate-45 border-radio-line bg-radio-raised"
            :class="point.y < 280 ? '-top-2 border-t border-l' : '-bottom-2 border-r border-b'"
          />
        </div>
      </template>
      <template #controls>
        <div class="absolute right-5 bottom-5 flex flex-col gap-2">
          <button type="button" aria-label="Zoom in" :class="ctl" @click="base?.zoomBy(1)"><Plus class="size-5" /></button>
          <button type="button" aria-label="Zoom out" :class="ctl" @click="base?.zoomBy(-1)"><Minus class="size-5" /></button>
          <button type="button" aria-label="Fit all positions" :class="ctl" @click="base?.fit()"><Maximize class="size-[18px]" /></button>
        </div>
      </template>
    </BaseMap>
  </main>
  <template v-else>
    <main class="flex min-h-0 grow flex-col">
      <BaseMap
        ref="base"
        class="grow"
        attribution="top-left"
        :positions="positions.positions"
        :selected="selected"
        :here="positions.here"
        :symbol="mySymbol"
        :dark="isDark"
        :label="label"
        @select="selected = $event"
        @ready="ready"
      >
        <template #controls>
          <div class="absolute top-3 right-3 flex flex-col gap-2">
            <button type="button" aria-label="Fit all positions" :class="ctl" @click="base?.fit()"><Maximize class="size-[18px]" /></button>
            <button type="button" aria-label="My location" :class="ctl" @click="showMe"><LocateFixed class="size-[18px]" /></button>
          </div>
          <section
            :role="sel ? 'dialog' : undefined"
            :aria-label="sel ? `${label(sel.id)} position` : 'Location sharing'"
            class="absolute inset-x-0 bottom-0 flex flex-col gap-2.5 rounded-t-[20px] border-t border-radio-line bg-radio-raised px-4 pt-3 pb-4"
          >
            <span aria-hidden="true" class="h-1 w-10 self-center rounded-sm bg-radio-line" />
            <template v-if="sel">
              <div class="flex items-center justify-between">
                <span class="font-mono text-[17px] font-bold">{{ label(sel.id) }}</span>
                <span class="rounded-[5px] border border-radio-amber/50 px-[7px] py-0.5 text-[11px] font-semibold text-radio-accent">{{ badge(sel) }} · {{ ago(sel.at) }}</span>
              </div>
              <span class="text-[13px] text-radio-text/80">
                {{ degrees(sel.latitude, sel.longitude) }}<template v-if="sel.accuracy !== null"> · ±{{ Math.round(sel.accuracy) }} m</template
                ><template v-if="sel.speed !== null && sel.speed > 0.5"> · {{ Math.round(sel.speed * 3.6) }} km/h{{ sel.heading !== null ? ` ${compass(sel.heading)}` : '' }}</template>
              </span>
              <p v-if="requestNote" role="status" class="m-0 text-xs text-radio-muted">{{ requestNote }}</p>
              <div class="grid grid-cols-2 gap-2">
                <button type="button" class="h-11 rounded-[10px] bg-radio-amber text-sm font-bold text-radio-amber-ink disabled:opacity-50" :disabled="asking" @click="update">
                  {{ asking ? 'Asking' : 'Request update' }}
                </button>
                <button type="button" class="h-11 rounded-[10px] border border-radio-line text-sm" @click="message">Message</button>
              </div>
            </template>
            <p v-else class="m-0 text-[13px] text-radio-text/80">
              {{ positions.positions.length ? 'Tap a station for its position.' : 'No positions yet. They appear when a radio sends one.' }}
            </p>
            <ShareLocation compact class="border-t border-radio-line pt-2.5" />
          </section>
        </template>
      </BaseMap>
    </main>
    <AppNav bar />
  </template>
</template>
