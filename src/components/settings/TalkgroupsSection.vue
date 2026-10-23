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
import { GripVertical, X } from 'lucide-vue-next';
import { reactive, ref } from 'vue';

import { useSettings, type Slot } from '@/store/settings';

import { inputClass, primaryButton } from './fields';

const LONG_PRESS_MS = 450;

const store = useSettings();
const desktop = useMediaQuery('(min-width: 1024px)');
const tab = ref<Slot>(store.settings.selected.slot);
const draft = reactive<Record<Slot, string>>({ 1: '', 2: '' });
const drag = ref<{ slot: Slot; from: number; to: number } | null>(null);
let press: ReturnType<typeof setTimeout> | null = null;

function add(slot: Slot): void {
  const id = Number(draft[slot]);
  if (!Number.isInteger(id) || id <= 0 || id >= 1 << 24) {
    return;
  }
  const list = store.settings.talkgroups[slot];
  if (!list.some((t) => t.id === id)) {
    list.push({ id, name: '', static: false });
  }
  draft[slot] = '';
}

function remove(slot: Slot, i: number): void {
  store.settings.talkgroups[slot].splice(i, 1);
  const sel = store.settings.selected.index;
  sel[slot] = Math.min(sel[slot], Math.max(0, store.settings.talkgroups[slot].length - 1));
}

function rowAt(slot: Slot, y: number): number {
  const rows = [...document.querySelectorAll<HTMLElement>(`[data-tg-row="${slot}"]`)];
  const i = rows.findIndex((r) => y < r.getBoundingClientRect().top + r.offsetHeight / 2);
  return i < 0 ? rows.length - 1 : i;
}

function startDrag(e: PointerEvent, slot: Slot, i: number): void {
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  drag.value = { slot, from: i, to: i };
}

function onPress(e: PointerEvent, slot: Slot, i: number): void {
  if (desktop.value) {
    return;
  }
  const target = e.currentTarget as HTMLElement;
  const id = e.pointerId;
  press = setTimeout(() => {
    press = null;
    target.setPointerCapture(id);
    drag.value = { slot, from: i, to: i };
    navigator.vibrate?.(10);
  }, LONG_PRESS_MS);
}

function onMove(e: PointerEvent): void {
  if (press) {
    clearTimeout(press);
    press = null;
  }
  if (drag.value) {
    e.preventDefault();
    drag.value.to = rowAt(drag.value.slot, e.clientY);
  }
}

function onUp(): void {
  if (press) {
    clearTimeout(press);
    press = null;
  }
  const d = drag.value;
  drag.value = null;
  if (!d || d.from === d.to) {
    return;
  }
  const list = store.settings.talkgroups[d.slot];
  const [item] = list.splice(d.from, 1);
  list.splice(d.to, 0, item!);
}

function now(slot: Slot): string {
  const t = store.target(slot);
  return t ? `TG ${t}` : 'nothing';
}
</script>

<template>
  <div v-if="desktop" class="flex items-center justify-between gap-4">
    <p class="m-0 text-sm text-radio-text/80">The talkgroup knob steps through the list for the selected slot, in this order.</p>
  </div>
  <div v-else role="tablist" aria-label="Timeslot" class="grid grid-cols-2 gap-1 rounded-xl border border-radio-line bg-radio-page p-1">
    <button
      v-for="s in [1, 2] as Slot[]"
      :key="s"
      type="button"
      role="tab"
      :aria-selected="tab === s"
      class="h-11 rounded-[9px] text-sm font-semibold"
      :class="tab === s ? 'bg-radio-raised text-radio-accent' : 'text-radio-text/80'"
      @click="tab = s"
    >
      TS{{ s }} · {{ store.target(s) ? `TG ${store.target(s)}` : '---' }}
    </button>
  </div>

  <div class="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
    <section
      v-for="slot in (desktop ? [1, 2] : [tab]) as Slot[]"
      :key="slot"
      :aria-label="`Talkgroups on TS${slot}`"
      class="flex flex-col rounded-2xl border border-radio-line bg-radio-surface"
      :class="desktop ? 'gap-0 p-5' : 'px-3.5 py-1'"
    >
      <div v-if="desktop" class="flex items-center justify-between pb-2">
        <h2 class="m-0 text-[17px] font-semibold">TS{{ slot }}</h2>
        <span class="text-xs text-radio-muted">Now on {{ now(slot) }}</span>
      </div>
      <p v-if="store.settings.talkgroups[slot].length === 0" class="m-0 py-4 text-sm text-radio-muted">No talkgroups yet.</p>
      <div
        v-for="(t, i) in store.settings.talkgroups[slot]"
        :key="t.id"
        :data-tg-row="slot"
        class="flex min-h-14 select-none items-center gap-2.5 border-radio-line"
        :class="[
          i < store.settings.talkgroups[slot].length - 1 || desktop ? 'border-b' : '',
          drag && drag.slot === slot && drag.from === i ? 'opacity-50' : '',
          drag && drag.slot === slot && drag.to === i && drag.from !== i ? 'shadow-[0_-2px_0_var(--radio-amber)_inset]' : '',
        ]"
        @pointerdown="onPress($event, slot, i)"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @contextmenu.prevent
      >
        <button
          v-if="desktop"
          type="button"
          :aria-label="`Drag to reorder TG ${t.id}`"
          class="flex h-9 w-5 cursor-grab items-center justify-center text-radio-muted"
          style="touch-action: none"
          @pointerdown.stop="startDrag($event, slot, i)"
        >
          <GripVertical class="size-3.5" />
        </button>
        <span class="w-14 shrink-0 font-mono font-semibold">{{ t.id }}</span>
        <input v-model="t.name" :aria-label="`Name of TG ${t.id}`" class="min-w-0 grow bg-transparent text-sm outline-none" placeholder="Name" @pointerdown.stop />
        <button
          type="button"
          :aria-pressed="t.static"
          :aria-label="t.static ? `TG ${t.id} is static, tap to make it dynamic` : `Make TG ${t.id} static`"
          class="shrink-0 rounded-[5px] border px-1.5 py-0.5 text-[10px] font-semibold"
          :class="t.static ? 'border-radio-green text-radio-green' : 'border-radio-line text-radio-muted/70'"
          @pointerdown.stop
          @click="t.static = !t.static"
        >
          STATIC
        </button>
        <button type="button" :aria-label="`Remove TG ${t.id}`" class="flex size-11 shrink-0 items-center justify-center text-radio-muted" @pointerdown.stop @click="remove(slot, i)">
          <X class="size-4" />
        </button>
      </div>
      <form v-if="desktop" class="flex gap-2.5 pt-4" @submit.prevent="add(slot)">
        <input v-model="draft[slot]" :aria-label="`Add a talkgroup to TS${slot}`" :class="inputClass" inputmode="numeric" placeholder="Talkgroup number" />
        <button type="submit" :class="primaryButton">Add</button>
      </form>
    </section>
  </div>

  <form v-if="!desktop" class="flex gap-2" @submit.prevent="add(tab)">
    <input v-model="draft[tab]" :aria-label="`Add a talkgroup to TS${tab}`" :class="inputClass" inputmode="numeric" placeholder="Add talkgroup number" />
    <button type="submit" :class="primaryButton">Add</button>
  </form>
  <p class="m-0 text-xs text-radio-muted">
    {{
      desktop
        ? 'STATIC talkgroups are linked on the hub for this hotspot. The rest link when you key up on them.'
        : 'The knob steps through this list in order. Long-press a row to reorder it.'
    }}
  </p>
</template>
