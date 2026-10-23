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
import { Bell, Check, ChevronLeft, MessageCircle } from 'lucide-vue-next';
import { computed } from 'vue';

import RadioLogo from '@/components/RadioLogo.vue';
import PeerAvatar from '@/components/messages/PeerAvatar.vue';
import { useContacts } from '@/store/contacts';

import StarButton from './StarButton.vue';

const props = withDefaults(defineProps<{ id: number; compact?: boolean }>(), { compact: false });
const emit = defineEmits<{ back: []; message: []; call: []; check: []; alert: [] }>();

const contacts = useContacts();
const c = computed(() => contacts.get(props.id));
const who = computed(() => c.value?.callsign || String(props.id));

const heard = computed(() => {
  const x = c.value;
  if (!x?.heardAt) {
    return 'not heard yet';
  }
  const where = x.heardGroup ? `TG ${x.heardTarget}` : 'a private call';
  return `last heard on ${where}, ${formatDistanceToNowStrict(x.heardAt, { addSuffix: true })}`;
});

const name = computed({
  get: () => c.value?.name ?? '',
  set: (v: string) => contacts.update(props.id, { name: v }),
});
const note = computed({
  get: () => c.value?.note ?? '',
  set: (v: string) => contacts.update(props.id, { note: v }),
});

const action = 'flex flex-col items-center justify-center gap-1.5 rounded-[14px] text-sm';
const field = 'rounded-[10px] border border-radio-line bg-radio-surface px-3 text-sm text-radio-text outline-none focus-visible:border-radio-amber';
</script>

<template>
  <section :aria-label="`Contact ${who}`" class="flex min-w-0 grow flex-col items-center overflow-y-auto" :class="compact ? 'gap-5 px-4 pb-6' : 'gap-6 px-6 py-14'">
    <header v-if="compact" class="flex h-14 w-full items-center">
      <button type="button" aria-label="Back to contacts" class="-ml-2 flex size-11 items-center justify-center text-radio-accent" @click="emit('back')">
        <ChevronLeft class="size-6" />
      </button>
    </header>
    <PeerAvatar class="!text-[28px]" :peer="{ group: false, id }" :size="compact ? 80 : 88" />
    <div class="flex flex-col items-center gap-1.5 text-center">
      <div class="flex items-center gap-1.5">
        <span class="font-mono font-bold" :class="compact ? 'text-[26px]' : 'text-[30px]'">{{ who }}</span>
        <StarButton :id="id" :callsign="c?.callsign" :size="22" />
      </div>
      <span class="text-sm text-radio-muted">ID {{ id }} · {{ heard }}</span>
    </div>
    <div class="grid gap-2.5" :class="compact ? 'w-full grid-cols-2' : 'grid-cols-[repeat(4,140px)]'">
      <button type="button" :class="[action, 'h-[72px] bg-radio-amber font-bold text-radio-amber-ink']" @click="emit('message')"><MessageCircle class="size-5" />Message</button>
      <button type="button" :class="[action, 'h-[72px] border border-radio-line']" @click="emit('call')"><RadioLogo class="size-5" />Private call</button>
      <button type="button" :class="[action, 'h-[72px] border border-radio-line']" @click="emit('check')"><Check class="size-5" />Radio check</button>
      <button type="button" :class="[action, 'h-[72px] border border-radio-line']" @click="emit('alert')"><Bell class="size-5" />Call alert</button>
    </div>
    <div v-if="c" class="flex flex-col gap-2" :class="compact ? 'w-full' : 'w-[590px] max-w-full'">
      <label :for="`cname-${id}`" class="text-xs text-radio-muted">Name, shown with the callsign</label>
      <input :id="`cname-${id}`" v-model="name" placeholder="Add a name" :class="[field, 'h-11']" />
      <label :for="`cnote-${id}`" class="mt-2 text-xs text-radio-muted">Note</label>
      <textarea :id="`cnote-${id}`" v-model="note" rows="3" placeholder="Anything to remember, like when they're on the air" :class="[field, 'resize-none py-3']" />
      <span class="mt-1 text-xs text-radio-muted">Contacts stay in this browser and go with settings Export. Calls, texts and the map show their names.</span>
    </div>
    <p v-else class="m-0 text-sm text-radio-muted">{{ who }} is not a contact. Star them to keep them here.</p>
  </section>
</template>
