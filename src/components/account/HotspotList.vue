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

import { BROWSER_RADIO, useAccount } from '@/store/account';

const props = withDefaults(defineProps<{ compact?: boolean; extra?: number; badge?: boolean; savedText?: string }>(), {
  compact: false,
  extra: 0,
  badge: false,
  savedText: 'password saved on this device',
});
const selected = defineModel<number>({ required: true });

const account = useAccount();

const rows = computed(() => {
  const ids = account.hotspots.map((h) => h.id);
  if (props.extra && !ids.includes(props.extra)) {
    ids.push(props.extra);
  }
  return ids.map((id) => {
    const h = account.hotspots.find((x) => x.id === id);
    const saved = account.saved[String(id)];
    const kind = saved?.name || (h ? (h.description === BROWSER_RADIO ? 'Browser radio' : h.description || h.location || 'Hotspot') : 'Entered by hand');
    return { id, kind, ready: !!saved?.password };
  });
});
</script>

<template>
  <label
    v-for="r in rows"
    :key="r.id"
    class="flex cursor-pointer items-center gap-3 rounded-xl border box-border"
    :class="[
      compact ? 'min-h-[52px] gap-2.5 px-3 py-2.5' : 'min-h-14 px-4 py-3',
      selected === r.id ? 'border-radio-amber bg-radio-amber-soft' : 'border-radio-line bg-radio-raised',
    ]"
  >
    <input v-model="selected" type="radio" :value="r.id" class="size-[18px] accent-radio-amber" />
    <span class="flex grow flex-col gap-0.5">
      <span class="font-mono font-semibold" :class="compact ? 'text-sm' : 'text-[15px]'">{{ r.id }}</span>
      <span class="text-radio-muted" :class="compact ? 'text-[11px]' : 'text-xs'">
        {{ r.kind }}<template v-if="!compact"> · {{ r.ready ? savedText : 'needs its password once' }}</template>
      </span>
    </span>
    <span v-if="badge && r.ready" class="rounded-[5px] border border-radio-green px-[7px] py-0.5 text-[11px] font-semibold text-radio-green">READY</span>
  </label>
</template>
