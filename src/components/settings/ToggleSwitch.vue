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
defineProps<{ label: string }>();
const on = defineModel<boolean>({ required: true });
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="on"
    :aria-label="label"
    class="relative h-[30px] w-[52px] shrink-0 rounded-full border before:absolute before:-inset-x-1 before:-inset-y-[8px] before:content-['']"
    :class="on ? 'border-radio-amber bg-radio-amber-soft' : 'border-radio-line bg-radio-raised'"
    @click="on = !on"
  >
    <span class="absolute top-[3px] size-[22px] rounded-full transition-all" :class="on ? 'right-[3px] bg-radio-amber' : 'left-[3px] bg-radio-muted'" />
  </button>
</template>
