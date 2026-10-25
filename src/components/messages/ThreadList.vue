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
import { Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import { useNow } from '@/composables/useNow';
import { useNames } from '@/lib/names';
import { listTime } from '@/lib/when';
import { hubOrigin } from '@/radio/discover';
import { useAccount } from '@/store/account';
import { useMessages } from '@/store/messages';

import PeerAvatar from './PeerAvatar.vue';

defineProps<{ selected: string | null; compact?: boolean }>();
const emit = defineEmits<{ open: [key: string]; compose: [] }>();

const store = useMessages();
const names = useNames();
const now = useNow();
const account = useAccount();
const query = ref('');

const storageOff = computed(() => account.loggedIn && account.can('messages:read') && account.user?.smsStorage === false);
const hubSettings = computed(() => {
  try {
    return new URL('/settings', hubOrigin(account.host)).toString();
  } catch {
    return '';
  }
});
const hubName = computed(() => {
  try {
    return hubOrigin(account.host).host;
  } catch {
    return account.host;
  }
});

const rows = computed(() => {
  const q = query.value.trim().toLowerCase();
  return store.threads
    .map((t) => {
      const msgs = store.forThread(t.key);
      const last = msgs[msgs.length - 1];
      const who = names.name(t.peer);
      let preview = last?.text ?? '';
      if (last?.dir === 'out') {
        preview = `You: ${preview}`;
      } else if (last && t.peer.group) {
        preview = `${names.callsign(last.from) || last.from}: ${preview}`;
      }
      return { t, who, preview, at: last?.at ?? t.lastAt, texts: msgs };
    })
    .filter((r) => !q || r.who.toLowerCase().includes(q) || String(r.t.peer.id).includes(q) || r.texts.some((m) => m.text.toLowerCase().includes(q)));
});
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <slot v-if="compact" name="tabs" />
    <div class="flex gap-2.5" :class="compact ? 'pt-2.5 pb-2' : $slots.tabs ? 'p-4 pb-2.5' : 'p-4'">
      <input
        v-model="query"
        type="search"
        aria-label="Search messages"
        placeholder="Search callsign or text"
        class="h-11 min-w-0 grow rounded-[10px] border border-radio-line bg-radio-raised px-3.5 text-[15px] text-radio-text outline-none focus-visible:border-radio-amber"
      />
      <button
        v-if="!compact"
        type="button"
        aria-label="New message"
        class="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-radio-amber text-radio-amber-ink"
        @click="emit('compose')"
      >
        <Plus class="size-5" />
      </button>
    </div>
    <div v-if="!compact && $slots.tabs" class="px-4 pb-2"><slot name="tabs" /></div>
    <p v-if="rows.length === 0" class="m-0 px-4 py-6 text-sm text-radio-muted">
      {{ query ? 'Nothing matches.' : 'No messages yet. Texts you send and get show up here.' }}
    </p>
    <p v-if="rows.length === 0 && !query && storageOff" class="m-0 px-4 pb-6 text-sm text-radio-muted">
      SMS Storage is off for your account on {{ hubName }}, so the hub keeps no inbox for you and only texts this radio hears show up here. Turn it on in
      <a :href="hubSettings" target="_blank" rel="noopener" class="text-radio-accent underline">your DMRHub settings</a>.
    </p>
    <ul class="m-0 flex min-h-0 flex-col overflow-y-auto p-0">
      <li v-for="r in rows" :key="r.t.key" class="list-none">
        <button
          type="button"
          class="flex w-full items-center gap-3.5 border-l-[3px] py-3 text-left"
          :class="[selected === r.t.key ? 'border-radio-amber bg-radio-raised' : 'border-transparent', compact ? 'pr-0 pl-0' : 'pr-4 pl-4']"
          :aria-current="selected === r.t.key ? 'true' : undefined"
          @click="emit('open', r.t.key)"
        >
          <PeerAvatar :peer="r.t.peer" />
          <span class="flex min-w-0 grow flex-col gap-1" :class="compact ? 'border-b border-radio-line pb-3' : ''">
            <span class="flex items-center justify-between gap-2">
              <span class="truncate text-[15px] font-semibold">{{ r.who }}</span>
              <span class="shrink-0 text-xs" :class="r.t.unread ? 'font-semibold text-radio-accent' : 'text-radio-muted'">{{ listTime(r.at, new Date(now)) }}</span>
            </span>
            <span class="flex items-center justify-between gap-2">
              <span class="truncate text-sm" :class="r.t.unread ? 'font-semibold text-radio-text' : 'text-radio-text/75'">{{ r.preview }}</span>
              <span v-if="r.t.unread" class="size-2 shrink-0 rounded-full bg-radio-amber" aria-label="Unread" />
            </span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
