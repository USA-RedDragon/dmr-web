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
import { useColorMode } from '@/composables/useColorMode';
import { useSettings } from '@/store/settings';

import SettingsCard from './SettingsCard.vue';

const store = useSettings();
const { mode, setMode } = useColorMode();

const themes = [
  { value: 'system', label: 'Auto', hint: 'Follow the system' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
] as const;
</script>

<template>
  <SettingsCard title="Theme">
    <div role="radiogroup" aria-label="Theme" class="grid gap-2 sm:grid-cols-3">
      <button
        v-for="t in themes"
        :key="t.value"
        type="button"
        role="radio"
        :aria-checked="mode === t.value"
        class="flex flex-col gap-3 rounded-xl border p-3 text-left"
        :class="mode === t.value ? 'border-radio-amber bg-radio-amber-soft' : 'border-radio-line'"
        @click="setMode(t.value)"
      >
        <span class="flex h-14 overflow-hidden rounded-lg border border-radio-line" aria-hidden="true">
          <span v-if="t.value !== 'light'" class="flex grow items-center justify-center bg-[#1b1d21]">
            <span class="rounded bg-[#140f05] px-2 py-1 font-mono text-[10px] text-[#ffb547]">TG 1</span>
          </span>
          <span v-if="t.value !== 'dark'" class="flex grow items-center justify-center bg-[#e4e5e8]">
            <span class="rounded bg-[#f3e2b8] px-2 py-1 font-mono text-[10px] text-[#3a2600]">TG 1</span>
          </span>
        </span>
        <span class="flex flex-col">
          <span class="text-sm font-bold" :class="mode === t.value ? 'text-radio-accent' : ''">{{ t.label }}</span>
          <span class="text-xs text-radio-muted">{{ t.hint }}</span>
        </span>
      </button>
    </div>
  </SettingsCard>
  <SettingsCard>
    <label class="flex min-h-11 items-center justify-between text-sm">
      Reduce motion
      <input v-model="store.settings.display.reduceMotion" type="checkbox" class="size-5 accent-radio-amber" />
    </label>
    <label class="flex min-h-11 items-center justify-between border-t border-radio-line pt-3 text-sm">
      Keep the screen on while connected
      <input v-model="store.settings.display.keepScreenOn" type="checkbox" class="size-5 accent-radio-amber" />
    </label>
  </SettingsCard>
</template>
