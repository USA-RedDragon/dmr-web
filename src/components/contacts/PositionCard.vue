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
import { format as formatDate, formatDistanceToNowStrict } from 'date-fns';
import { Crosshair, MapPin } from 'lucide-vue-next';
import { computed, toRef } from 'vue';
import { useRouter } from 'vue-router';

import { failedReason, usePositionRequest } from '@/lib/positionRequest';
import { degrees, describe } from '@/store/positions';

const props = withDefaults(defineProps<{ id: number; timeslot: number; compact?: boolean }>(), { compact: false });

const router = useRouter();
const { position, request, phase, now, ask } = usePositionRequest(toRef(props, 'id'), toRef(props, 'timeslot'));

const title = computed(() => {
  switch (phase.value) {
    case 'asking':
      return 'Asking for a position';
    case 'answered':
      return position.value ? degrees(position.value.latitude, position.value.longitude) : '';
    case 'noPosition':
      return props.compact ? 'Answered without a position' : 'The radio answered without a position';
    case 'noAnswer':
      return 'No answer yet';
    case 'failed':
      return 'Not sent';
    default:
      return 'No position yet';
  }
});

const detail = computed(() => {
  const r = request.value;
  switch (phase.value) {
    case 'asking':
      return `Sent on TS${r?.slot ?? props.timeslot} at ${r ? formatDate(r.startedAt, 'HH:mm') : ''}. A radio with GPS on answers within a minute.`;
    case 'answered': {
      const p = position.value;
      if (!p) {
        return '';
      }
      void now.value;
      const age = now.value - p.at < 60_000 ? 'Just now' : formatDistanceToNowStrict(p.at, { addSuffix: true }).replace(/^./, (c) => c.toUpperCase());
      return `${age} · ${describe(p)}`;
    }
    case 'noPosition':
      return 'Its GPS may be off or still looking for a fix.';
    case 'noAnswer':
      return 'The radio may be off, out of range, or not set up to answer.';
    case 'failed':
      return failedReason(r?.reason ?? '');
    default:
      return props.compact ? 'Ask the radio where it is. It answers when its GPS is on.' : 'Ask the radio where it is. It answers over LRRP when its GPS is on.';
  }
});

const askLabel = computed(() => (phase.value === 'answered' ? 'Request update' : phase.value === 'none' ? 'Request position' : 'Ask again'));

function show(): void {
  void router.push({ path: '/map', query: { station: String(props.id) } });
}

const button = 'flex h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] px-3.5 text-[13px] font-semibold';
</script>

<template>
  <div aria-label="Position" class="flex rounded-[14px] border border-radio-line bg-radio-surface" :class="compact ? 'w-full flex-col gap-3 p-3.5' : 'w-[590px] max-w-full items-center gap-3.5 py-3.5 pr-3.5 pl-4'">
    <div class="flex min-w-0 grow items-center gap-3" :class="compact ? '' : 'gap-3.5'">
      <span class="flex shrink-0 items-center justify-center rounded-full bg-radio-raised text-radio-text/80" :class="compact ? 'size-9' : 'size-10'">
        <MapPin :class="compact ? 'size-[18px]' : 'size-5'" aria-hidden="true" />
      </span>
      <div class="flex min-w-0 grow flex-col gap-0.5" :role="phase === 'answered' || phase === 'none' ? undefined : 'status'">
        <span class="flex items-center gap-2 font-semibold" :class="[compact ? 'text-[15px]' : 'text-sm', phase === 'answered' ? 'font-mono !text-sm' : '']">
          <span v-if="phase === 'asking'" class="size-2 rounded-full bg-radio-amber" aria-hidden="true" />{{ title }}
        </span>
        <span class="text-radio-muted" :class="compact ? 'text-[13px] leading-snug' : 'text-xs'">{{ detail }}</span>
      </div>
    </div>
    <button v-if="phase === 'asking'" type="button" disabled :class="[button, compact ? 'h-11 rounded-xl text-sm' : '', 'border border-radio-line text-radio-muted']">Asking</button>
    <div v-else class="flex shrink-0 gap-2" :class="compact && phase === 'answered' ? 'grid grid-cols-2' : ''">
      <button type="button" :class="[button, compact ? 'h-11 grow rounded-xl text-sm' : '', 'border border-radio-line text-radio-text']" @click="ask">
        <Crosshair v-if="phase === 'none'" class="size-4" aria-hidden="true" />{{ askLabel }}
      </button>
      <button v-if="phase === 'answered'" type="button" :class="[button, compact ? 'h-11 rounded-xl text-sm' : '', 'bg-radio-amber font-bold text-radio-amber-ink']" @click="show">Show on map</button>
    </div>
  </div>
</template>
