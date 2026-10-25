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
import { Bell } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import { useNow } from '@/composables/useNow';
import { useNames } from '@/lib/names';
import { keyOf } from '@/lib/threads';
import { since } from '@/lib/when';
import { useMessages } from '@/store/messages';

const messages = useMessages();
const names = useNames();
const now = useNow();
const router = useRouter();
const desktop = useMediaQuery('(min-width: 1024px)');

const alert = computed(() => messages.alerts[0]);

function callBack(): void {
  const a = alert.value;
  if (a) {
    messages.dismissAlert(a.id);
    void router.push({ path: '/', query: { call: String(a.source), ts: String(a.slot) } });
  }
}

function message(): void {
  const a = alert.value;
  if (a) {
    messages.dismissAlert(a.id);
    const peer = { group: false, id: a.source };
    messages.thread(peer, a.slot);
    void router.push(`/messages/${keyOf(peer)}`);
  }
}
</script>

<template>
  <div
    v-if="alert"
    role="alertdialog"
    :aria-label="`Call alert from ${names.name({ group: false, id: alert.source })}`"
    class="pointer-events-auto fixed z-[60] flex flex-col gap-3 border bg-radio-surface text-radio-text shadow-2xl"
    :class="desktop ? 'top-20 right-8 w-[360px] rounded-[18px] border-radio-amber p-4' : 'inset-x-0 bottom-0 items-center rounded-t-[22px] border-x-0 border-b-0 border-radio-amber px-4 pt-5 pb-[calc(1.75rem+env(safe-area-inset-bottom))]'"
  >
    <div v-if="desktop" class="flex items-center gap-3">
      <span class="flex size-10 items-center justify-center rounded-full bg-radio-amber-soft text-radio-accent"><Bell class="size-5" /></span>
      <span class="flex flex-col">
        <span class="font-semibold">Call alert from {{ names.name({ group: false, id: alert.source }) }}</span>
        <span class="text-xs text-radio-muted">ID {{ alert.source }} · TS{{ alert.slot }} · {{ now - alert.at < 60_000 ? 'just now' : since(alert.at, now, { addSuffix: true }) }}</span>
      </span>
    </div>
    <template v-else>
      <span class="flex size-[88px] items-center justify-center rounded-full bg-radio-amber-soft text-radio-accent"><Bell class="size-8" /></span>
      <span class="text-[13px] text-radio-muted">Call alert</span>
      <span class="font-mono text-[30px] font-bold">{{ names.name({ group: false, id: alert.source }) }}</span>
      <span class="text-[13px] text-radio-muted">ID {{ alert.source }} · TS{{ alert.slot }} · {{ now - alert.at < 60_000 ? 'just now' : since(alert.at, now, { addSuffix: true }) }}</span>
    </template>
    <div class="grid w-full gap-2" :class="desktop ? 'grid-cols-3' : 'grid-cols-2'">
      <button
        type="button"
        class="rounded-[12px] bg-radio-amber font-bold text-radio-amber-ink"
        :class="desktop ? 'h-10 text-sm' : 'col-span-2 h-[52px] text-base'"
        @click="callBack"
      >
        Call back
      </button>
      <button type="button" class="rounded-[12px] border border-radio-line" :class="desktop ? 'h-10 text-sm' : 'h-12'" @click="message">Message</button>
      <button type="button" class="rounded-[12px] border border-radio-line" :class="desktop ? 'h-10 text-sm' : 'h-12'" @click="messages.dismissAlert(alert.id)">Dismiss</button>
    </div>
  </div>
</template>
