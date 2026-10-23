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
import { Eye, EyeOff, X } from 'lucide-vue-next';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { computed, ref, watch } from 'vue';

import { hotspotError } from '@/lib/hotspots';

const props = defineProps<{ open: boolean; radioId: number }>();
const emit = defineEmits<{ close: []; use: [id: number, password: string, save: boolean] }>();

const id = ref('');
const password = ref('');
const save = ref(true);
const show = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) {
      id.value = '';
      password.value = '';
      save.value = true;
      show.value = false;
    }
  },
);

const idError = computed(() => (id.value ? hotspotError(id.value, props.radioId) : ''));
const ready = computed(() => id.value !== '' && !idError.value && password.value !== '');

function submit(): void {
  if (ready.value) {
    emit('use', Number(id.value), password.value, save.value);
  }
}

const inputClass = 'h-11 w-full rounded-[10px] border bg-radio-page px-3 text-[15px] text-radio-text outline-none focus-visible:border-radio-amber';
</script>

<template>
  <DialogRoot :open="open" @update:open="(v) => !v && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/70" />
      <DialogContent
        class="fixed top-[150px] left-1/2 z-50 flex w-[480px] -translate-x-1/2 flex-col gap-[18px] rounded-[20px] border border-radio-line bg-radio-raised p-[26px] text-radio-text shadow-2xl"
        aria-describedby="manual-help"
      >
        <form class="flex flex-col gap-[18px]" @submit.prevent="submit">
          <div class="flex items-center justify-between">
            <DialogTitle class="m-0 text-xl font-bold">Enter a hotspot by hand</DialogTitle>
            <button type="button" aria-label="Close" class="flex size-11 items-center justify-center rounded-[10px] border border-radio-line text-radio-text/80" @click="emit('close')">
              <X class="size-5" />
            </button>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="manual-id" class="text-[13px] font-semibold text-radio-text/80">Hotspot ID</label>
            <input
              id="manual-id"
              v-model.trim="id"
              inputmode="numeric"
              :aria-invalid="!!idError"
              aria-describedby="manual-id-error"
              :class="[inputClass, 'font-mono', idError ? 'border-radio-red' : 'border-radio-line']"
            />
            <span v-if="idError" id="manual-id-error" class="text-xs text-radio-red">{{ idError }}</span>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="manual-pw" class="text-[13px] font-semibold text-radio-text/80">Hotspot password</label>
            <div class="flex gap-2">
              <input id="manual-pw" v-model="password" :type="show ? 'text' : 'password'" autocomplete="current-password" :class="[inputClass, 'min-w-0 grow border-radio-line']" />
              <button
                type="button"
                :aria-label="show ? 'Hide password' : 'Show password'"
                class="flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-radio-line text-radio-text/80"
                @click="show = !show"
              >
                <EyeOff v-if="show" class="size-5" />
                <Eye v-else class="size-5" />
              </button>
            </div>
            <span id="manual-help" class="text-xs text-radio-muted">The password DMRHub showed when the hotspot was registered.</span>
          </div>
          <label class="flex items-center gap-2.5 text-sm"><input v-model="save" type="checkbox" class="size-[18px] accent-radio-amber" />Save the password on this device</label>
          <div class="flex justify-end gap-2.5">
            <button type="button" class="h-12 rounded-xl border border-radio-line px-[18px] text-[15px]" @click="emit('close')">Cancel</button>
            <button type="submit" class="h-12 rounded-xl bg-radio-amber px-[22px] text-[15px] font-bold text-radio-amber-ink disabled:opacity-50" :disabled="!ready">Use this hotspot</button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
