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
import { useMediaQuery } from '@vueuse/core';
import { ChevronLeft } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import { inputClass } from '@/components/settings/fields';
import { octetCount, parseHex } from '@/lib/hex';
import type { DataRate, DataSap } from '@/radio/protocol';
import { useRadio, type TrafficRow } from '@/store/radio';
import { useSettings } from '@/store/settings';

const desktop = useMediaQuery('(min-width: 1024px)');
const radio = useRadio();
const settings = useSettings();

const to = ref('');
const slot = ref(2);
const confirmed = ref(true);
const sap = ref<DataSap>('proprietary');
const rate = ref<DataRate>('1/2');
const payload = ref('48 65 6C 6C 6F');
const filter = ref<'all' | 'data' | 'ip'>('all');
const failure = ref('');
const hubName = computed(() => settings.settings.hub.host.replace(/^https?:\/\//, ''));

const target = computed(() => {
  const m = /^\s*(tg\s*)?(\d{1,8})\s*$/i.exec(to.value);
  const id = m ? Number(m[2]) : 0;
  return id > 0 && id < 1 << 24 ? { id, group: !!m![1] } : null;
});
const octets = computed(() => octetCount(payload.value));
const canSend = computed(() => !!target.value && octets.value > 0 && octets.value <= 1500 && radio.connected);

const rows = computed(() => radio.traffic.filter((r) => filter.value === 'all' || (filter.value === 'ip') === r.kind.startsWith('IP')));

function send(): void {
  const t = target.value;
  const bytes = parseHex(payload.value);
  if (!t || !bytes) {
    return;
  }
  radio.dataError = '';
  failure.value = radio.sendData({ slot: slot.value, group: t.group, target: t.id, confirmed: confirmed.value && !t.group, sap: sap.value, rate: rate.value, payload: bytes });
}

function time(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function who(id: number, group: boolean): string {
  if (group) {
    return `TG ${id}`;
  }
  return id === settings.radioId ? 'you' : String(id);
}

function route(r: TrafficRow): string {
  return r.dir === 'rx' ? `${r.source} \u2192 ${who(r.target, r.group)}` : `you \u2192 ${who(r.target, r.group)}`;
}

function status(r: TrafficRow): string {
  return { ok: 'OK', sending: 'Waiting', sent: 'Sent', acked: 'Acked', failed: r.reason === 'noAnswer' ? 'No answer' : 'Failed' }[r.status];
}

function tone(r: TrafficRow): string {
  return r.status === 'failed' ? 'text-radio-red' : r.status === 'sending' ? 'text-radio-accent' : 'text-radio-green';
}

const select = 'h-11 rounded-[10px] border border-radio-line bg-radio-page px-2.5 text-sm text-radio-text';
const seg = (on: boolean) => (on ? 'bg-radio-raised text-radio-accent shadow-sm' : 'text-radio-text/80');
const chip = (on: boolean) => (on ? 'border-radio-amber bg-radio-amber-soft font-semibold text-radio-accent' : 'border-radio-line text-radio-text/80');
</script>

<template>
  <div v-if="desktop" class="flex min-h-0 grow flex-col">
    <nav aria-label="Breadcrumb" class="flex items-center gap-2.5 px-8 pt-5 text-sm">
      <RouterLink to="/settings/diagnostics" class="flex min-h-8 items-center no-underline">Diagnostics</RouterLink>
      <span class="text-radio-muted" aria-hidden="true">/</span>
      <h1 class="m-0 text-sm font-semibold">Data console</h1>
    </nav>
    <main class="flex min-h-0 grow gap-6 px-8 pt-4 pb-8">
      <form aria-label="Send data" class="flex w-[380px] shrink-0 flex-col gap-3.5 rounded-2xl border border-radio-line bg-radio-surface p-5" @submit.prevent="send">
        <h2 class="m-0 text-base font-semibold">Send</h2>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
            To radio or group
            <input v-model="to" :class="[inputClass, 'font-mono text-sm']" placeholder="3100002 or TG 9" autocomplete="off" />
          </label>
          <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
            Slot
            <select v-model.number="slot" :class="select"><option :value="2">TS2</option><option :value="1">TS1</option></select>
          </label>
        </div>
        <div role="radiogroup" aria-label="Delivery" class="grid grid-cols-2 gap-1 rounded-xl border border-radio-line bg-radio-page p-1">
          <button type="button" role="radio" :aria-checked="confirmed" :disabled="target?.group" class="h-10 rounded-[9px] text-[13px] font-semibold disabled:opacity-40" :class="seg(confirmed && !target?.group)" @click="confirmed = true">Confirmed</button>
          <button type="button" role="radio" :aria-checked="!confirmed || !!target?.group" class="h-10 rounded-[9px] text-[13px] font-semibold" :class="seg(!confirmed || !!target?.group)" @click="confirmed = false">Unconfirmed</button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
            Service (SAP)
            <select v-model="sap" :class="select"><option value="proprietary">Proprietary</option><option value="ip">IPv4</option><option value="short">Short data</option></select>
          </label>
          <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
            Rate
            <select v-model="rate" :class="select"><option value="1/2">Rate 1/2</option><option value="3/4">Rate 3/4</option><option value="1">Rate 1</option></select>
          </label>
        </div>
        <label class="flex min-h-0 grow flex-col gap-1.5 text-xs text-radio-muted">
          Payload, hex
          <textarea v-model="payload" class="min-h-[120px] grow resize-none rounded-[10px] border border-radio-line bg-radio-page p-3 font-mono text-[13px] leading-normal text-radio-text outline-none focus-visible:border-radio-amber" spellcheck="false" />
          <span :class="payload && !octets ? 'text-radio-red' : ''">{{ payload && !octets ? 'Not hex: pairs of 0 to 9 and A to F' : `${octets} bytes` }}</span>
        </label>
        <p v-if="failure || radio.dataError" role="alert" class="m-0 text-xs text-radio-red">{{ failure || radio.dataError }}</p>
        <button type="submit" class="h-12 rounded-xl bg-radio-amber text-[15px] font-bold text-radio-amber-ink disabled:opacity-50" :disabled="!canSend">Send data</button>
      </form>
      <section aria-label="Traffic" class="flex min-w-0 grow flex-col gap-3 rounded-2xl border border-radio-line bg-radio-surface p-5">
        <div class="flex items-center justify-between">
          <h2 class="m-0 text-base font-semibold">Traffic</h2>
          <div role="tablist" aria-label="Filter" class="flex gap-1.5">
            <button v-for="f in (['all', 'data', 'ip'] as const)" :key="f" type="button" role="tab" :aria-selected="filter === f" class="h-8 rounded-full border px-3 text-xs" :class="chip(filter === f)" @click="filter = f">
              {{ { all: 'All', data: 'Data', ip: 'IP' }[f] }}
            </button>
          </div>
        </div>
        <div class="grid grid-cols-[76px_34px_190px_110px_70px_minmax(0,1fr)] gap-x-3 border-b border-radio-line px-2 pb-1.5 text-xs text-radio-muted">
          <span>Time</span><span>Dir</span><span>From, to</span><span>Kind</span><span>Status</span><span>Payload</span>
        </div>
        <div class="flex min-h-0 flex-col overflow-y-auto text-[13px]">
          <p v-if="!rows.length" class="m-0 px-2 py-3 text-sm text-radio-muted">No data yet. Texts, checks, positions and what you send here show up as they pass.</p>
          <div v-for="r in rows" :key="r.key" class="grid grid-cols-[76px_34px_190px_110px_70px_minmax(0,1fr)] items-center gap-x-3 border-b border-radio-line/60 px-2 py-2">
            <span class="font-mono text-xs text-radio-text/75">{{ time(r.at) }}</span>
            <span class="font-bold" :class="r.dir === 'rx' ? 'text-radio-green' : 'text-radio-accent'">{{ r.dir.toUpperCase() }}</span>
            <span class="truncate font-mono text-xs">{{ route(r) }}</span>
            <span class="truncate">{{ r.kind }}</span>
            <span :class="tone(r)" :title="r.reason">{{ status(r) }}</span>
            <span class="truncate font-mono text-xs text-radio-text/80" :title="r.payload">{{ r.payload }}</span>
          </div>
        </div>
      </section>
    </main>
  </div>
  <main v-else class="fixed inset-0 z-30 flex flex-col gap-3 bg-radio-page pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
    <div class="flex h-14 shrink-0 items-center gap-1">
      <RouterLink to="/settings/diagnostics" aria-label="Back to diagnostics" class="-ml-2.5 flex size-11 items-center justify-center text-radio-accent"><ChevronLeft class="size-[22px]" /></RouterLink>
      <h1 class="m-0 grow text-lg font-bold">Data console</h1>
      <span class="flex min-w-0 items-center gap-1.5 text-xs text-radio-text/80">
        <span class="size-2 shrink-0 rounded-full" :class="radio.connected ? 'bg-radio-green' : 'bg-led-off'" />
        <span class="truncate">{{ radio.connected ? hubName : 'Not connected' }}</span>
      </span>
    </div>
    <div role="tablist" aria-label="Filter" class="flex gap-1.5">
      <button v-for="f in (['all', 'data', 'ip'] as const)" :key="f" type="button" role="tab" :aria-selected="filter === f" class="h-9 rounded-full border px-3.5 text-[13px]" :class="chip(filter === f)" @click="filter = f">
        {{ { all: 'All', data: 'Data', ip: 'IP' }[f] }}
      </button>
    </div>
    <div class="flex min-h-0 grow flex-col gap-2 overflow-y-auto">
      <p v-if="!rows.length" class="m-0 py-2 text-sm text-radio-muted">No data yet.</p>
      <div v-for="r in rows" :key="r.key" class="flex flex-col gap-1 rounded-xl border border-radio-line bg-radio-surface px-3 py-2.5">
        <div class="flex justify-between gap-2 text-xs">
          <span class="truncate">
            <b :class="r.dir === 'rx' ? 'text-radio-green' : 'text-radio-accent'">{{ r.dir.toUpperCase() }}</b>
            {{ r.dir === 'rx' ? r.source : who(r.target, r.group) }} · {{ r.kind }}<template v-if="r.dir === 'tx'"> · <span :class="tone(r)">{{ status(r) }}</span></template>
          </span>
          <span class="shrink-0 text-radio-muted">{{ time(r.at) }}</span>
        </div>
        <span class="truncate font-mono text-[11px] text-radio-text/80">{{ r.payload }}</span>
      </div>
    </div>
    <form aria-label="Send data" class="flex flex-col gap-2.5 rounded-2xl border border-radio-line bg-radio-raised p-3.5" @submit.prevent="send">
      <div class="grid grid-cols-[minmax(0,1fr)_84px] gap-2">
        <input v-model="to" aria-label="To radio or group" :class="[inputClass, 'font-mono text-sm']" placeholder="3100002 or TG 9" autocomplete="off" />
        <select v-model.number="slot" aria-label="Slot" :class="select"><option :value="2">TS2</option><option :value="1">TS1</option></select>
      </div>
      <div role="radiogroup" aria-label="Delivery" class="grid grid-cols-2 gap-1 rounded-xl border border-radio-line bg-radio-page p-1">
        <button type="button" role="radio" :aria-checked="confirmed" :disabled="target?.group" class="h-10 rounded-[9px] text-[13px] font-semibold disabled:opacity-40" :class="seg(confirmed && !target?.group)" @click="confirmed = true">Confirmed</button>
        <button type="button" role="radio" :aria-checked="!confirmed || !!target?.group" class="h-10 rounded-[9px] text-[13px] font-semibold" :class="seg(!confirmed || !!target?.group)" @click="confirmed = false">Unconfirmed</button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1 text-[11px] text-radio-muted">
          Service (SAP)
          <select v-model="sap" :class="select"><option value="proprietary">Proprietary</option><option value="ip">IPv4</option><option value="short">Short data</option></select>
        </label>
        <label class="flex flex-col gap-1 text-[11px] text-radio-muted">
          Rate
          <select v-model="rate" :class="select"><option value="1/2">Rate 1/2</option><option value="3/4">Rate 3/4</option><option value="1">Rate 1</option></select>
        </label>
      </div>
      <input v-model="payload" aria-label="Payload, hex" :class="[inputClass, 'font-mono text-sm']" spellcheck="false" autocomplete="off" />
      <p v-if="failure || radio.dataError" role="alert" class="m-0 text-xs text-radio-red">{{ failure || radio.dataError }}</p>
      <div class="flex items-center justify-between">
        <span class="text-xs" :class="payload && !octets ? 'text-radio-red' : 'text-radio-muted'">{{ payload && !octets ? 'Not hex' : `Payload, hex · ${octets} bytes` }}</span>
        <button type="submit" class="h-11 rounded-[10px] bg-radio-amber px-[18px] text-sm font-bold text-radio-amber-ink disabled:opacity-50" :disabled="!canSend">Send</button>
      </div>
    </form>
  </main>
</template>
