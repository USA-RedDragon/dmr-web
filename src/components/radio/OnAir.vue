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
import { computed, toRef } from 'vue';

import { hubOrigin } from '@/radio/discover';
import { useOnAir } from '@/lib/onAir';

const props = withDefaults(defineProps<{ host: string; compact?: boolean }>(), { compact: false });

const { entries, failed } = useOnAir(toRef(props, 'host'), props.compact ? 1 : 5);

const hostName = computed(() => {
  try {
    return hubOrigin(props.host).host;
  } catch {
    return props.host;
  }
});

function when(start: Date, active: boolean): string {
  return active ? 'now' : `${formatDistanceToNowStrict(start)} ago`;
}
</script>

<template>
  <div v-if="compact" class="flex items-center justify-between gap-3 border-t border-radio-line pt-2.5">
    <span class="flex items-center gap-1.5 text-xs text-radio-green"><span class="size-2 rounded-full bg-radio-green" />On the air now</span>
    <span class="truncate font-mono text-[13px]">
      <template v-if="entries[0]">{{ entries[0].callsign }} · {{ entries[0].target }}</template>
      <template v-else>{{ failed ? '-' : 'Nobody yet' }}</template>
    </span>
  </div>
  <section v-else aria-label="On the air now" class="flex flex-col rounded-[20px] border border-radio-line bg-radio-surface p-[22px]">
    <div class="flex items-center justify-between pb-2">
      <h2 class="m-0 text-[15px] font-semibold">On the air now</h2>
      <span class="flex items-center gap-1.5 text-xs" :class="failed ? 'text-radio-muted' : 'text-radio-green'">
        <span class="size-2 rounded-full" :class="failed ? 'bg-radio-muted' : 'bg-radio-green'" />{{ failed ? `Can't reach ${hostName}` : `From ${hostName}` }}
      </span>
    </div>
    <p v-if="!failed && entries.length === 0" class="m-0 py-3 text-sm text-radio-muted">Nobody has been on the air yet.</p>
    <div
      v-for="(e, i) in entries"
      :key="e.id"
      class="flex items-center justify-between border-radio-line py-2.5"
      :class="i > 0 ? 'border-t' : ''"
    >
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="truncate font-mono font-semibold">{{ e.callsign }}</span>
        <span class="text-xs text-radio-muted">{{ e.target }} · {{ when(e.start, e.active) }}</span>
      </div>
      <span class="text-xs text-radio-text/70">{{ e.seconds }} s</span>
    </div>
  </section>
</template>
