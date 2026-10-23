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
import { Plus } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import AppNav from '@/components/AppNav.vue';
import CheckDialog from '@/components/messages/CheckDialog.vue';
import NewMessageDialog from '@/components/messages/NewMessageDialog.vue';
import ThreadList from '@/components/messages/ThreadList.vue';
import ThreadView from '@/components/messages/ThreadView.vue';
import { toast } from '@/components/ui/toast';
import { useNames } from '@/lib/names';
import { peerOf } from '@/lib/threads';
import type { CheckKind } from '@/radio/protocol';
import { useMessages } from '@/store/messages';
import { useRadio } from '@/store/radio';

const route = useRoute();
const router = useRouter();
const store = useMessages();
const radio = useRadio();
const names = useNames();
const desktop = useMediaQuery('(min-width: 1024px)');

const composing = ref(false);
const checkId = ref<number | null>(null);

const selected = computed(() => {
  const k = typeof route.params.thread === 'string' ? route.params.thread : '';
  return k && peerOf(k) ? k : null;
});

watch(
  selected,
  (k) => {
    const p = k ? peerOf(k) : null;
    if (k && p && !store.threadMap[k]) {
      store.thread(p, 2);
    }
    store.setOpen(k);
  },
  { immediate: true },
);
watch(
  () => [desktop.value, store.threads.length] as const,
  ([d]) => {
    if (d && !selected.value && store.threads[0]) {
      void router.replace(`/messages/${store.threads[0].key}`);
    }
  },
  { immediate: true },
);

function open(key: string): void {
  void router.push(`/messages/${key}`);
}

function onCheck(kind: CheckKind): void {
  const k = selected.value;
  const t = k ? store.threadMap[k] : undefined;
  if (!t || t.peer.group) {
    return;
  }
  const id = radio.check(kind, t.peer.id, t.slot);
  if (kind !== 'callAlert') {
    checkId.value = id;
    return;
  }
  const who = names.name(t.peer);
  const stop = watch(
    () => store.checks[id]?.status,
    (s) => {
      if (!s || s === 'checking') {
        return;
      }
      stop();
      if (s === 'answered') {
        toast.success(`Call alert reached ${who}`);
      } else {
        toast.error(`Call alert to ${who}: ${s === 'noAnswer' ? 'no answer' : 'not sent'}`);
      }
    },
    { immediate: true },
  );
}

function again(kind: CheckKind): void {
  onCheck(kind);
}

function call(): void {
  const k = selected.value;
  const t = k ? store.threadMap[k] : undefined;
  if (t && !t.peer.group) {
    checkId.value = null;
    radio.startPrivateCall(t.peer.id, t.slot);
    void router.push('/');
  }
}
</script>

<template>
  <main v-if="desktop" class="grid min-h-0 grow grid-cols-[340px_minmax(0,1fr)]" style="height: calc(100dvh - 64px)">
    <ThreadList class="border-r border-radio-line" :selected="selected" @open="open" @compose="composing = true" />
    <ThreadView v-if="selected" :thread-key="selected" @check="onCheck" @call="call" />
    <div v-else class="flex items-center justify-center text-sm text-radio-muted">Pick a conversation, or start one with +.</div>
  </main>
  <template v-else>
    <main v-if="!selected" class="relative flex min-h-0 grow flex-col px-4">
      <h1 class="m-0 pb-3 text-[28px] font-bold">Messages</h1>
      <ThreadList compact class="min-h-0 grow" :selected="null" @open="open" />
      <button
        type="button"
        aria-label="New message"
        class="absolute right-4 bottom-4 flex size-14 items-center justify-center rounded-[18px] bg-radio-amber text-radio-amber-ink shadow-lg"
        @click="composing = true"
      >
        <Plus class="size-6" />
      </button>
    </main>
    <AppNav v-if="!selected" bar />
    <div v-else class="fixed inset-0 z-30 flex flex-col bg-radio-page">
      <ThreadView compact :thread-key="selected" @back="router.push('/messages')" @check="onCheck" @call="call" />
    </div>
  </template>
  <NewMessageDialog v-model:open="composing" :compact="!desktop" @sent="open" />
  <CheckDialog :check-id="checkId" @close="checkId = null" @again="again" @call="call" />
</template>
