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
import { ChevronLeft } from 'lucide-vue-next';
import { computed, nextTick, ref, watch, type Component } from 'vue';
import { useRoute } from 'vue-router';

import AudioSection from '@/components/settings/AudioSection.vue';
import BackupSection from '@/components/settings/BackupSection.vue';
import ConnectionSection from '@/components/settings/ConnectionSection.vue';
import DiagnosticsSection from '@/components/settings/DiagnosticsSection.vue';
import DisplaySection from '@/components/settings/DisplaySection.vue';
import TalkgroupsSection from '@/components/settings/TalkgroupsSection.vue';
import VocoderSection from '@/components/settings/VocoderSection.vue';

const sections: { id: string; label: string; component: Component }[] = [
  { id: 'connection', label: 'Connection', component: ConnectionSection },
  { id: 'vocoder', label: 'Vocoder', component: VocoderSection },
  { id: 'audio', label: 'Audio', component: AudioSection },
  { id: 'talkgroups', label: 'Talkgroups', component: TalkgroupsSection },
  { id: 'display', label: 'Display', component: DisplaySection },
  { id: 'diagnostics', label: 'Diagnostics', component: DiagnosticsSection },
  { id: 'backup', label: 'Backup', component: BackupSection },
];

const route = useRoute();
const current = computed(() => sections.find((s) => s.id === route.params.section) ?? sections[0]!);
const nav = ref<HTMLElement | null>(null);

watch(
  current,
  async () => {
    await nextTick();
    nav.value?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  { immediate: true },
);
</script>

<template>
  <main class="flex grow flex-col gap-4 px-4 pb-6 lg:flex-row lg:gap-8 lg:p-8">
    <div class="flex items-center justify-between lg:hidden">
      <h1 class="m-0 text-[22px] font-bold">Settings</h1>
      <RouterLink to="/" class="flex min-h-11 items-center text-sm">Back to radio</RouterLink>
    </div>
    <nav ref="nav" aria-label="Settings sections" class="flex shrink-0 gap-2 overflow-x-auto lg:w-[220px] lg:flex-col lg:gap-1 lg:overflow-visible">
      <RouterLink
        to="/"
        class="no-underline mb-3 hidden h-11 items-center gap-2 rounded-[10px] border border-radio-line px-3.5 text-sm text-radio-text lg:flex"
      >
        <ChevronLeft class="size-4" />Back to radio
      </RouterLink>
      <RouterLink
        v-for="s in sections"
        :key="s.id"
        :to="`/settings/${s.id}`"
        :aria-current="current.id === s.id ? 'page' : undefined"
        class="no-underline flex h-10 shrink-0 items-center rounded-full border px-3.5 text-[13px] lg:h-11 lg:rounded-[10px] lg:border-0 lg:text-sm"
        :class="
          current.id === s.id
            ? 'border-radio-amber bg-radio-amber-soft font-semibold text-radio-accent lg:bg-radio-raised'
            : 'border-radio-line text-radio-text/80'
        "
      >
        {{ s.label }}
      </RouterLink>
    </nav>
    <div class="flex min-w-0 max-w-[920px] grow flex-col gap-5">
      <component :is="current.component" />
    </div>
  </main>
</template>
