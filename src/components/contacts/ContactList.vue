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
import { formatDistanceToNowStrict } from 'date-fns';
import { Plus } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import PeerAvatar from '@/components/messages/PeerAvatar.vue';
import { matchContact, useContacts, type Contact } from '@/store/contacts';

import StarButton from './StarButton.vue';

defineProps<{ selected: number | null; compact?: boolean }>();
const emit = defineEmits<{ open: [id: number]; add: [] }>();

const contacts = useContacts();
const query = ref('');

const rows = computed(() => contacts.contacts.filter((c) => matchContact(c, query.value)));

function sub(c: Contact): string {
  const heard = c.heardAt ? `heard ${formatDistanceToNowStrict(c.heardAt, { addSuffix: true })}` : 'not heard yet';
  return `${c.name ? `${c.name} · ` : ''}ID ${c.id} · ${heard}`;
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <slot v-if="compact" name="tabs" />
    <div class="flex gap-2.5" :class="compact ? 'pt-2.5 pb-2' : 'p-4 pb-2.5'">
      <input
        v-model="query"
        type="search"
        aria-label="Search contacts"
        placeholder="Search contacts"
        class="h-11 min-w-0 grow rounded-[10px] border border-radio-line bg-radio-raised px-3.5 text-[15px] text-radio-text outline-none focus-visible:border-radio-amber"
      />
      <button
        v-if="!compact"
        type="button"
        aria-label="Add a contact by ID"
        class="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-radio-amber text-radio-amber-ink"
        @click="emit('add')"
      >
        <Plus class="size-5" />
      </button>
    </div>
    <div v-if="!compact" class="px-4"><slot name="tabs" /></div>
    <ul class="m-0 flex min-h-0 flex-col overflow-y-auto p-0" :class="compact ? '' : 'pt-2'">
      <li v-for="c in rows" :key="c.id" class="flex list-none items-center gap-3 border-l-[3px] py-1.5 pr-1.5" :class="[selected === c.id ? 'border-radio-amber bg-radio-raised' : 'border-transparent', compact ? 'min-h-16 pl-0' : 'pl-4']">
        <PeerAvatar :peer="{ group: false, id: c.id }" :size="compact ? 44 : 40" />
        <button
          type="button"
          class="flex min-w-0 grow flex-col gap-0.5 text-left"
          :class="compact ? 'border-b border-radio-line pt-2 pb-2.5' : ''"
          :aria-current="selected === c.id ? 'true' : undefined"
          @click="emit('open', c.id)"
        >
          <span class="truncate font-mono font-semibold" :class="compact ? 'text-[15px]' : 'text-sm'">{{ c.callsign || c.id }}</span>
          <span class="truncate text-radio-muted" :class="compact ? 'text-[13px]' : 'text-xs'">{{ sub(c) }}</span>
        </button>
        <StarButton :id="c.id" :callsign="c.callsign" />
      </li>
    </ul>
    <p v-if="!rows.length && query" class="m-0 px-4 py-6 text-sm text-radio-muted">Nothing matches.</p>
    <p class="m-0 text-radio-muted" :class="compact ? 'px-4 py-3 text-[13px] leading-normal' : 'p-4 text-xs leading-normal'">
      {{
        compact
          ? 'Star anyone in Last heard or a conversation to add them. Tap a contact to message, call or check them.'
          : 'Star anyone in Last heard or a conversation to add them here.'
      }}
    </p>
  </div>
</template>
