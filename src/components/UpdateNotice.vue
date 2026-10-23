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
import { ref } from 'vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';

import { useRadio } from '@/store/radio';

const radio = useRadio();
const later = ref(false);
const { needRefresh, updateServiceWorker } = useRegisterSW({ immediate: true });

function reload(): void {
  void updateServiceWorker(true);
}
</script>

<template>
  <div
    v-if="needRefresh && !later"
    role="status"
    class="fixed bottom-4 left-4 right-4 z-40 flex flex-col gap-3 rounded-2xl border border-radio-line bg-radio-raised p-4 shadow-xl sm:right-auto sm:w-[380px]"
  >
    <div class="flex flex-col gap-1">
      <span class="text-sm font-semibold">A new version of dmr-web is ready</span>
      <span v-if="radio.tx.active || radio.calls[1].active || radio.calls[2].active" class="text-xs text-radio-muted">
        Reload after this call ends.
      </span>
    </div>
    <div class="flex gap-2">
      <button type="button" class="h-10 rounded-[10px] bg-radio-amber px-4 text-sm font-bold text-radio-amber-ink" @click="reload">Reload</button>
      <button type="button" class="h-10 rounded-[10px] border border-radio-line px-4 text-sm" @click="later = true">Later</button>
    </div>
  </div>
</template>
