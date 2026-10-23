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
import { Star } from 'lucide-vue-next';
import { computed } from 'vue';

import { useContacts } from '@/store/contacts';

const props = withDefaults(defineProps<{ id: number; callsign?: string; heard?: { at: number; target: number; group: boolean }; size?: number }>(), {
  callsign: '',
  heard: undefined,
  size: 18,
});

const contacts = useContacts();
const on = computed(() => contacts.has(props.id));
const who = computed(() => props.callsign || contacts.get(props.id)?.callsign || String(props.id));
</script>

<template>
  <button
    type="button"
    :aria-label="on ? `Remove ${who} from contacts` : `Add ${who} to contacts`"
    :aria-pressed="on"
    class="flex size-11 shrink-0 items-center justify-center rounded-[10px]"
    @click.stop="contacts.toggle(id, callsign, heard)"
  >
    <Star
      :style="{ width: `${size}px`, height: `${size}px` }"
      :stroke-width="1.8"
      :class="on ? 'fill-radio-amber text-radio-amber' : 'text-radio-muted'"
      aria-hidden="true"
    />
  </button>
</template>
