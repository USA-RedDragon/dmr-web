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
import { formatDistanceToNowStrict } from 'date-fns';
import { computed } from 'vue';

import type { HeardEntry } from '@/store/radio';

import VocoderBadge from './VocoderBadge.vue';

const props = withDefaults(defineProps<{ entries: HeardEntry[]; limit?: number; compact?: boolean }>(), {
  limit: 8,
  compact: false,
});

const shown = computed(() => props.entries.slice(0, props.limit));

function when(e: HeardEntry): string {
  return formatDistanceToNowStrict(e.at, { addSuffix: true });
}
</script>

<template>
  <section aria-label="Last heard" class="flex flex-col">
    <div class="flex items-center justify-between" :class="compact ? 'h-9' : 'pb-2'">
      <h2 class="m-0 font-semibold" :class="compact ? 'text-[13px]' : 'text-base'">Last heard</h2>
      <span class="text-xs text-radio-muted">This session</span>
    </div>
    <p v-if="shown.length === 0" class="py-3 text-sm text-radio-muted">Nothing heard yet.</p>
    <div
      v-for="(e, i) in shown"
      :key="`${e.at}-${e.source}`"
      class="flex items-center justify-between border-radio-line"
      :class="[compact ? 'py-2' : 'py-3', i > 0 || compact ? 'border-t' : '']"
    >
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="truncate font-mono font-semibold" :class="compact ? 'text-sm' : ''">
          {{ e.source }}<template v-if="e.self"> (you)</template>
          <span v-if="e.alias" class="ml-2 font-sans text-xs font-normal text-radio-muted">{{ e.alias }}</span>
        </span>
        <span class="text-xs text-radio-muted">
          {{ e.group ? `TG ${e.target}` : 'Private' }} · TS{{ e.slot }} · {{ when(e) }} · {{ e.seconds }} s
        </span>
      </div>
      <VocoderBadge :vocoder="e.vocoder" />
    </div>
  </section>
</template>
