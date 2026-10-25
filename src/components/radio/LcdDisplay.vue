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
import { computed } from 'vue';

const props = defineProps<{
  slots: { slot: 1 | 2; label: string; selected: boolean }[];
  status: string;
  badge: string;
  timer: string;
  headline: string;
  sub: string;
  subRight: string;
  details: string[];
  compact?: boolean;
  meter?: { dbfs: number; lit: number };
  timeout?: { left: string; fraction: number };
  privateTag?: boolean;
  talkback?: { who: string; seconds: number; used: number } | null;
}>();

const segments = computed(() => (props.compact ? 18 : 24));
</script>

<template>
  <div
    class="flex flex-col rounded-[14px] border-2 border-lcd-line bg-lcd-bg font-mono text-lcd-text shadow-[inset_0_2px_12px_rgba(0,0,0,0.45)]"
    :class="compact ? 'gap-[clamp(4px,1dvh,8px)] px-4 py-[clamp(8px,1.6dvh,14px)]' : 'gap-[clamp(8px,1.4dvh,12px)] px-6 py-[clamp(12px,2.2dvh,20px)]'"
  >
    <div class="grid grid-cols-2 gap-2" :class="compact ? 'text-[11px]' : 'text-sm'">
      <div
        v-for="s in slots"
        :key="s.slot"
        class="truncate rounded-md border border-lcd-line px-2.5 py-1.5 short:py-1"
        :class="s.selected ? 'bg-lcd-chip text-lcd-chip-text' : 'text-lcd-dim'"
      >
        TS{{ s.slot }}&nbsp;&nbsp;{{ s.label }}
      </div>
    </div>
    <div class="flex items-center justify-between text-lcd-dim" :class="compact ? 'h-5 text-[13px]' : 'h-6 text-[15px]'">
      <span class="flex items-center gap-2">
        {{ status }}
        <span v-if="privateTag" class="rounded-md border border-lcd-text px-1.5 leading-tight font-bold text-lcd-text sm:px-2" :class="compact ? 'text-[11px]' : 'text-[13px]'">PRIVATE</span>
      </span>
      <span class="flex items-center gap-2.5">
        <span v-if="badge" class="rounded-md bg-lcd-chip px-2.5 py-0.5 leading-tight font-bold text-lcd-chip-text" :class="compact ? 'text-xs' : 'text-[13px]'">{{ badge }}</span>
        <span v-if="timer">{{ timer }}</span>
      </span>
    </div>
    <div role="status" aria-live="polite" class="flex flex-col" :class="compact ? 'gap-[clamp(4px,1dvh,8px)]' : 'gap-[clamp(8px,1.4dvh,12px)]'">
      <div class="truncate font-bold leading-none tracking-[0.04em]" :class="compact ? 'text-[clamp(28px,5dvh,38px)]' : 'text-[clamp(40px,6.5dvh,54px)]'">{{ headline }}</div>
      <div class="flex justify-between gap-3 tiny:hidden" :class="compact ? 'text-[13px] text-lcd-dim' : 'text-lg'">
        <span class="truncate">{{ sub }}</span>
        <span class="shrink-0 text-lcd-dim">{{ subRight }}</span>
      </div>
    </div>
    <div v-if="!compact" class="h-px bg-lcd-line" />
    <div class="flex flex-col justify-center text-lcd-dim" :class="compact ? 'h-[calc(2lh+6px)] gap-1.5 text-xs' : 'h-[calc(2lh+8px)] gap-2 text-[15px]'">
      <template v-if="meter && timeout">
        <div class="flex items-center gap-3">
          <span class="w-[8ch] shrink-0">MIC</span>
          <div class="grid h-2.5 grow gap-[3px]" :style="{ gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))` }" aria-hidden="true">
            <span v-for="i in segments" :key="i" :class="i <= Math.round(meter.lit * segments) ? 'bg-lcd-text' : 'bg-lcd-line'" />
          </div>
          <span class="w-[9ch] shrink-0 text-right">{{ meter.dbfs }} dBFS</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-[8ch] shrink-0">TIME-OUT</span>
          <div class="h-1.5 grow rounded-full bg-lcd-line" aria-hidden="true">
            <div class="h-1.5 rounded-full bg-lcd-text" :style="{ width: `${Math.round(timeout.fraction * 100)}%` }" />
          </div>
          <span class="w-[9ch] shrink-0 text-right">{{ timeout.left }}</span>
        </div>
      </template>
      <template v-else-if="talkback">
        <div class="flex justify-between gap-3">
          <span class="truncate">TALKBACK&nbsp;&nbsp;PTT replies to {{ talkback.who }}</span><span class="shrink-0">{{ talkback.seconds }} s</span>
        </div>
        <div class="rounded-sm bg-lcd-line" :class="compact ? 'h-[5px]' : 'h-1.5'" aria-hidden="true">
          <div class="h-full rounded-sm bg-lcd-text transition-[width] duration-1000 ease-linear" :style="{ width: `${Math.round(talkback.used * 100)}%` }" />
        </div>
      </template>
      <div v-else-if="compact" class="flex flex-col gap-1.5">
        <span v-for="d in details.slice(0, 2)" :key="d" class="truncate">{{ d }}</span>
      </div>
      <div v-else class="grid grid-cols-2 gap-x-6 gap-y-2">
        <span v-for="d in details" :key="d" class="truncate">{{ d }}</span>
      </div>
    </div>
  </div>
</template>
