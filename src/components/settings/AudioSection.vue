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
import { computed, ref } from 'vue';

import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

import { labelClass, secondaryButton } from './fields';
import SettingsCard from './SettingsCard.vue';

const store = useSettings();
const radio = useRadio();
const a = computed(() => store.settings.audio);
const capturing = ref(false);

const meter = computed(() => Math.round(Math.min(1, radio.micLevel) * 32));

function apply(): void {
  radio.applyAudio();
}

function captureKey(): void {
  capturing.value = true;
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    if (e.code !== 'Escape') {
      a.value.pttKey = e.code;
    }
    capturing.value = false;
    window.removeEventListener('keydown', onKey, true);
  };
  window.addEventListener('keydown', onKey, true);
}

const toggles = [
  { key: 'noiseSuppression', label: 'Noise suppression' },
  { key: 'echoCancellation', label: 'Echo cancellation' },
  { key: 'autoGainControl', label: 'Auto gain' },
] as const;
</script>

<template>
  <SettingsCard title="Microphone">
    <label :class="labelClass">
      Mic gain, {{ a.micGainDb > 0 ? '+' : '' }}{{ a.micGainDb }} dB
      <input v-model.number="a.micGainDb" type="range" min="-12" max="12" step="1" class="h-8 accent-radio-amber" @change="apply" />
    </label>
    <div class="flex flex-col gap-1.5">
      <span class="text-xs text-radio-muted">Level{{ radio.micPermission === 'granted' ? '' : ', after the microphone is allowed' }}</span>
      <div class="grid h-3 grid-cols-[repeat(32,minmax(0,1fr))] gap-[3px]" aria-hidden="true">
        <span v-for="i in 32" :key="i" :class="i <= meter ? (i > 26 ? 'bg-radio-red' : i > 20 ? 'bg-radio-amber' : 'bg-radio-green') : 'bg-radio-line'" />
      </div>
    </div>
    <div class="flex flex-wrap gap-x-6">
      <label v-for="t in toggles" :key="t.key" class="flex min-h-11 items-center gap-2 text-sm">
        <input v-model="a[t.key]" type="checkbox" class="size-[18px] accent-radio-amber" @change="apply" />{{ t.label }}
      </label>
    </div>
  </SettingsCard>

  <SettingsCard title="Speaker">
    <div class="grid gap-4 sm:grid-cols-2">
      <label :class="labelClass">
        Volume, {{ Math.round(a.volume * 100) }}%
        <input v-model.number="a.volume" type="range" min="0" max="1" step="0.05" class="h-8 accent-radio-amber" @input="apply" />
      </label>
      <label :class="labelClass">
        Jitter buffer, {{ store.settings.jitterMs }} ms
        <input v-model.number="store.settings.jitterMs" type="range" min="60" max="2000" step="60" class="h-8 accent-radio-amber" />
      </label>
    </div>
    <span class="text-xs text-radio-muted">A longer buffer smooths a poor connection but adds delay. It applies at the next connect.</span>
  </SettingsCard>

  <SettingsCard title="Push to talk">
    <div class="grid gap-4 sm:grid-cols-2">
      <div role="radiogroup" aria-label="PTT mode" class="grid grid-cols-2 gap-1 rounded-xl border border-radio-line bg-radio-page p-1">
        <button
          v-for="m in ['hold', 'toggle'] as const"
          :key="m"
          type="button"
          role="radio"
          :aria-checked="a.pttMode === m"
          class="h-11 rounded-[9px] text-sm"
          :class="a.pttMode === m ? 'bg-radio-raised font-semibold text-radio-accent' : 'text-radio-text/80'"
          @click="a.pttMode = m"
        >
          {{ m === 'hold' ? 'Hold to talk' : 'Tap to toggle' }}
        </button>
      </div>
      <div class="flex min-h-[52px] items-center justify-between rounded-xl border border-radio-line px-3.5">
        <span class="text-sm">Keyboard key</span>
        <button type="button" :class="[secondaryButton, 'h-9 font-mono text-[13px]']" @click="captureKey">
          {{ capturing ? 'Press a key' : a.pttKey }}
        </button>
      </div>
    </div>
  </SettingsCard>
</template>
