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
import { useEventListener, useMediaQuery } from '@vueuse/core';
import { computed, onMounted, ref } from 'vue';

import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

import { inputClass, labelClass, secondaryButton } from './fields';
import SettingsCard from './SettingsCard.vue';

const SEGMENTS = 32;
const PHONE_SEGMENTS = 20;

const store = useSettings();
const radio = useRadio();
const a = computed(() => store.settings.audio);
const desktop = useMediaQuery('(min-width: 1024px)');
const capturing = ref(false);
const inputs = ref<MediaDeviceInfo[]>([]);
const outputs = ref<MediaDeviceInfo[]>([]);
const canPickOutput = typeof (AudioContext.prototype as { setSinkId?: unknown }).setSinkId === 'function';

const dbfs = computed(() => (radio.micLevel > 0 ? Math.max(-60, Math.round(20 * Math.log10(radio.micLevel))) : -60));
const segments = computed(() => (desktop.value ? SEGMENTS : PHONE_SEGMENTS));
const lit = computed(() => Math.round(((dbfs.value + 60) / 60) * segments.value));

async function devices(): Promise<void> {
  const all = await navigator.mediaDevices?.enumerateDevices().catch(() => []) ?? [];
  inputs.value = all.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default');
  outputs.value = all.filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default');
}

onMounted(async () => {
  await radio.checkMicPermission();
  if (radio.micPermission === 'granted') {
    await radio.enableMic();
  }
  await devices();
});
if (navigator.mediaDevices) {
  useEventListener(navigator.mediaDevices, 'devicechange', () => void devices());
}

function apply(): void {
  radio.applyAudio();
}

async function allow(): Promise<void> {
  await radio.enableMic();
  await devices();
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

const toggles = computed(() =>
  [
    { key: 'noiseSuppression', label: 'Noise suppression' },
    { key: 'echoCancellation', label: 'Echo cancellation' },
    { key: 'autoGainControl', label: 'Auto gain' },
  ].filter((t) => desktop.value || t.key !== 'autoGainControl') as { key: 'noiseSuppression' | 'echoCancellation' | 'autoGainControl'; label: string }[],
);

function segClass(i: number): string {
  if (i > lit.value) {
    return 'bg-radio-line';
  }
  const f = i / segments.value;
  return f > 0.85 ? 'bg-radio-red' : f > 0.55 ? 'bg-radio-amber' : 'bg-radio-green';
}
</script>

<template>
  <SettingsCard title="Microphone">
    <div class="grid gap-3 lg:grid-cols-2 lg:gap-4">
      <label :class="labelClass">
        <span v-if="desktop">Input device</span>
        <select v-model="a.inputId" :class="inputClass" aria-label="Input device" @change="apply">
          <option value="">Default microphone</option>
          <option v-for="d in inputs" :key="d.deviceId" :value="d.deviceId">{{ d.label || 'Microphone' }}</option>
        </select>
      </label>
      <label v-if="desktop" :class="labelClass">
        Mic gain, {{ a.micGainDb > 0 ? '+' : '' }}{{ a.micGainDb }} dB
        <input v-model.number="a.micGainDb" type="range" min="-12" max="12" step="1" class="h-11 accent-radio-amber" @change="apply" />
      </label>
    </div>
    <div class="flex flex-col gap-1.5">
      <span v-if="desktop" class="flex justify-between text-xs text-radio-muted">
        Level, speak to test
        <span v-if="radio.micPermission === 'granted'" class="font-mono">{{ dbfs }} dBFS</span>
      </span>
      <div class="grid h-3 gap-[3px]" :style="{ gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))` }" role="meter" aria-label="Microphone level" :aria-valuenow="dbfs" aria-valuemin="-60" aria-valuemax="0">
        <span v-for="i in segments" :key="i" :class="segClass(i)" />
      </div>
      <button v-if="radio.micPermission !== 'granted'" type="button" class="self-start text-xs text-radio-accent underline" @click="allow">
        Allow the microphone to test it
      </button>
    </div>
    <label v-if="!desktop" :class="labelClass">
      Mic gain, {{ a.micGainDb > 0 ? '+' : '' }}{{ a.micGainDb }} dB
      <input v-model.number="a.micGainDb" type="range" min="-12" max="12" step="1" class="h-11 accent-radio-amber" @change="apply" />
    </label>
    <div v-if="desktop" class="flex flex-wrap gap-x-6">
      <label v-for="t in toggles" :key="t.key" class="flex min-h-11 items-center gap-2 text-sm">
        <input v-model="a[t.key]" type="checkbox" class="size-[18px] accent-radio-amber" @change="apply" />{{ t.label }}
      </label>
    </div>
    <div v-else class="flex flex-col">
      <label v-for="(t, i) in toggles" :key="t.key" class="flex min-h-14 items-center justify-between text-sm" :class="i > 0 ? 'border-t border-radio-line' : ''">
        {{ t.label }}
        <input v-model="a[t.key]" type="checkbox" class="size-5 accent-radio-amber" @change="apply" />
      </label>
    </div>
  </SettingsCard>

  <SettingsCard :title="desktop ? 'Speaker' : 'Speaker and PTT'">
    <div class="grid gap-3 lg:grid-cols-2 lg:gap-4">
      <label v-if="desktop" :class="labelClass">
        Output device
        <select v-model="a.outputId" :class="inputClass" :disabled="!canPickOutput" @change="apply">
          <option value="">Default speaker</option>
          <option v-for="d in outputs" :key="d.deviceId" :value="d.deviceId">{{ d.label || 'Speaker' }}</option>
        </select>
      </label>
      <label :class="labelClass">
        Jitter buffer, {{ store.settings.jitterMs }} ms
        <input v-model.number="store.settings.jitterMs" type="range" min="60" max="2000" step="60" class="h-11 accent-radio-amber" />
      </label>
    </div>
    <span v-if="desktop" class="text-xs text-radio-muted">A longer buffer smooths a poor connection but adds delay.</span>
    <div v-if="!desktop" role="radiogroup" aria-label="PTT mode" class="grid grid-cols-2 gap-1 rounded-xl border border-radio-line bg-radio-page p-1">
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
  </SettingsCard>

  <SettingsCard v-if="desktop" title="Push to talk">
    <div class="grid grid-cols-2 gap-4">
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
          {{ m === 'hold' ? 'Hold' : 'Toggle' }}
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
