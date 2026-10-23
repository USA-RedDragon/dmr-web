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
import { Star } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import { UNDO_MS, useContacts } from '@/store/contacts';

const contacts = useContacts();
const desktop = useMediaQuery('(min-width: 1024px)');
const shown = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => contacts.undo,
  (u) => {
    clearTimeout(timer);
    shown.value = !!u;
    if (u) {
      timer = setTimeout(() => {
        shown.value = false;
      }, UNDO_MS);
    }
  },
);

const who = computed(() => {
  const c = contacts.undo?.contact;
  return c ? c.callsign || String(c.id) : '';
});

function undo(): void {
  contacts.takeBack();
  shown.value = false;
}
</script>

<template>
  <div
    v-if="shown && contacts.undo"
    role="status"
    class="fixed z-40 flex items-center border border-radio-line shadow-2xl"
    :class="
      desktop
        ? 'right-8 bottom-8 gap-3.5 rounded-[14px] bg-radio-raised py-3 pr-3 pl-4 text-sm'
        : 'inset-x-4 bottom-[86px] gap-2.5 rounded-[14px] bg-radio-knob py-2.5 pr-2.5 pl-3.5 text-sm'
    "
  >
    <Star class="size-[18px] shrink-0" :class="contacts.undo.added ? 'fill-radio-amber text-radio-amber' : 'text-radio-muted'" aria-hidden="true" />
    <span class="grow"><b>{{ who }}</b> {{ contacts.undo.added ? 'added to' : 'removed from' }} contacts</span>
    <button type="button" class="shrink-0 rounded-lg border border-radio-line px-3 text-[13px]" :class="desktop ? 'h-9' : 'h-10'" @click="undo">Undo</button>
  </div>
</template>
