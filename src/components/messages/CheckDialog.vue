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
import { format } from 'date-fns';
import { Check, Loader2, X } from 'lucide-vue-next';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { computed } from 'vue';

import { useNames } from '@/lib/names';
import type { CheckKind } from '@/radio/protocol';
import { useMessages } from '@/store/messages';
import { useRadio } from '@/store/radio';

const props = defineProps<{ checkId: number | null }>();
const emit = defineEmits<{ close: []; again: [kind: CheckKind]; call: [] }>();

const store = useMessages();
const radio = useRadio();
const names = useNames();

const c = computed(() => (props.checkId === null ? undefined : store.checks[props.checkId]));
const who = computed(() => (c.value ? names.name({ group: false, id: c.value.target }) : ''));
const title = computed(() => (c.value?.kind === 'presence' ? 'Presence check' : 'Radio check'));

const headline = computed(() => {
  const x = c.value;
  if (!x) {
    return '';
  }
  switch (x.status) {
    case 'checking':
      return `Checking ${who.value}`;
    case 'answered':
      return x.kind === 'presence' ? `${who.value} is available` : `${who.value} is on the air`;
    case 'noAnswer':
      return `${who.value}: no answer`;
    default:
      return x.reason === 'notSupported' ? `${who.value}'s radio does not support this` : x.reason === 'refused' ? `${who.value} refused` : `Could not check ${who.value}`;
  }
});

const detail = computed(() => {
  const x = c.value;
  if (!x) {
    return '';
  }
  switch (x.status) {
    case 'checking':
      return 'Waiting up to 5 s';
    case 'answered':
      return `Answered in ${(x.elapsedMs / 1000).toFixed(1)} s`;
    case 'noAnswer':
      return 'The radio may be off, or out of range of its repeater';
    default:
      return x.reason === 'notConnected' ? 'Not connected to the hub' : x.reason;
  }
});
</script>

<template>
  <DialogRoot :open="!!c" @update:open="(v) => !v && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/70" />
      <DialogContent
        v-if="c"
        class="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-[22px] border-t border-radio-line bg-radio-surface max-h-[calc(100dvh-env(safe-area-inset-top))] overflow-y-auto p-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))] text-radio-text sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[22px] sm:border sm:p-6"
      >
        <div class="flex items-center justify-between">
          <DialogTitle class="text-lg font-semibold">{{ title }}</DialogTitle>
          <button type="button" aria-label="Close" class="flex size-11 items-center justify-center rounded-[10px] border border-radio-line" @click="emit('close')">
            <X class="size-4" />
          </button>
        </div>
        <div
          role="status"
          class="flex items-center gap-4 rounded-[14px] border p-4"
          :class="
            c.status === 'answered'
              ? 'border-radio-green/40 bg-radio-green/10'
              : c.status === 'checking'
                ? 'border-radio-line bg-radio-raised'
                : 'border-radio-red/40 bg-radio-red/10'
          "
        >
          <span
            class="flex size-11 shrink-0 items-center justify-center rounded-full"
            :class="c.status === 'answered' ? 'bg-radio-green text-radio-page' : c.status === 'checking' ? 'text-radio-accent' : 'bg-radio-red/20 text-radio-red'"
          >
            <Check v-if="c.status === 'answered'" class="size-6" />
            <Loader2 v-else-if="c.status === 'checking'" class="size-7 animate-spin" />
            <span v-else class="text-lg font-bold">!</span>
          </span>
          <span class="flex flex-col gap-0.5">
            <span class="text-[17px] font-semibold">{{ headline }}</span>
            <span class="text-[13px] text-radio-text/75">{{ detail }}</span>
          </span>
        </div>
        <ul class="m-0 flex flex-col gap-2 p-0 text-sm">
          <li class="flex list-none items-center justify-between">
            <span class="flex items-center gap-2.5"><span class="size-2 rounded-full bg-radio-green" />Check sent to {{ c.target }} on TS{{ c.slot }}</span>
            <span class="font-mono text-xs text-radio-muted">{{ format(c.startedAt, 'HH:mm:ss') }}</span>
          </li>
          <li v-if="c.status !== 'checking'" class="flex list-none items-center justify-between">
            <span class="flex items-center gap-2.5">
              <span class="size-2 rounded-full" :class="c.status === 'answered' ? 'bg-radio-green' : 'bg-radio-red'" />{{ c.status === 'answered' ? 'Radio answered' : 'No answer' }}
            </span>
            <span class="font-mono text-xs text-radio-muted">{{ format(c.startedAt + c.elapsedMs, 'HH:mm:ss') }}</span>
          </li>
        </ul>
        <div class="grid grid-cols-3 gap-2">
          <button type="button" class="h-12 rounded-[12px] border border-radio-line text-sm disabled:opacity-50" :disabled="c.status === 'checking'" @click="emit('again', c.kind)">
            {{ c.status === 'noAnswer' ? 'Try again' : 'Check again' }}
          </button>
          <button type="button" class="h-12 rounded-[12px] border border-radio-line text-sm disabled:opacity-50" :disabled="c.status === 'checking'" @click="emit('again', c.kind === 'presence' ? 'radioCheck' : 'presence')">
            {{ c.kind === 'presence' ? 'Radio check' : 'Presence check' }}
          </button>
          <button type="button" class="h-12 rounded-[12px] bg-radio-amber text-sm font-bold text-radio-amber-ink disabled:opacity-50" :disabled="radio.link !== 'up'" @click="emit('call')">
            Private call
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
