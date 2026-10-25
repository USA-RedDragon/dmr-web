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
import { useIntervalFn } from '@vueuse/core';
import { format } from 'date-fns';
import { RefreshCw } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';

import { hubOrigin } from '@/radio/discover';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

const props = defineProps<{ compact?: boolean; mode: 'failed' | 'reconnecting' }>();

const radio = useRadio();
const store = useSettings();

const host = computed(() => {
  try {
    return hubOrigin(store.settings.hub.host).host;
  } catch {
    return store.settings.hub.host;
  }
});
const url = computed(() => radio.endpoint || `https://${host.value}`);
const port = computed(() => (radio.endpoint ? new URL(radio.endpoint).port || '443' : ''));
const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';

const failedAt = ref(Date.now());
watch(
  () => radio.link,
  (l) => {
    if (l === 'failed') {
      failedAt.value = Date.now();
    }
  },
);

const retryStart = ref(Date.now());
const now = ref(Date.now());
watch(
  () => [radio.attempt, radio.retryInMs],
  () => {
    retryStart.value = Date.now();
    now.value = Date.now();
  },
  { immediate: true },
);
useIntervalFn(() => (now.value = Date.now()), 250);
const left = computed(() => Math.max(0, Math.ceil((radio.retryInMs - (now.value - retryStart.value)) / 1000)));
const progress = computed(() => (radio.retryInMs ? Math.min(1, (now.value - retryStart.value) / radio.retryInMs) : 0));
const tries = computed(() => Math.max(1, radio.attempt));
const unsupported = computed(() => !radio.supported);
void props;
</script>

<template>
  <section
    v-if="mode === 'failed'"
    role="alert"
    class="flex flex-col gap-4 rounded-[20px] border border-radio-line bg-radio-surface"
    :class="compact ? 'p-[18px]' : 'mx-auto w-full max-w-[640px] gap-5 p-8'"
  >
    <div class="flex flex-col gap-1 rounded-xl border-2 border-lcd-line bg-lcd-bg font-mono text-lcd-text" :class="compact ? 'px-4 py-3.5' : 'px-6 py-5'">
      <span class="font-bold tracking-[0.04em]" :class="compact ? 'text-[28px]' : 'text-[32px]'">NO LINK</span>
      <span class="text-xs text-lcd-dim lg:text-sm">{{ unsupported ? 'NO WEBTRANSPORT' : 'WEBTRANSPORT FAILED' }}</span>
    </div>
    <div class="flex flex-col gap-1.5">
      <h1 class="m-0 font-bold leading-tight" :class="compact ? 'text-xl' : 'text-[22px]'">
        {{ unsupported ? "This browser can't run dmr-web" : "This browser or network can't reach the hub" }}
      </h1>
      <p class="m-0 text-sm leading-relaxed text-radio-text/80">
        <template v-if="unsupported">dmr-web needs WebTransport, which this browser does not have.</template>
        <template v-else>
          dmr-web connects over WebTransport<template v-if="port">, which runs on UDP port {{ port }}</template>. The connection to {{ host }} failed before the hub
          answered.
        </template>
      </p>
    </div>
    <div class="flex flex-col gap-2">
      <span v-if="!compact" class="text-[13px] font-semibold text-radio-text/80">Likely causes</span>
      <ul class="m-0 flex flex-col gap-2 pl-5 text-[13px] leading-normal text-radio-text/80 lg:text-sm">
        <li v-if="!unsupported && port">
          This network may block UDP {{ port }}.{{ compact ? ' Try mobile data or Wi-Fi elsewhere.' : ' Many work, school and hotel networks do. Try another network or mobile data.' }}
        </li>
        <li>
          {{ compact ? 'The browser may be too old. Safari needs iOS 26.4 or newer.' : 'The browser is too old. WebTransport needs Chrome 97, Edge 98, Firefox 114, Safari 26.4 or newer.' }}
        </li>
        <li v-if="!unsupported">The hub may not be a DMRHub, or may not accept browser radios.</li>
      </ul>
    </div>
    <div
      v-if="!unsupported"
      class="flex gap-0.5 rounded-[10px] border border-radio-line bg-radio-raised px-3 py-2.5 text-[11px] text-radio-muted lg:items-center lg:justify-between lg:px-3.5 lg:py-3 lg:text-xs"
      :class="compact ? 'flex-col' : 'flex-row'"
    >
      <span class="truncate font-mono">{{ url }}</span>
      <span class="shrink-0">{{ tries }} {{ tries === 1 ? 'try' : 'tries' }}, last at {{ format(failedAt, 'HH:mm') }} {{ zone }}<template v-if="radio.linkDetail"> · {{ radio.linkDetail }}</template></span>
    </div>
    <div v-if="!unsupported && !compact" class="flex gap-2.5">
      <button type="button" class="h-12 rounded-xl bg-radio-amber px-5 text-[15px] font-bold text-radio-amber-ink" @click="radio.connect()">Try again</button>
      <RouterLink to="/settings/connection" class="no-underline flex h-12 items-center rounded-xl border border-radio-line px-5 text-[15px] text-radio-text">Change hub</RouterLink>
    </div>
  </section>
  <div v-if="mode === 'failed' && compact && !unsupported" class="mt-auto grid grid-cols-2 gap-2">
    <button type="button" class="h-[52px] rounded-xl bg-radio-amber text-base font-bold text-radio-amber-ink" @click="radio.connect()">Try again</button>
    <RouterLink to="/settings/connection" class="no-underline flex h-[52px] items-center justify-center rounded-xl border border-radio-line text-base text-radio-text">Change hub</RouterLink>
  </div>

  <div v-if="mode === 'reconnecting'" class="fixed inset-0 z-30 bg-[rgba(5,6,8,0.6)]" :class="compact ? '' : 'flex items-center justify-center'">
    <div
      role="status"
      class="flex flex-col gap-2.5 border border-[#5a4318] bg-radio-raised shadow-[0_10px_24px_rgba(0,0,0,0.5)]"
      :class="compact ? 'absolute inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] rounded-2xl p-3.5' : 'w-[440px] gap-3.5 rounded-[20px] p-6'"
    >
      <div class="flex items-center gap-2.5 lg:gap-3.5">
        <span class="flex shrink-0 items-center justify-center rounded-full bg-radio-amber-soft text-radio-accent" :class="compact ? 'size-8' : 'size-11'">
          <RefreshCw :class="compact ? 'size-[18px]' : 'size-5'" />
        </span>
        <span class="flex grow flex-col gap-0.5">
          <span class="font-bold" :class="compact ? 'text-[15px]' : 'text-lg'">Link to {{ host }} lost</span>
          <span class="text-xs text-radio-text/80 lg:text-[13px]">Reconnecting<template v-if="left"> in {{ left }} s</template>, attempt {{ radio.attempt }}</span>
        </span>
      </div>
      <div class="h-[5px] rounded-full bg-radio-line"><div class="h-[5px] rounded-full bg-radio-amber" :style="{ width: `${Math.round(progress * 100)}%` }" /></div>
      <div class="flex items-center justify-between gap-2.5" :class="compact ? '' : 'flex-col items-start gap-3.5'">
        <span class="text-xs text-radio-muted lg:text-[13px]">
          {{ compact ? 'The radio logs in again on its own.' : 'The radio logs in to the hub again on its own. Your talkgroups, slot and settings stay as they are.' }}
        </span>
        <div class="flex gap-2.5">
          <button type="button" class="shrink-0 rounded-[10px] bg-radio-amber px-3.5 font-bold text-radio-amber-ink" :class="compact ? 'h-10 text-[13px]' : 'h-11 px-[18px] text-sm'" @click="radio.connect()">
            Reconnect now
          </button>
          <RouterLink v-if="!compact" to="/settings/diagnostics" class="no-underline flex h-11 items-center rounded-[10px] border border-radio-line px-[18px] text-sm text-radio-text">
            Diagnostics
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
