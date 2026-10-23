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
defineProps<{ vocoder: string }>();
</script>

<template>
  <span
    v-if="vocoder === 'ambe'"
    class="shrink-0 rounded-md bg-radio-amber px-2 py-0.5 text-[11px] font-bold text-radio-amber-ink"
  >
    AMBE
  </span>
  <span
    v-else-if="vocoder === 'codec2'"
    class="shrink-0 rounded-md border border-radio-cyan px-[7px] py-[1px] text-[11px] font-bold text-radio-cyan"
  >
    CODEC2
  </span>
</template>
