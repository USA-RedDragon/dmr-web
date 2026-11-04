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
import { useIntervalFn } from '@vueuse/core';
import { computed, ref } from 'vue';

import { listenLcd, talkgroupLabel } from '@/lib/listenView';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

import LcdDisplay from './LcdDisplay.vue';
import RadioKnob from './RadioKnob.vue';

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const radio = useRadio();
const store = useSettings();
const now = ref(Date.now());

useIntervalFn(() => {
  now.value = Date.now();
}, 1000);

const powered = computed(() => radio.connected);
const list = computed(() => radio.listenState.talkgroups);
const tuned = computed(() => radio.listenState.tuned || store.settings.listenTalkgroup);
const position = computed(() => Math.max(0, list.value.findIndex((t) => t.id === tuned.value)));

const activeCall = computed(() => {
  for (const n of [1, 2] as const) {
    if (radio.calls[n].active) {
      return radio.calls[n];
    }
  }
  return null;
});

function elapsed(since: number): string {
  const sec = Math.max(0, Math.floor((now.value - since) / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

const lcd = computed(() =>
  listenLcd({
    link: radio.link,
    linkDetail: radio.linkDetail,
    host: store.settings.hub.host,
    tuned: radio.listenState.tuned,
    error: radio.listenState.error,
    talkgroups: list.value,
    call: activeCall.value
      ? { source: activeCall.value.source, vocoder: activeCall.value.vocoder, timer: elapsed(activeCall.value.startedAt), alias: activeCall.value.alias }
      : null,
    calls: radio.listenState.calls,
  }),
);

function stepTalkgroup(d: number): void {
  const next = list.value[position.value + d];
  if (next) {
    radio.tune(next.id);
  }
}

function pick(e: Event): void {
  const id = Number((e.target as HTMLSelectElement).value);
  if (id) {
    radio.tune(id);
  }
}

const presets = computed(() => list.value.slice(0, 3));
const volumePos = computed(() => Math.round(store.settings.audio.volume * 10));
function stepVolume(d: number): void {
  store.settings.audio.volume = Math.max(0, Math.min(10, volumePos.value + d)) / 10;
  radio.applyAudio();
}

const knobSize = computed(() => (props.compact ? 'clamp(60px, 10dvh, 84px)' : 'clamp(72px, 11dvh, 96px)'));
const volumeSize = computed(() => (props.compact ? 'clamp(48px, 8dvh, 68px)' : 'clamp(56px, 8dvh, 72px)'));
</script>

<template>
  <section
    aria-label="Radio, listen only"
    data-test="listen-panel"
    class="flex select-none flex-col rounded-[28px] border border-radio-chassis-line bg-radio-chassis shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_48px_rgba(0,0,0,0.25)]"
    :class="compact ? 'gap-[clamp(8px,1.8dvh,16px)] rounded-3xl px-4 py-[clamp(10px,2dvh,16px)]' : 'gap-[clamp(12px,2.6dvh,24px)] px-7 py-[clamp(16px,3dvh,28px)]'"
  >
    <div class="flex shrink-0 items-center justify-between">
      <div class="flex items-center gap-4 text-xs font-semibold tracking-[0.12em] text-radio-muted">
        <span class="flex items-center gap-2">
          <span class="size-2.5 rounded-full" :class="activeCall && powered ? 'bg-radio-green shadow-[0_0_10px_var(--radio-green)]' : 'bg-led-off'" />RX
        </span>
        <span class="flex items-center gap-2">
          <span class="size-2.5 rounded-full" :class="powered ? 'bg-radio-amber' : 'bg-led-off'" />LINK
        </span>
      </div>
      <span class="text-xs font-semibold tracking-[0.18em] text-radio-muted" data-test="listen-only">LISTEN ONLY</span>
    </div>

    <LcdDisplay v-bind="lcd" :slots="[]" :compact="compact" class="shrink-0" />

    <div class="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center" :class="[compact ? 'gap-2' : 'gap-4', powered ? '' : 'opacity-55']">
      <RadioKnob
        :position="position"
        :count="Math.max(1, list.length)"
        label="TALKGROUP"
        spoken="Talkgroup knob"
        sizer="TALKGROUP"
        :size="knobSize"
        :disabled="!powered || list.length < 2"
        ticks
        class="justify-self-start"
        @step="stepTalkgroup"
      />
      <div class="flex min-w-0 flex-col items-center gap-2">
        <div v-if="presets.length" class="flex gap-2">
          <button
            v-for="p in presets"
            :key="p.id"
            type="button"
            :disabled="!powered"
            class="h-11 min-w-14 whitespace-nowrap rounded-[10px] border border-radio-line bg-radio-knob px-3 text-sm font-medium"
            :class="tuned === p.id ? 'text-radio-accent' : ''"
            :aria-pressed="tuned === p.id"
            @click="radio.tune(p.id)"
          >
            {{ p.id }}
          </button>
        </div>
        <select
          aria-label="Talkgroup"
          data-test="listen-talkgroup"
          class="h-10 max-w-full rounded-[10px] border border-radio-line bg-radio-knob px-2 text-[13px] font-semibold text-radio-text"
          :value="tuned"
          :disabled="!powered || !list.length"
          @change="pick"
        >
          <option v-if="!list.some((t) => t.id === tuned)" :value="tuned">{{ tuned ? `TG ${tuned}` : 'Talkgroup' }}</option>
          <option v-for="t in list" :key="t.id" :value="t.id">{{ talkgroupLabel(t.id, list).replace('  ', ' ') }}</option>
        </select>
      </div>
      <RadioKnob
        :position="volumePos"
        :count="11"
        :label="powered ? `VOLUME ${volumePos}` : 'VOLUME'"
        spoken="Volume knob"
        sizer="VOLUME 10"
        :size="volumeSize"
        class="justify-self-end"
        @step="stepVolume"
      />
    </div>
    <div v-if="!compact" aria-hidden="true" class="grille min-h-0 grow rounded-[14px] border border-radio-line" />
  </section>
</template>
