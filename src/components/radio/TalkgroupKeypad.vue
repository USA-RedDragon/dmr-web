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
import { Delete, X } from 'lucide-vue-next';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { computed, ref, watch } from 'vue';

import { useNames } from '@/lib/names';
import { useContacts } from '@/store/contacts';

const props = withDefaults(defineProps<{ open: boolean; ts: number; preset?: { id: number; private: boolean } | null }>(), { preset: null });
const emit = defineEmits<{ 'update:open': [open: boolean]; set: [id: number, isPrivate: boolean] }>();

const names = useNames();
const contacts = useContacts();
const digits = ref('');
const priv = ref(false);
const MAX_DIGITS = 8;

watch(
  () => props.open,
  (open) => {
    if (open) {
      digits.value = props.preset ? String(props.preset.id) : '';
      priv.value = props.preset?.private ?? false;
    }
  },
  { immediate: true },
);

const who = computed(() => {
  const n = Number(digits.value);
  if (!priv.value || !n) {
    return '';
  }
  const c = names.callsign(n);
  if (!c) {
    return '';
  }
  return contacts.has(n) ? `${c} · contact` : c;
});
const setLabel = computed(() => {
  const n = Number(digits.value);
  const c = priv.value && n ? names.callsign(n) : '';
  return `Set TS${props.ts}${c ? ` to ${c}` : ''}`;
});

function press(d: string): void {
  if (digits.value.length < MAX_DIGITS) {
    digits.value += d;
  }
}

function apply(): void {
  const n = Number(digits.value);
  if (n > 0 && n < 1 << 24) {
    emit('set', n, priv.value);
    emit('update:open', false);
  }
}

function onKey(e: KeyboardEvent): void {
  if (/^[0-9]$/.test(e.key)) {
    press(e.key);
  } else if (e.key === 'Backspace') {
    digits.value = digits.value.slice(0, -1);
  } else if (e.key === 'Enter') {
    apply();
  }
}

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
</script>

<template>
  <DialogRoot :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/70" />
      <DialogContent
        class="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 rounded-t-[22px] border-t border-radio-chassis-line max-h-[calc(100dvh-env(safe-area-inset-top))] overflow-y-auto bg-radio-raised p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[340px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[22px] sm:border sm:p-5"
        @keydown="onKey"
      >
        <div class="flex items-center justify-between">
          <DialogTitle class="text-[15px] font-semibold">Call on TS{{ ts }}</DialogTitle>
          <button
            type="button"
            aria-label="Close"
            class="flex size-11 items-center justify-center rounded-[10px] border border-radio-line text-radio-muted"
            @click="emit('update:open', false)"
          >
            <X class="size-5" />
          </button>
        </div>
        <div role="radiogroup" aria-label="Call type" class="grid grid-cols-2 gap-1 rounded-xl border border-radio-line bg-radio-page p-1">
          <button
            v-for="m in [false, true]"
            :key="String(m)"
            type="button"
            role="radio"
            :aria-checked="priv === m"
            class="h-11 rounded-[9px] text-sm font-semibold sm:h-10"
            :class="priv === m ? 'bg-radio-raised text-radio-accent shadow-sm' : 'text-radio-text/80'"
            @click="priv = m"
          >
            {{ m ? 'Private' : 'Talkgroup' }}
          </button>
        </div>
        <div
          class="rounded-xl border-2 border-lcd-line bg-lcd-bg px-4 py-3 font-mono font-bold tracking-[0.06em] text-lcd-text"
          :class="priv ? 'text-[26px] sm:text-[28px]' : 'text-[30px] sm:text-[32px]'"
          :aria-label="priv ? 'Enter a radio ID' : 'Enter a talkgroup number'"
        >
          {{ priv ? 'ID' : 'TG' }} {{ digits || '_' }}
          <div v-if="who" class="mt-0.5 text-xs font-medium tracking-normal text-lcd-dim sm:mt-1 sm:text-[13px]">{{ who }}</div>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="k in keys"
            :key="k"
            type="button"
            class="h-14 rounded-xl border border-radio-chassis-line bg-radio-ptt text-[22px] font-semibold"
            @click="press(k)"
          >
            {{ k }}
          </button>
          <button type="button" aria-label="Clear" class="h-14 rounded-xl border border-radio-chassis-line text-[15px] font-semibold text-radio-muted" @click="digits = ''">
            CLR
          </button>
          <button type="button" class="h-14 rounded-xl border border-radio-chassis-line bg-radio-ptt text-[22px] font-semibold" @click="press('0')">0</button>
          <button
            type="button"
            aria-label="Delete last digit"
            class="flex h-14 items-center justify-center rounded-xl border border-radio-chassis-line text-radio-muted"
            @click="digits = digits.slice(0, -1)"
          >
            <Delete class="size-5" />
          </button>
        </div>
        <button
          type="button"
          class="h-[52px] rounded-xl bg-radio-amber text-base font-bold text-radio-amber-ink disabled:opacity-50"
          :disabled="!digits"
          @click="apply"
        >
          {{ setLabel }}
        </button>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
