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
import { Headphones, Mic } from 'lucide-vue-next';
import { computed } from 'vue';

import { hubOrigin } from '@/radio/discover';
import { useSettings } from '@/store/settings';

const emit = defineEmits<{ pick: [mode: 'listen' | 'talk'] }>();

const store = useSettings();
const hubName = computed(() => {
  try {
    return hubOrigin(store.settings.hub.host).host;
  } catch {
    return store.settings.hub.host;
  }
});

const card =
  'flex w-full items-start gap-4 rounded-[18px] border border-radio-line bg-radio-surface p-5 text-left text-radio-text hover:border-radio-amber focus-visible:border-radio-amber';
</script>

<template>
  <section class="flex w-full max-w-[528px] flex-col gap-4" data-test="listen-chooser">
    <h1 class="m-0 text-2xl font-bold">{{ hubName }}</h1>
    <button type="button" :class="card" data-test="choose-listen" @click="emit('pick', 'listen')">
      <Headphones class="mt-0.5 size-6 shrink-0 text-radio-amber" />
      <span class="flex flex-col gap-1">
        <span class="text-lg font-semibold">Listen</span>
        <span class="text-sm text-radio-text/80">Hear a talkgroup. No account needed.</span>
      </span>
    </button>
    <button type="button" :class="card" data-test="choose-talk" @click="emit('pick', 'talk')">
      <Mic class="mt-0.5 size-6 shrink-0 text-radio-amber" />
      <span class="flex flex-col gap-1">
        <span class="text-lg font-semibold">Talk</span>
        <span class="text-sm text-radio-text/80">Log in with your DMRHub account and use this browser as a hotspot.</span>
      </span>
    </button>
    <RouterLink to="/settings/connection" class="text-[13px]">Hub: {{ store.settings.hub.host }}</RouterLink>
  </section>
</template>
