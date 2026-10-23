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

import { useNames } from '@/lib/names';
import type { Peer } from '@/lib/threads';

const props = withDefaults(defineProps<{ peer: Peer; size?: number }>(), { size: 40 });
const names = useNames();

const tone = computed(() => {
  if (props.peer.group) {
    return 'text-radio-text';
  }
  return ['text-radio-accent', 'text-radio-cyan', 'text-radio-text'][props.peer.id % 3];
});
</script>

<template>
  <span
    aria-hidden="true"
    class="flex shrink-0 items-center justify-center bg-radio-raised text-[13px] font-bold"
    :class="[peer.group ? 'rounded-[10px]' : 'rounded-full', tone]"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    {{ names.initials(peer) }}
  </span>
</template>
