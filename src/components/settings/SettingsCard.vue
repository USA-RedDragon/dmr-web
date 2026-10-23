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
defineProps<{ title?: string; description?: string }>();
</script>

<template>
  <section class="flex flex-col gap-3.5 rounded-2xl border border-radio-line bg-radio-surface p-4 sm:p-[22px]">
    <div v-if="title || $slots.action" class="flex items-start justify-between gap-4">
      <div class="flex flex-col gap-1">
        <h2 v-if="title" class="m-0 text-[15px] font-semibold sm:text-[17px]">{{ title }}</h2>
        <p v-if="description" class="m-0 text-[13px] text-radio-muted">{{ description }}</p>
      </div>
      <slot name="action" />
    </div>
    <slot />
  </section>
</template>
