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
import { useIntervalFn, useMediaQuery } from '@vueuse/core';
import { Bell } from 'lucide-vue-next';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import RadioLogo from '@/components/RadioLogo.vue';
import PeerAvatar from '@/components/messages/PeerAvatar.vue';
import { useNames } from '@/lib/names';
import { keyOf } from '@/lib/threads';
import { useMessages } from '@/store/messages';
import { useRadio } from '@/store/radio';

const radio = useRadio();
const messages = useMessages();
const names = useNames();
const router = useRouter();
const desktop = useMediaQuery('(min-width: 1024px)');
const now = ref(Date.now());
useIntervalFn(() => (now.value = Date.now()), 1000);

const pc = computed(() => radio.privateCall);
const pcName = computed(() => (pc.value ? names.name({ group: false, id: pc.value.id }) : ''));
const elapsed = computed(() => {
  if (!pc.value) {
    return '00:00';
  }
  const s = Math.max(0, Math.floor((now.value - pc.value.startedAt) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
});
const talking = computed(() => {
  const c = pc.value ? radio.calls[pc.value.slot as 1 | 2] : undefined;
  return !!c?.active && c.source === pc.value?.id;
});
const alert = computed(() => messages.alerts[0]);

function answer(): void {
  if (radio.incoming) {
    radio.startPrivateCall(radio.incoming.source, radio.incoming.slot);
    void router.push('/');
  }
}

function callBack(): void {
  const a = alert.value;
  if (a) {
    messages.dismissAlert(a.id);
    radio.startPrivateCall(a.source, a.slot);
    void router.push('/');
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
    v-if="pc && desktop"
    role="status"
    class="mx-8 mt-4 flex items-center gap-4 rounded-[14px] border border-radio-green/40 bg-radio-green/10 px-5 py-3"
  >
    <span class="size-2.5 rounded-full bg-radio-green shadow-[0_0_8px_var(--radio-green)]" />
    <span class="font-semibold">Private call with {{ pcName }}</span>
    <span class="font-mono text-sm text-radio-text/80">{{ elapsed }}</span>
    <span class="text-[13px] text-radio-muted">{{ talking ? `${pcName} is talking` : `TS${pc.slot} · hold PTT or the space bar to talk` }}</span>
    <button type="button" class="ml-auto h-10 rounded-[10px] bg-radio-red/20 px-4 text-sm font-semibold text-radio-red" @click="radio.endPrivateCall()">End</button>
  </div>

  <div v-if="pc && !desktop" class="fixed inset-0 z-40 flex flex-col items-center bg-radio-page px-5 pt-12 pb-6" role="dialog" aria-modal="true" :aria-label="`Private call with ${pcName}`">
    <span class="text-[13px] text-radio-muted">Private call · TS{{ pc.slot }}</span>
    <PeerAvatar class="mt-6 !text-[26px]" :peer="{ group: false, id: pc.id }" :size="96" />
    <span class="mt-5 font-mono text-[30px] font-bold">{{ pcName }}</span>
    <span class="text-sm text-radio-muted">ID {{ pc.id }}</span>
    <span class="mt-2 font-mono text-lg">{{ elapsed }}</span>
    <span
      v-if="talking"
      class="mt-4 flex items-center gap-2 rounded-full border border-radio-green/40 bg-radio-green/10 px-4 py-2 text-sm"
    >
      <span class="size-2 rounded-full bg-radio-green" />{{ pcName }} is talking
    </span>
    <button
      type="button"
      class="mt-auto flex h-[170px] w-full select-none flex-col items-center justify-center gap-1.5 rounded-[22px] border text-xl font-bold tracking-[0.2em]"
      :class="radio.tx.active ? 'border-radio-red bg-radio-red/20 text-radio-red' : 'border-radio-chassis-line bg-radio-ptt'"
      style="touch-action: none"
      @pointerdown="radio.pttDown()"
      @pointerup="radio.pttUp()"
      @pointercancel="radio.pttUp()"
      @contextmenu.prevent
    >
      {{ radio.tx.active ? 'TRANSMITTING' : 'PUSH TO TALK' }}
      <span class="text-xs font-medium tracking-[0.06em] text-radio-muted">{{ radio.tx.active ? 'Release to stop' : 'Press and hold' }}</span>
    </button>
    <button type="button" class="mt-4 h-[52px] w-full rounded-[14px] bg-radio-red/20 text-base font-semibold text-radio-red" @click="radio.endPrivateCall()">End call</button>
  </div>

  <DialogRoot :open="!!radio.incoming" @update:open="(v) => !v && (radio.incoming = null)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/70" />
      <DialogContent
        v-if="radio.incoming"
        class="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 rounded-t-[22px] border-t border-radio-green/60 bg-radio-surface p-6 text-radio-text sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[22px] sm:border"
      >
        <span class="flex size-[88px] items-center justify-center rounded-full bg-radio-green/10">
          <span class="flex size-16 items-center justify-center rounded-full bg-radio-green/10 text-radio-green"><RadioLogo class="size-7" /></span>
        </span>
        <DialogDescription class="text-[13px] text-radio-muted">Incoming private call</DialogDescription>
        <DialogTitle class="font-mono text-[30px] font-bold">{{ names.name({ group: false, id: radio.incoming.source }) }}</DialogTitle>
        <span class="text-[13px] text-radio-muted">ID {{ radio.incoming.source }} · TS{{ radio.incoming.slot }}</span>
        <div class="mt-3 grid w-full grid-cols-2 gap-3">
          <button type="button" class="h-[52px] rounded-[14px] bg-radio-green text-base font-bold text-radio-page" @click="answer">Answer</button>
          <button type="button" class="h-[52px] rounded-[14px] border border-radio-line text-base" @click="radio.incoming = null">Ignore</button>
        </div>
        <span class="pt-2 text-xs text-radio-muted">Answer, then hold PTT or the space bar to talk back.</span>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <div
    v-if="alert"
    role="alertdialog"
    :aria-label="`Call alert from ${names.name({ group: false, id: alert.source })}`"
    class="fixed z-50 flex flex-col gap-3 border bg-radio-surface text-radio-text shadow-2xl"
    :class="desktop ? 'top-20 right-8 w-[360px] rounded-[18px] border-radio-amber p-4' : 'inset-x-0 bottom-0 items-center rounded-t-[22px] border-x-0 border-b-0 border-radio-amber px-4 pt-5 pb-7'"
  >
    <div v-if="desktop" class="flex items-center gap-3">
      <span class="flex size-10 items-center justify-center rounded-full bg-radio-amber-soft text-radio-accent"><Bell class="size-5" /></span>
      <span class="flex flex-col">
        <span class="font-semibold">Call alert from {{ names.name({ group: false, id: alert.source }) }}</span>
        <span class="text-xs text-radio-muted">ID {{ alert.source }} · TS{{ alert.slot }} · just now</span>
      </span>
    </div>
    <template v-else>
      <span class="flex size-[88px] items-center justify-center rounded-full bg-radio-amber-soft text-radio-accent"><Bell class="size-8" /></span>
      <span class="text-[13px] text-radio-muted">Call alert</span>
      <span class="font-mono text-[30px] font-bold">{{ names.name({ group: false, id: alert.source }) }}</span>
      <span class="text-[13px] text-radio-muted">ID {{ alert.source }} · TS{{ alert.slot }} · just now</span>
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
