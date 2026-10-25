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
import { MapPin, MessageCircle } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { useMessages } from '@/store/messages';

import RadioLogo from './RadioLogo.vue';

defineProps<{ bar?: boolean }>();

const route = useRoute();
const messages = useMessages();

const items = computed(() => [
  { to: '/', label: 'Radio', active: route.name === 'radio', badge: 0, icon: 'radio' },
  { to: '/messages', label: 'Messages', active: String(route.name ?? '').startsWith('messages'), badge: messages.unread, icon: 'messages' },
  { to: '/map', label: 'Map', active: route.name === 'map', badge: 0, icon: 'map' },
]);
</script>

<template>
  <nav v-if="bar" aria-label="Main" class="sticky bottom-0 -mb-[env(safe-area-inset-bottom)] box-content grid h-16 shrink-0 grid-cols-3 border-t border-radio-line bg-radio-surface pb-[env(safe-area-inset-bottom)] rail:col-start-1 rail:row-start-2 rail:mb-0! rail:h-auto! rail:w-[72px] rail:grid-cols-1! rail:grid-rows-3 rail:border-t-0 rail:border-r rail:bg-radio-page rail:pb-0!">
    <RouterLink
      v-for="i in items"
      :key="i.to"
      :to="i.to"
      :aria-current="i.active ? 'page' : undefined"
      class="no-underline flex flex-col items-center justify-center gap-1 text-xs"
      :class="i.active ? 'font-semibold text-radio-accent' : 'text-radio-text/70'"
    >
      <span class="relative flex">
        <RadioLogo v-if="i.icon === 'radio'" class="size-[22px]" />
        <MapPin v-else-if="i.icon === 'map'" class="size-[22px]" />
        <MessageCircle v-else class="size-[22px]" />
        <span
          v-if="i.badge"
          class="absolute -top-1.5 -right-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-radio-amber px-1.5 text-[11px] font-bold text-radio-amber-ink"
        >
          {{ i.badge }}
        </span>
      </span>
      {{ i.label }}
    </RouterLink>
  </nav>
  <nav v-else aria-label="Main" class="flex gap-1 rounded-[10px] border border-radio-line bg-radio-surface p-1">
    <RouterLink
      v-for="i in items"
      :key="i.to"
      :to="i.to"
      :aria-current="i.active ? 'page' : undefined"
      class="no-underline flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm"
      :class="i.active ? 'bg-radio-raised font-semibold text-radio-text' : 'text-radio-text/80'"
    >
      {{ i.label }}
      <span
        v-if="i.badge"
        class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-radio-amber px-1.5 text-[11px] font-bold text-radio-amber-ink"
      >
        {{ i.badge }}
      </span>
    </RouterLink>
  </nav>
</template>
