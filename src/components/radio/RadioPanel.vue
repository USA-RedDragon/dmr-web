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

import { useRadio } from '@/store/radio';
import { useSettings, type Slot } from '@/store/settings';

import LcdDisplay from './LcdDisplay.vue';
import RadioKnob from './RadioKnob.vue';
import TalkgroupKeypad from './TalkgroupKeypad.vue';

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
const emit = defineEmits<{ login: [] }>();

const radio = useRadio();
const store = useSettings();
const s = computed(() => store.settings);
const keypad = ref(false);
const now = ref(Date.now());
const toggled = ref(false);

useIntervalFn(() => {
  now.value = Date.now();
}, 1000);

const powered = computed(() => radio.connected);
const slot = computed(() => s.value.selected.slot);
const activeCall = computed(() => {
  const own = radio.calls[slot.value];
  if (own.active) {
    return { slot: slot.value, call: own };
  }
  const other = (slot.value === 1 ? 2 : 1) as Slot;
  return radio.calls[other].active ? { slot: other, call: radio.calls[other] } : null;
});

function slotLabel(n: Slot): string {
  if (!store.configured) {
    return '---';
  }
  const tg = store.target(n);
  if (!tg) {
    return '---';
  }
  const name = store.targetName(n);
  return `TG ${tg}${name ? ` ${name.toUpperCase()}` : ''}`;
}

function elapsed(since: number): string {
  const sec = Math.max(0, Math.floor((now.value - since) / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

const linkText = computed(() => {
  switch (radio.link) {
    case 'connecting':
      return 'CONNECTING';
    case 'reconnecting':
      return 'RECONNECTING';
    case 'failed':
      return 'NO LINK';
    case 'up':
      return 'READY';
    default:
      return store.configured ? 'NOT CONNECTED' : 'LOG IN TO GET ON THE AIR';
  }
});

function knownName(id: number): string {
  const t = [...s.value.talkgroups[1], ...s.value.talkgroups[2]].find((x) => x.id === id);
  return t?.name.toUpperCase() ?? '';
}

const lcd = computed(() => {
  const slots = ([1, 2] as Slot[]).map((n) => ({ slot: n, label: slotLabel(n), selected: powered.value && n === slot.value }));
  if (radio.tx.active) {
    return {
      slots,
      status: `TX  TS${radio.tx.slot}`,
      badge: radio.transmitVocoder === 'ambe' ? 'AMBE' : 'CODEC2',
      timer: elapsed(radio.tx.startedAt),
      headline: 'TRANSMIT',
      sub: `${s.value.hotspot.callsign || 'ID'}  ${store.radioId}`,
      subRight: radio.tx.group ? 'Group call' : 'Private call',
      details: [],
    };
  }
  const a = activeCall.value;
  if (powered.value && a) {
    const alias = a.call.alias.trim();
    const details = [`ALIAS  ${alias || '-'}`];
    if (a.call.latitude !== null && a.call.longitude !== null) {
      details.push(`GPS  ${a.call.latitude.toFixed(2)}  ${a.call.longitude.toFixed(2)}`);
    }
    details.push(`VIA  Hotspot ${s.value.hotspot.id}`);
    return {
      slots,
      status: `RX  TS${a.slot}`,
      badge: a.call.vocoder === 'ambe' ? 'AMBE' : a.call.vocoder === 'codec2' ? 'CODEC2' : '',
      timer: elapsed(a.call.startedAt),
      headline: alias ? alias.split(/\s+/)[0]! : knownName(a.call.source) || String(a.call.source),
      sub: `ID ${a.call.source}`,
      subRight: a.call.group ? `TG ${a.call.target}` : 'Private call',
      details,
    };
  }
  return {
    slots,
    status: powered.value ? `TS${slot.value}  STANDBY` : radio.link === 'idle' ? '' : radio.link.toUpperCase(),
    badge: '',
    timer: '',
    headline: powered.value ? s.value.hotspot.callsign || 'READY' : 'NO LINK',
    sub: powered.value ? `Hotspot ${s.value.hotspot.id}` : linkText.value,
    subRight: '',
    details: powered.value
      ? [`VOICE  ${radio.transmitVocoder.toUpperCase()}`, `HUB  ${s.value.hub.host.toUpperCase()}`, `TS1  ${slotLabel(1)}`, `TS2  ${slotLabel(2)}`]
      : ['VOICE  AMBE / CODEC2', 'RUNS IN THIS BROWSER', `HUB  ${s.value.hub.host.toUpperCase()}`],
  };
});

const list = computed(() => s.value.talkgroups[slot.value]);
const knobPos = computed(() => s.value.selected.index[slot.value]);

function stepTalkgroup(d: number): void {
  const sel = s.value.selected;
  const next = sel.index[slot.value] + d;
  if (next < 0 || next >= list.value.length) {
    return;
  }
  sel.index[slot.value] = next;
  sel.manual[slot.value] = null;
}

function pickSlot(n: Slot): void {
  if (!radio.tx.active) {
    s.value.selected.slot = n;
  }
}

function preset(i: number): void {
  if (radio.tx.active) {
    return;
  }
  s.value.selected.index[slot.value] = i;
  s.value.selected.manual[slot.value] = null;
}

function setManual(tg: number): void {
  s.value.selected.manual[slot.value] = tg;
}

const volumePos = computed(() => Math.round(s.value.audio.volume * 10));
function stepVolume(d: number): void {
  s.value.audio.volume = Math.max(0, Math.min(10, volumePos.value + d)) / 10;
  radio.applyAudio();
}

const canTalk = computed(() => powered.value && store.target(slot.value) !== null);

function pttDown(e: PointerEvent): void {
  if (!powered.value) {
    emit('login');
    return;
  }
  if (!canTalk.value) {
    return;
  }
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  if (s.value.audio.pttMode === 'toggle') {
    toggled.value = !toggled.value;
    if (toggled.value) {
      void radio.pttDown();
    } else {
      radio.pttUp();
    }
    return;
  }
  void radio.pttDown();
}

function pttUp(): void {
  if (s.value.audio.pttMode === 'hold' && radio.tx.active) {
    radio.pttUp();
  }
}

const presets = computed(() => list.value.slice(0, 2));
const knobSize = computed(() => (props.compact ? 84 : 96));
</script>

<template>
  <section
    aria-label="Radio"
    class="flex flex-col rounded-[28px] border border-radio-chassis-line bg-radio-chassis shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_48px_rgba(0,0,0,0.25)]"
    :class="compact ? 'gap-4 rounded-3xl p-4' : 'gap-6 p-7'"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4 text-xs font-semibold tracking-[0.12em] text-radio-muted">
        <span class="flex items-center gap-2">
          <span class="size-2.5 rounded-full" :class="activeCall && powered ? 'bg-radio-green shadow-[0_0_10px_var(--radio-green)]' : 'bg-led-off'" />RX
        </span>
        <span class="flex items-center gap-2" :class="radio.tx.active ? 'text-radio-red' : ''">
          <span class="size-2.5 rounded-full" :class="radio.tx.active ? 'bg-radio-red shadow-[0_0_12px_var(--radio-red)]' : 'bg-led-off'" />TX
        </span>
        <span class="flex items-center gap-2">
          <span class="size-2.5 rounded-full" :class="powered ? 'bg-radio-amber' : 'bg-led-off'" />LINK
        </span>
      </div>
      <span v-if="!compact" class="text-xs font-semibold tracking-[0.18em] text-radio-muted">DMR TIER II</span>
    </div>

    <LcdDisplay v-bind="lcd" :compact="compact" />

    <div class="flex items-center justify-between gap-4" :class="powered ? '' : 'opacity-55'">
      <RadioKnob
        :position="knobPos"
        :count="Math.max(1, list.length)"
        :label="radio.tx.active ? 'TALKGROUP, LOCKED' : `TALKGROUP TS${slot}`"
        :spoken="`Talkgroup knob for TS${slot}`"
        :size="knobSize"
        :disabled="radio.tx.active || list.length < 2"
        ticks
        @step="stepTalkgroup"
      />
      <div class="flex flex-col items-center gap-2">
        <div role="group" aria-label="Timeslot" class="flex gap-1 rounded-xl border border-radio-line bg-radio-page p-1" :class="compact ? 'flex-col' : ''">
          <button
            v-for="n in [1, 2] as Slot[]"
            :key="n"
            type="button"
            :aria-pressed="slot === n"
            :disabled="radio.tx.active"
            class="h-11 rounded-[9px] text-sm font-semibold"
            :class="[compact ? 'w-16' : 'w-[72px]', slot === n ? 'bg-radio-raised text-radio-accent' : 'text-radio-muted']"
            @click="pickSlot(n)"
          >
            TS{{ n }}
          </button>
        </div>
        <button
          v-if="compact"
          type="button"
          aria-label="Enter a talkgroup number"
          class="h-11 w-[74px] rounded-[10px] border border-radio-line bg-radio-knob text-lg"
          :disabled="radio.tx.active"
          @click="keypad = true"
        >
          #
        </button>
        <span v-else class="text-[11px] font-semibold tracking-[0.14em] text-radio-muted">SLOT</span>
      </div>
      <div v-if="!compact" class="flex flex-col items-center gap-2">
        <div class="flex gap-2">
          <button
            v-for="(p, i) in presets"
            :key="p.id"
            type="button"
            :disabled="radio.tx.active"
            class="h-11 rounded-[10px] border border-radio-line bg-radio-knob px-4 text-sm font-medium"
            :class="!s.selected.manual[slot] && s.selected.index[slot] === i ? 'text-radio-accent' : ''"
            @click="preset(i)"
          >
            TG {{ p.id }}
          </button>
          <button
            type="button"
            aria-label="Enter a talkgroup number"
            :disabled="radio.tx.active"
            class="size-11 rounded-[10px] border border-radio-line bg-radio-knob text-lg"
            @click="keypad = true"
          >
            #
          </button>
        </div>
        <span class="text-[11px] font-semibold tracking-[0.14em] text-radio-muted">PRESETS</span>
      </div>
      <RadioKnob
        :position="volumePos"
        :count="11"
        :label="`VOLUME ${volumePos}`"
        spoken="Volume knob"
        :size="compact ? 68 : 72"
        @step="stepVolume"
      />
    </div>

    <slot name="middle" />

    <button
      type="button"
      class="flex select-none flex-col items-center justify-center gap-1.5 rounded-[20px] border font-bold tracking-[0.2em] transition-colors"
      :class="[
        compact ? 'mt-auto h-[150px] text-xl' : 'h-[108px] text-[22px]',
        radio.tx.active
          ? 'border-radio-red bg-[color-mix(in_oklab,var(--radio-red)_22%,var(--radio-chassis))] text-radio-red'
          : powered
            ? 'border-radio-chassis-line bg-radio-ptt'
            : 'border-radio-amber bg-radio-ptt text-radio-accent',
      ]"
      :aria-pressed="radio.tx.active"
      style="touch-action: none"
      @pointerdown="pttDown"
      @pointerup="pttUp"
      @pointercancel="pttUp"
      @contextmenu.prevent
    >
      <span>{{ radio.tx.active ? 'TRANSMITTING' : powered ? 'PUSH TO TALK' : store.configured ? 'CONNECT' : 'LOG IN TO TALK' }}</span>
      <span class="text-xs font-medium tracking-[0.08em] text-radio-muted">
        {{
          radio.tx.active
            ? s.audio.pttMode === 'hold'
              ? 'Release to stop'
              : 'Tap to stop'
            : powered
              ? s.audio.pttMode === 'hold'
                ? `Hold, or hold ${s.audio.pttKey === 'Space' ? 'the space bar' : s.audio.pttKey}`
                : 'Tap to talk, tap again to stop'
              : store.configured
                ? 'Connect to the hub'
                : 'Free with a DMRHub account'
        }}
      </span>
    </button>
    <div v-if="!compact" aria-hidden="true" class="grille min-h-6 grow rounded-[14px] border border-radio-line" />

    <TalkgroupKeypad v-model:open="keypad" :ts="slot" @set="setManual" />
  </section>
</template>
