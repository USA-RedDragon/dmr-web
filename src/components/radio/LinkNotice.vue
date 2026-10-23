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

import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

defineProps<{ compact?: boolean }>();

const radio = useRadio();
const store = useSettings();

const url = computed(() => radio.endpoint || store.settings.hub.host);
const port = computed(() => (radio.endpoint ? new URL(radio.endpoint).port : ''));
</script>

<template>
  <section
    v-if="!radio.supported || radio.link === 'failed'"
    role="alert"
    class="flex flex-col gap-4 rounded-[20px] border border-radio-line bg-radio-surface"
    :class="compact ? 'gap-3 rounded-[14px] p-4' : 'p-6'"
  >
    <div class="flex flex-col gap-2">
      <h1 class="m-0 font-bold" :class="compact ? 'text-lg' : 'text-[22px]'">
        {{ radio.supported ? "This browser or network can't reach the hub" : "This browser can't run dmr-web" }}
      </h1>
      <p class="m-0 text-sm leading-relaxed text-radio-text/80">
        dmr-web connects over WebTransport<template v-if="port">, on UDP port {{ port }}</template>.
        <template v-if="radio.supported">The connection to {{ store.settings.hub.host }} failed before the hub answered.</template>
      </p>
    </div>
    <ul class="m-0 flex flex-col gap-2 pl-5 text-sm leading-normal text-radio-text/80">
      <li v-if="radio.supported && port">This network may block UDP port {{ port }}. Many work, school and hotel networks do. Try another network or mobile data.</li>
      <li>WebTransport needs Chrome 97, Edge 98, Firefox 114, Safari 26.4 or newer.</li>
      <li v-if="radio.supported">The hub is not a DMRHub, or it doesn't accept browser radios.</li>
    </ul>
    <div v-if="radio.supported" class="flex items-center justify-between gap-3 rounded-[10px] border border-radio-line bg-radio-raised px-3.5 py-3 text-xs text-radio-muted">
      <span class="truncate font-mono">{{ url }}</span>
      <span class="shrink-0">{{ radio.linkDetail }}</span>
    </div>
    <div v-if="radio.supported" class="flex gap-2.5">
      <button type="button" class="h-12 rounded-xl bg-radio-amber px-5 text-[15px] font-bold text-radio-amber-ink" @click="radio.connect()">Try again</button>
      <RouterLink to="/settings/connection" class="no-underline flex h-12 items-center rounded-xl border border-radio-line px-5 text-[15px] text-radio-text">
        Change hub
      </RouterLink>
    </div>
  </section>
  <div
    v-else-if="radio.link === 'reconnecting'"
    role="status"
    class="flex items-center justify-between gap-3 rounded-[14px] border border-radio-amber bg-radio-amber-soft px-4 py-3 text-sm"
  >
    <span>
      Link to {{ store.settings.hub.host }} lost. Reconnecting<template v-if="radio.retryInMs"> in {{ Math.ceil(radio.retryInMs / 1000) }} s</template>, attempt
      {{ radio.attempt }}.
    </span>
    <button type="button" class="h-10 shrink-0 rounded-[10px] border border-radio-amber px-3 text-[13px] font-semibold" @click="radio.connect()">
      Reconnect now
    </button>
  </div>
</template>
