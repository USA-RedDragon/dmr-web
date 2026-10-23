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
import { ArrowDown, ArrowUp, X } from 'lucide-vue-next';
import { reactive } from 'vue';

import { useSettings, type Slot } from '@/store/settings';

import { inputClass, primaryButton } from './fields';

const store = useSettings();
const draft = reactive<Record<Slot, { id: string; name: string }>>({ 1: { id: '', name: '' }, 2: { id: '', name: '' } });

function add(slot: Slot): void {
  const id = Number(draft[slot].id);
  if (!Number.isInteger(id) || id <= 0 || id >= 1 << 24) {
    return;
  }
  const list = store.settings.talkgroups[slot];
  if (!list.some((t) => t.id === id)) {
    list.push({ id, name: draft[slot].name.trim(), static: false });
  }
  draft[slot] = { id: '', name: '' };
}

function remove(slot: Slot, i: number): void {
  store.settings.talkgroups[slot].splice(i, 1);
  const sel = store.settings.selected.index;
  sel[slot] = Math.min(sel[slot], Math.max(0, store.settings.talkgroups[slot].length - 1));
}

function move(slot: Slot, i: number, d: number): void {
  const list = store.settings.talkgroups[slot];
  const j = i + d;
  if (j < 0 || j >= list.length) {
    return;
  }
  [list[i], list[j]] = [list[j]!, list[i]!];
}
</script>

<template>
  <p class="m-0 text-sm text-radio-text/80">The talkgroup knob steps through the list for the selected slot, in this order.</p>
  <div class="grid gap-5 lg:grid-cols-2">
    <section
      v-for="slot in [1, 2] as Slot[]"
      :key="slot"
      :aria-label="`Timeslot ${slot}`"
      class="flex flex-col gap-2.5 rounded-2xl border border-radio-line bg-radio-surface p-4 sm:p-5"
    >
      <div class="flex items-center justify-between">
        <h2 class="m-0 text-[17px] font-semibold">TS{{ slot }}</h2>
        <span class="text-xs text-radio-muted">Now on {{ store.target(slot) ? `TG ${store.target(slot)}` : 'nothing' }}</span>
      </div>
      <p v-if="store.settings.talkgroups[slot].length === 0" class="m-0 py-2 text-sm text-radio-muted">No talkgroups yet.</p>
      <div
        v-for="(t, i) in store.settings.talkgroups[slot]"
        :key="t.id"
        class="flex min-h-14 items-center gap-2 border-b border-radio-line"
      >
        <span class="w-14 font-mono font-semibold">{{ t.id }}</span>
        <input v-model="t.name" :aria-label="`Name of TG ${t.id}`" class="min-w-0 grow bg-transparent text-sm outline-none" placeholder="Name" />
        <label class="flex items-center gap-1.5 text-[11px] font-semibold" :class="t.static ? 'text-radio-green' : 'text-radio-muted'">
          <input v-model="t.static" type="checkbox" class="accent-radio-green" />STATIC
        </label>
        <button type="button" :aria-label="`Move TG ${t.id} up`" class="flex size-9 items-center justify-center text-radio-muted" :disabled="i === 0" @click="move(slot, i, -1)">
          <ArrowUp class="size-4" />
        </button>
        <button
          type="button"
          :aria-label="`Move TG ${t.id} down`"
          class="flex size-9 items-center justify-center text-radio-muted"
          :disabled="i === store.settings.talkgroups[slot].length - 1"
          @click="move(slot, i, 1)"
        >
          <ArrowDown class="size-4" />
        </button>
        <button type="button" :aria-label="`Remove TG ${t.id}`" class="flex size-11 items-center justify-center text-radio-muted" @click="remove(slot, i)">
          <X class="size-4" />
        </button>
      </div>
      <form class="mt-1 flex gap-2" @submit.prevent="add(slot)">
        <input v-model="draft[slot].id" :aria-label="`Add a talkgroup to TS${slot}`" :class="[inputClass, 'w-32 font-mono']" inputmode="numeric" placeholder="Number" />
        <input v-model="draft[slot].name" aria-label="Talkgroup name" :class="inputClass" placeholder="Name" />
        <button type="submit" :class="primaryButton">Add</button>
      </form>
    </section>
  </div>
  <p class="m-0 text-xs text-radio-muted">
    STATIC talkgroups are linked on the hub for this hotspot at login. The rest link when you key up on them. Changes apply at the next connect.
  </p>
</template>
