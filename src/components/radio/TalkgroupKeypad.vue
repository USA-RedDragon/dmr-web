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
import { ref, watch } from 'vue';

const props = defineProps<{ open: boolean; ts: number }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; set: [talkgroup: number] }>();

const digits = ref('');
const MAX_DIGITS = 7;

watch(
  () => props.open,
  (open) => {
    if (open) {
      digits.value = '';
    }
  },
);

function press(d: string): void {
  if (digits.value.length < MAX_DIGITS) {
    digits.value += d;
  }
}

function apply(): void {
  const n = Number(digits.value);
  if (n > 0 && n < 1 << 24) {
    emit('set', n);
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
        class="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 rounded-t-[22px] border-t border-radio-chassis-line bg-radio-raised p-4 pb-6 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[340px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[22px] sm:border sm:p-5"
        @keydown="onKey"
      >
        <div class="flex items-center justify-between">
          <DialogTitle class="text-[15px] font-semibold">Talkgroup for TS{{ ts }}</DialogTitle>
          <button
            type="button"
            aria-label="Close"
            class="flex size-11 items-center justify-center rounded-[10px] border border-radio-line text-radio-muted"
            @click="emit('update:open', false)"
          >
            <X class="size-5" />
          </button>
        </div>
        <div class="rounded-xl border-2 border-lcd-line bg-lcd-bg px-4 py-3 font-mono text-[32px] font-bold tracking-[0.06em] text-lcd-text">
          TG {{ digits || '_' }}
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
          Set TS{{ ts }}
        </button>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
