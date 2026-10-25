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
import AddContactDialog from '@/components/contacts/AddContactDialog.vue';
import ContactDetail from '@/components/contacts/ContactDetail.vue';
import ContactList from '@/components/contacts/ContactList.vue';
import MessagesTabs from '@/components/contacts/MessagesTabs.vue';
import CheckDialog from '@/components/messages/CheckDialog.vue';
import NewMessageDialog from '@/components/messages/NewMessageDialog.vue';
import ThreadList from '@/components/messages/ThreadList.vue';
import ThreadView from '@/components/messages/ThreadView.vue';
import { toast } from '@/components/ui/toast';
import { useNames } from '@/lib/names';
import { keyOf, peerOf, type Peer } from '@/lib/threads';
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
const adding = ref(false);

const tab = computed(() => (route.name === 'messages-contacts' ? 'contacts' : 'chats'));
const contactId = computed(() => {
  const n = Number(route.params.id);
  return tab.value === 'contacts' && Number.isInteger(n) && n > 0 ? n : null;
});
const checkId = ref<number | null>(null);

const selected = computed(() => {
  const k = typeof route.params.thread === 'string' ? route.params.thread : '';
  return k && peerOf(k) ? k : null;
});

watch(
  selected,
  (k) => {
    if (tab.value === 'contacts') {
      return;
    }
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
    if (d && tab.value === 'chats' && !selected.value && store.threads[0]) {
      void router.replace(`/messages/${store.threads[0].key}`);
    }
  },
  { immediate: true },
);

function open(key: string): void {
  void router.push(`/messages/${key}`);
}

function openContact(id: number): void {
  void router.push(`/messages/contacts/${id}`);
}

function messageContact(id: number): void {
  const peer: Peer = { group: false, id };
  store.thread(peer, 2);
  void router.push(`/messages/${keyOf(peer)}`);
}

function callContact(id: number): void {
  void router.push({ path: '/', query: { call: String(id), ts: '2' } });
}

function onCheck(kind: CheckKind): void {
  const k = selected.value;
  const t = k ? store.threadMap[k] : undefined;
  if (t && !t.peer.group) {
    checkPeer(kind, t.peer, t.slot);
  }
}

const checked = ref<{ peer: Peer; slot: number } | null>(null);

function checkPeer(kind: CheckKind, peer: Peer, slot: number): void {
  const t = { peer, slot };
  checked.value = t;
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
  if (checked.value) {
    checkPeer(kind, checked.value.peer, checked.value.slot);
  }
}

function call(): void {
  const k = selected.value;
  const t = (k ? store.threadMap[k] : undefined) ?? checked.value;
  if (t && !t.peer.group) {
    checkId.value = null;
    void router.push({ path: '/', query: { call: String(t.peer.id), ts: String(t.slot) } });
  }
}
</script>

<template>
  <main v-if="desktop" class="grid min-h-0 grow grid-cols-[340px_minmax(0,1fr)]">
    <ContactList v-if="tab === 'contacts'" class="border-r border-radio-line" :selected="contactId" @open="openContact" @add="adding = true">
      <template #tabs><MessagesTabs tab="contacts" /></template>
    </ContactList>
    <ThreadList v-else class="border-r border-radio-line" :selected="selected" @open="open" @compose="composing = true">
      <template #tabs><MessagesTabs tab="chats" /></template>
    </ThreadList>
    <template v-if="tab === 'contacts'">
      <ContactDetail
        v-if="contactId"
        :id="contactId"
        @message="messageContact(contactId)"
        @call="callContact(contactId)"
        @check="checkPeer('radioCheck', { group: false, id: contactId }, 2)"
        @alert="checkPeer('callAlert', { group: false, id: contactId }, 2)"
      />
      <div v-else class="flex items-center justify-center text-sm text-radio-muted">Pick a contact, or add one with +.</div>
    </template>
    <ThreadView v-else-if="selected" :thread-key="selected" @check="onCheck" @call="call" />
    <div v-else class="flex items-center justify-center text-sm text-radio-muted">Pick a conversation, or start one with +.</div>
  </main>
  <template v-else>
    <main v-if="!selected && !contactId" class="relative flex min-h-0 grow flex-col px-4">
      <h1 class="m-0 pb-3 text-[28px] font-bold">Messages</h1>
      <ContactList v-if="tab === 'contacts'" compact class="min-h-0 grow" :selected="null" @open="openContact">
        <template #tabs><MessagesTabs tab="contacts" compact /></template>
      </ContactList>
      <ThreadList v-else compact class="min-h-0 grow" :selected="null" @open="open">
        <template #tabs><MessagesTabs tab="chats" compact /></template>
      </ThreadList>
      <button
        type="button"
        :aria-label="tab === 'contacts' ? 'Add a contact by ID' : 'New message'"
        class="absolute right-4 bottom-4 flex size-14 items-center justify-center rounded-[18px] bg-radio-amber text-radio-amber-ink shadow-lg"
        @click="tab === 'contacts' ? (adding = true) : (composing = true)"
      >
        <Plus class="size-6" />
      </button>
    </main>
    <AppNav v-if="!selected && !contactId" bar />
    <div v-else-if="contactId" class="fixed inset-0 z-30 flex flex-col bg-radio-page pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <ContactDetail
        :id="contactId"
        compact
        @back="router.push('/messages/contacts')"
        @message="messageContact(contactId)"
        @call="callContact(contactId)"
        @check="checkPeer('radioCheck', { group: false, id: contactId }, 2)"
        @alert="checkPeer('callAlert', { group: false, id: contactId }, 2)"
      />
    </div>
    <div v-else class="fixed inset-0 z-30 flex flex-col bg-radio-page pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <ThreadView compact :thread-key="selected!" @back="router.push('/messages')" @check="onCheck" @call="call" />
    </div>
  </template>
  <NewMessageDialog v-model:open="composing" :compact="!desktop" @sent="open" />
  <AddContactDialog v-model:open="adding" @added="openContact" />
  <CheckDialog :check-id="checkId" @close="checkId = null" @again="again" @call="call" />
</template>
