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
import { computed } from 'vue';

import { useColorMode } from '@/composables/useColorMode';
import { useSettings } from '@/store/settings';

import SettingsCard from './SettingsCard.vue';
import ToggleSwitch from './ToggleSwitch.vue';

const store = useSettings();
const { mode, setMode } = useColorMode();
const desktop = useMediaQuery('(min-width: 1024px)');

const themes = computed(() => [
  { value: 'system', label: 'Auto', hint: desktop.value ? 'Follows your system. Default' : 'System', sides: ['dark', 'light'] },
  { value: 'light', label: 'Light', hint: 'Always light', sides: ['light'] },
  { value: 'dark', label: 'Dark', hint: 'Always dark', sides: ['dark'] },
] as const);

const switches = computed(() => [
  {
    key: 'reduceMotion' as const,
    label: 'Reduce motion',
    hint: desktop.value ? 'Turns off knob and meter animation. Follows your system unless set here.' : 'Fewer animations',
  },
  {
    key: 'keepScreenOn' as const,
    label: desktop.value ? 'Keep screen on while connected' : 'Keep screen on',
    hint: desktop.value ? 'Stops the screen from sleeping while the radio is on the air.' : 'While connected',
  },
]);
</script>

<template>
  <SettingsCard title="Theme">
    <div role="radiogroup" aria-label="Theme" class="grid grid-cols-3 gap-2 lg:gap-3">
      <button
        v-for="t in themes"
        :key="t.value"
        type="button"
        role="radio"
        :aria-checked="mode === t.value"
        class="flex flex-col items-start gap-2.5 rounded-xl border p-2.5 text-left lg:p-3.5"
        :class="mode === t.value ? 'border-radio-amber bg-radio-amber-soft' : 'border-radio-line'"
        @click="setMode(t.value)"
      >
        <span aria-hidden="true" class="flex h-14 w-20 overflow-hidden rounded-[10px] border border-[#34383f] lg:h-20 lg:w-full">
          <span
            v-for="side in t.sides"
            :key="side"
            class="flex flex-1 flex-col gap-1.5 p-2"
            :class="side === 'dark' ? 'bg-[#1b1d21]' : 'bg-[#e4e5e8]'"
          >
            <span class="h-3.5 rounded-[3px] border" :class="side === 'dark' ? 'border-[#2a2010] bg-[#140f05]' : 'border-[#cdb57a] bg-[#f3e2b8]'" />
            <span class="size-4 rounded-full border" :class="side === 'dark' ? 'border-[#3a3e45] bg-[#24272c]' : 'border-[#c9ccd1] bg-[#f7f7f8]'" />
          </span>
        </span>
        <span class="flex flex-col gap-0.5">
          <span class="text-sm font-bold" :class="mode === t.value ? 'text-radio-accent' : ''">{{ t.label }}</span>
          <span class="text-xs text-radio-muted">{{ t.hint }}</span>
        </span>
      </button>
    </div>
  </SettingsCard>
  <section class="flex flex-col rounded-2xl border border-radio-line bg-radio-surface px-4 py-1 lg:px-[22px]">
    <div
      v-for="(s, i) in switches"
      :key="s.key"
      class="flex min-h-[52px] items-center justify-between gap-4 py-1.5"
      :class="i > 0 ? 'border-t border-radio-line' : ''"
    >
      <span class="flex flex-col gap-0.5">
        <span class="text-sm">{{ s.label }}</span>
        <span class="text-xs text-radio-muted">{{ s.hint }}</span>
      </span>
      <ToggleSwitch v-model="store.settings.display[s.key]" :label="s.label" />
    </div>
  </section>
</template>
