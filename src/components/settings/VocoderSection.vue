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
import { CheckCircle2, LoaderCircle, Upload, XCircle } from 'lucide-vue-next';
import { useMediaQuery } from '@vueuse/core';
import { computed, ref } from 'vue';

import VocoderBadge from '@/components/radio/VocoderBadge.vue';
import type { VocoderChoice } from '@/radio/protocol';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

import { dangerButton, secondaryButton } from './fields';
import SettingsCard from './SettingsCard.vue';

const store = useSettings();
const radio = useRadio();
const file = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const desktop = useMediaQuery('(min-width: 1024px)');

const options: { value: VocoderChoice; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'AMBE when a module is loaded' },
  { value: 'codec2', label: 'Codec2', hint: 'Always' },
  { value: 'ambe', label: 'AMBE', hint: 'Always' },
];

const loaded = computed(() => radio.ambe.status === 'loaded');

function choose(v: VocoderChoice): void {
  if (v === 'ambe' && !loaded.value) {
    return;
  }
  store.settings.vocoder = v;
  radio.setVocoder();
}

function pick(files: FileList | null | undefined): void {
  const f = files?.[0];
  if (f) {
    void radio.uploadAmbe(f);
  }
}

function onDrop(e: DragEvent): void {
  dragging.value = false;
  pick(e.dataTransfer?.files);
}
</script>

<template>
  <SettingsCard title="Transmit vocoder" :description="desktop ? 'Received calls always play, whichever vocoder they use.' : ''">
    <div v-if="!desktop" role="radiogroup" aria-label="Transmit vocoder" class="flex flex-col gap-1.5">
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        role="radio"
        :aria-checked="store.settings.vocoder === o.value"
        :disabled="o.value === 'ambe' && !loaded"
        class="flex min-h-[52px] items-center justify-between rounded-[10px] border px-3.5 text-left disabled:opacity-45"
        :class="store.settings.vocoder === o.value ? 'border-radio-amber bg-radio-amber-soft' : 'border-radio-line'"
        @click="choose(o.value)"
      >
        <span class="flex flex-col gap-0.5">
          <span class="text-sm font-bold" :class="store.settings.vocoder === o.value ? 'text-radio-accent' : ''">{{ o.label }}</span>
          <span class="text-xs" :class="store.settings.vocoder === o.value ? 'text-radio-text/80' : 'text-radio-muted'">
            {{ o.value === 'ambe' && !loaded ? 'Load a module first' : o.hint }}
          </span>
        </span>
        <VocoderBadge v-if="store.settings.vocoder === o.value" :vocoder="radio.transmitVocoder" />
      </button>
    </div>
    <div v-else role="radiogroup" aria-label="Transmit vocoder" class="grid grid-cols-3 gap-2 rounded-xl border border-radio-line bg-radio-page p-1">
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        role="radio"
        :aria-checked="store.settings.vocoder === o.value"
        :disabled="o.value === 'ambe' && !loaded"
        class="flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[9px] px-3 disabled:opacity-45"
        :class="store.settings.vocoder === o.value ? 'bg-radio-raised' : ''"
        @click="choose(o.value)"
      >
        <span class="text-sm font-bold" :class="store.settings.vocoder === o.value ? 'text-radio-accent' : ''">{{ o.label }}</span>
        <span class="text-xs text-radio-muted">{{ o.value === 'ambe' && !loaded ? 'Load a module first' : o.hint }}</span>
      </button>
    </div>
    <div v-if="desktop" class="flex items-center gap-2.5 text-[13px] text-radio-text/80">
      Now using <VocoderBadge :vocoder="radio.transmitVocoder" />
    </div>
  </SettingsCard>

  <SettingsCard title="AMBE module">
    <template #action>
      <span v-if="radio.ambe.status === 'loaded'" class="flex items-center gap-1.5 text-[13px] text-radio-green">
        <CheckCircle2 class="size-4" />Loaded
      </span>
      <span v-else-if="radio.ambe.status === 'checking'" class="flex items-center gap-1.5 text-[13px] text-radio-accent">
        <LoaderCircle class="size-4 animate-spin" />Checking
      </span>
      <span v-else-if="radio.ambe.status === 'refused'" class="flex items-center gap-1.5 text-[13px] text-radio-red">
        <XCircle class="size-4" />Refused
      </span>
    </template>
    <dl v-if="radio.ambe.status !== 'none'" class="m-0 grid grid-cols-[84px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs lg:grid-cols-[110px_minmax(0,1fr)] lg:gap-x-4 lg:gap-y-2.5 lg:text-[13px]">
      <template v-if="desktop">
        <dt class="text-radio-muted">File</dt>
        <dd class="m-0 truncate">{{ radio.ambe.name }}</dd>
      </template>
      <dt class="text-radio-muted">SHA-256</dt>
      <dd class="m-0 break-all font-mono text-[11px] lg:text-xs">{{ radio.ambe.sha256 }}</dd>
      <template v-if="radio.ambe.status === 'loaded'">
        <dt class="text-radio-muted">ABI version</dt>
        <dd class="m-0">{{ radio.ambe.version }}</dd>
        <dt class="text-radio-muted">Self-test</dt>
        <dd class="m-0 text-radio-green">Passed</dd>
      </template>
      <template v-if="radio.ambe.status === 'refused'">
        <dt class="text-radio-muted">Problem</dt>
        <dd class="m-0 text-radio-red">{{ radio.ambe.error }}</dd>
      </template>
    </dl>
    <label
      v-if="radio.ambe.status === 'none' || radio.ambe.status === 'refused'"
      class="flex cursor-pointer flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed p-5"
      :class="dragging ? 'border-radio-amber bg-radio-amber-soft' : 'border-radio-chassis-line'"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <span class="flex items-center gap-4">
        <Upload class="size-7 text-radio-muted" />
        <span class="text-sm font-semibold">Drop a .wasm file here</span>
      </span>
      <span :class="[secondaryButton, 'flex items-center']">Choose file</span>
      <input ref="file" type="file" accept=".wasm,application/wasm" class="sr-only" @change="pick(($event.target as HTMLInputElement).files)" />
    </label>
    <div v-else class="grid grid-cols-2 gap-2 lg:flex lg:gap-2.5">
      <button type="button" :class="secondaryButton" @click="file?.click()">Replace</button>
      <button type="button" :class="dangerButton" @click="radio.forgetAmbe()">Remove</button>
      <input ref="file" type="file" accept=".wasm,application/wasm" class="sr-only" @change="pick(($event.target as HTMLInputElement).files)" />
    </div>
  </SettingsCard>
</template>
