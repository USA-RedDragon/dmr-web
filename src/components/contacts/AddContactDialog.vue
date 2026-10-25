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
import { X } from 'lucide-vue-next';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { computed, ref, watch } from 'vue';

import { useNames } from '@/lib/names';
import { useContacts } from '@/store/contacts';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; added: [id: number] }>();

const contacts = useContacts();
const names = useNames();
const id = ref('');
const callsign = ref('');

watch(
  () => props.open,
  (o) => {
    if (o) {
      id.value = '';
      callsign.value = '';
    }
  },
);

const n = computed(() => (/^\d{1,8}$/.test(id.value) ? Number(id.value) : 0));
const valid = computed(() => n.value > 0 && n.value < 1 << 24);
const known = computed(() => (valid.value ? names.callsign(n.value) : ''));

function add(): void {
  if (!valid.value) {
    return;
  }
  const c = contacts.add(n.value, callsign.value.trim() || known.value);
  emit('update:open', false);
  emit('added', c.id);
}

const inputClass = 'h-11 w-full rounded-[10px] border border-radio-line bg-radio-page px-3 text-[15px] text-radio-text outline-none focus-visible:border-radio-amber';
</script>

<template>
  <DialogRoot :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/70" />
      <DialogContent
        class="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 max-h-dvh overflow-y-auto rounded-t-[22px] border-t border-radio-line bg-radio-raised p-4 pb-[calc(1.75rem+env(safe-area-inset-bottom))] text-radio-text sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[400px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:border sm:p-6"
        :aria-describedby="undefined"
      >
        <form class="flex flex-col gap-4" @submit.prevent="add">
          <div class="flex items-center justify-between">
            <DialogTitle class="m-0 text-lg font-bold">Add a contact by ID</DialogTitle>
            <button type="button" aria-label="Close" class="flex size-11 items-center justify-center rounded-[10px] border border-radio-line" @click="emit('update:open', false)">
              <X class="size-5" />
            </button>
          </div>
          <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
            Radio ID
            <input v-model.trim="id" inputmode="numeric" :class="[inputClass, 'font-mono']" autocomplete="off" />
          </label>
          <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
            Callsign <span class="sr-only">(optional)</span>
            <input v-model.trim="callsign" :placeholder="known || 'Optional'" :class="[inputClass, 'font-mono uppercase']" autocomplete="off" />
          </label>
          <p v-if="valid && contacts.has(n)" class="m-0 text-xs text-radio-muted">{{ known || n }} is already a contact.</p>
          <button type="submit" class="h-12 rounded-xl bg-radio-amber text-[15px] font-bold text-radio-amber-ink disabled:opacity-50" :disabled="!valid || contacts.has(n)">Add contact</button>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
