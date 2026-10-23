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
    class="flex flex-col gap-3 rounded-[14px] border-2 border-lcd-line bg-lcd-bg font-mono text-lcd-text shadow-[inset_0_2px_12px_rgba(0,0,0,0.45)]"
    :class="compact ? 'gap-2 px-4 py-3.5' : 'px-6 py-5'"
    role="status"
    aria-live="polite"
  >
    <div class="grid grid-cols-2 gap-2" :class="compact ? 'text-[11px]' : 'text-sm'">
      <div
        v-for="s in slots"
        :key="s.slot"
        class="truncate rounded-md border border-lcd-line px-2.5 py-1.5"
        :class="s.selected ? 'bg-lcd-chip text-lcd-chip-text' : 'text-lcd-dim'"
      >
        TS{{ s.slot }}&nbsp;&nbsp;{{ s.label }}
      </div>
    </div>
    <div v-if="status || badge || timer" class="flex items-center justify-between text-lcd-dim" :class="compact ? 'text-[13px]' : 'text-[15px]'">
      <span class="flex items-center gap-2">
        {{ status }}
        <span v-if="privateTag" class="rounded-md border border-lcd-text px-1.5 font-bold text-lcd-text sm:px-2" :class="compact ? 'text-[11px]' : 'text-[13px]'">PRIVATE</span>
      </span>
      <span class="flex items-center gap-2.5">
        <span v-if="badge" class="rounded-md bg-lcd-chip px-2.5 py-0.5 text-[13px] font-bold text-lcd-chip-text">{{ badge }}</span>
        <span v-if="timer">{{ timer }}</span>
      </span>
    </div>
    <div class="truncate font-bold leading-none tracking-[0.04em]" :class="compact ? 'text-[38px]' : 'text-[54px]'">{{ headline }}</div>
    <div class="flex justify-between gap-3" :class="compact ? 'text-[13px] text-lcd-dim' : 'text-lg'">
      <span class="truncate">{{ sub }}</span>
      <span class="shrink-0 text-lcd-dim">{{ subRight }}</span>
    </div>
    <template v-if="talkback && !meter">
      <div v-if="!compact" class="h-px bg-lcd-line" />
      <div class="flex flex-col text-lcd-dim" :class="compact ? 'gap-1.5 text-xs' : 'gap-2 text-[15px]'">
        <div class="flex justify-between">
          <span>TALKBACK<template v-if="!compact">&nbsp;&nbsp;PTT replies to {{ talkback.who }}</template></span><span>{{ talkback.seconds }} s</span>
        </div>
        <div class="rounded-sm bg-lcd-line" :class="compact ? 'h-[5px]' : 'h-1.5'" aria-hidden="true">
          <div class="h-full rounded-sm bg-lcd-text transition-[width] duration-1000 ease-linear" :style="{ width: `${Math.round(talkback.used * 100)}%` }" />
        </div>
      </div>
    </template>
    <template v-else-if="meter && timeout">
      <div class="h-px bg-lcd-line" />
      <div class="flex flex-col text-lcd-dim" :class="compact ? 'gap-1.5 text-xs' : 'gap-2 text-sm'">
        <div class="flex justify-between"><span>MIC</span><span>{{ meter.dbfs }} dBFS</span></div>
        <div class="grid gap-[3px]" :class="compact ? 'h-2.5' : 'h-3.5'" :style="{ gridTemplateColumns: `repeat(${segments}, minmax(0, 1fr))` }" aria-hidden="true">
          <span v-for="i in segments" :key="i" :class="i <= Math.round(meter.lit * segments) ? 'bg-lcd-text' : 'bg-lcd-line'" />
        </div>
        <div class="mt-1 flex justify-between"><span>TIME-OUT</span><span>{{ timeout.left }} left</span></div>
        <div class="h-1.5 rounded-full bg-lcd-line"><div class="h-1.5 rounded-full bg-lcd-text" :style="{ width: `${Math.round(timeout.fraction * 100)}%` }" /></div>
      </div>
    </template>
    <template v-else-if="details.length && !compact">
      <div class="h-px bg-lcd-line" />
      <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-[15px] text-lcd-dim">
        <span v-for="d in details" :key="d" class="truncate">{{ d }}</span>
      </div>
    </template>
    <div v-else-if="details.length && headline !== 'NO LINK'" class="truncate text-[13px] text-lcd-dim">{{ details[0] }}</div>
  </div>
</template>
