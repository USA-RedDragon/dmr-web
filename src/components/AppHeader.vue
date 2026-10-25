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
import { Settings } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { goBack } from '@/lib/nav';
import { useAccount } from '@/store/account';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

import AppNav from './AppNav.vue';
import RadioLogo from './RadioLogo.vue';

const radio = useRadio();
const store = useSettings();
const account = useAccount();
const choosing = computed(() => account.loggedIn && !store.configured);
const route = useRoute();
const router = useRouter();

const inSettings = computed(() => String(route.name ?? '').startsWith('settings'));

const pill = computed(() => {
  const hub = store.settings.hub.host;
  switch (radio.link) {
    case 'up':
      return { dot: 'bg-radio-green', text: hub, extra: ['WebTransport', `Hotspot ${store.settings.hotspot.id}`] };
    case 'connecting':
      return { dot: 'bg-radio-amber', text: hub, extra: ['Connecting'] };
    case 'reconnecting':
      return { dot: 'bg-radio-amber', text: hub, extra: ['Reconnecting'] };
    case 'failed':
      return { dot: 'bg-radio-red', text: hub, extra: ['No link'] };
    default:
      return choosing.value ? { dot: 'bg-led-off', text: hub, extra: ['Logged in, no hotspot yet'] } : { dot: 'bg-led-off', text: 'Not connected', extra: [] };
  }
});

const short = computed(() => {
  const host = store.settings.hub.host.replace(/^https?:\/\//, '');
  switch (radio.link) {
    case 'failed':
      return 'No link';
    case 'idle':
      return choosing.value ? 'No hotspot yet' : 'Not connected';
    default:
      return host;
  }
});

function toggleSettings(): void {
  if (inSettings.value) {
    goBack(router, '/');
  } else {
    void router.push('/settings');
  }
}
</script>

<template>
  <header class="sticky top-0 z-10 flex h-14 shrink-0 items-center bg-radio-page justify-between gap-3 border-radio-line px-4 sm:h-16 sm:border-b sm:px-8 rail:col-start-1 rail:row-start-1 rail:h-auto! rail:w-[72px] rail:flex-col rail:justify-start rail:border-r rail:border-b-0! rail:px-0! rail:py-3">
    <div class="flex min-w-0 items-center gap-2.5 lg:gap-6 rail:flex-col">
      <RouterLink to="/" class="no-underline flex shrink-0 items-center gap-2.5 text-radio-text sm:gap-3">
        <RadioLogo class="size-5 text-radio-accent sm:size-[22px]" />
        <span class="text-base font-bold tracking-[0.02em] sm:text-[17px] rail:sr-only">dmr-web</span>
      </RouterLink>
      <span class="flex min-w-0 items-center gap-1.5 text-xs lg:hidden" :class="radio.link === 'failed' ? 'text-radio-red' : 'text-radio-text/80'">
        <span class="size-2 shrink-0 rounded-full" :class="pill.dot" />
        <span class="truncate rail:sr-only">{{ short }}</span>
      </span>
      <AppNav v-if="store.configured" class="hidden lg:flex" />
    </div>
    <div class="flex min-w-0 items-center gap-3 rail:flex-col">
      <div class="hidden h-9 min-w-0 items-center gap-2 rounded-full border border-radio-line px-3.5 text-[13px] text-radio-text/80 lg:flex">
        <span class="size-2 shrink-0 rounded-full" :class="pill.dot" />
        <span class="truncate">{{ pill.text }}</span>
        <span v-for="x in pill.extra" :key="x" class="hidden text-radio-muted md:inline">{{ x }}</span>
      </div>
      <button
        type="button"
        :aria-label="inSettings ? 'Close settings' : 'Settings'"
        :aria-pressed="inSettings"
        class="flex size-11 shrink-0 items-center justify-center rounded-[10px] border"
        :class="inSettings ? 'border-radio-amber bg-radio-amber-soft text-radio-accent' : 'border-radio-line bg-radio-surface text-radio-muted'"
        @click="toggleSettings"
      >
        <Settings class="size-5" />
      </button>
    </div>
  </header>
</template>
