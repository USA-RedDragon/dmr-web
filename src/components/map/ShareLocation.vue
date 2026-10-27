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
import { format as formatDate } from 'date-fns';
import { computed } from 'vue';

import ToggleSwitch from '@/components/settings/ToggleSwitch.vue';
import { hubOrigin } from '@/radio/discover';
import { useAccount } from '@/store/account';
import { LOCATION_SERVICES, OWN_INTERVAL_MS, serviceLabel, usePositions } from '@/store/positions';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const positions = usePositions();
const radio = useRadio();
const settings = useSettings();
const account = useAccount();

const hubName = computed(() => {
  try {
    return hubOrigin(settings.settings.hub.host).host;
  } catch {
    return settings.settings.hub.host;
  }
});

function minutes(ms: number): string {
  return ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;
}

const line = computed(() => {
  const to = serviceLabel(positions.service);
  if (!settings.settings.ars) {
    return `Every ${minutes(OWN_INTERVAL_MS)} as LRRP on TS2, to ${to}`;
  }
  const every = positions.hubEvery;
  return every && every.source === positions.service ? `Every ${minutes(every.ms)}, as ${hubName.value} asks, to ${to}` : `When ${hubName.value} asks, as LRRP on TS2, to ${to}`;
});

const service = computed({
  get: () => positions.service,
  set: (v: number) => positions.setService(Number(v)),
});

const sent = computed(() => {
  const r = radio.report;
  if (!r) {
    return '';
  }
  if (!r.error) {
    return `Sent your position to ${serviceLabel(positions.service)} at ${formatDate(r.at, 'HH:mm')}.`;
  }
  return r.error === 'notConnected' ? 'Not sent: not connected to the hub.' : `Not sent: ${r.error}`;
});

const trackingOff = computed(() => account.loggedIn && account.user?.positionTracking === false);
const hubPositions = computed(() => {
  try {
    return new URL('/positions', hubOrigin(account.host)).toString();
  } catch {
    return '';
  }
});

const select = 'rounded-[10px] border border-radio-line bg-radio-surface px-2.5 text-radio-text outline-none focus-visible:border-radio-amber';
const button = 'rounded-[10px] border border-radio-line text-sm text-radio-text';
</script>

<template>
  <div class="flex flex-col" :class="compact ? 'gap-2.5' : 'gap-3'">
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-sm font-semibold">Share my location</span>
        <span class="text-xs text-radio-text/75">{{ line }}</span>
      </div>
      <ToggleSwitch class="shrink-0" :model-value="positions.share" label="Share my location" @update:model-value="positions.setShare" />
    </div>
    <div v-if="compact" class="grid grid-cols-2 gap-2">
      <label for="share-symbol-compact" class="sr-only">APRS symbol</label>
      <select id="share-symbol-compact" v-model.number="service" :class="[select, 'h-11 text-[15px]']">
        <option v-for="s in LOCATION_SERVICES" :key="s.id" :value="s.id">{{ s.symbol }} ({{ s.id }})</option>
      </select>
      <button type="button" :class="[button, 'h-11']" @click="radio.reportPosition()">Send my position once</button>
    </div>
    <template v-else>
      <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
        APRS symbol
        <select v-model.number="service" :class="[select, 'h-10 text-sm']">
          <option v-for="s in LOCATION_SERVICES" :key="s.id" :value="s.id">{{ s.symbol }} ({{ s.id }})</option>
        </select>
      </label>
      <button type="button" :class="[button, 'h-11']" @click="radio.reportPosition()">Send my position once</button>
    </template>
    <p v-if="sent" role="status" class="m-0 text-xs text-radio-muted">{{ sent }}</p>
    <p v-if="trackingOff" class="m-0 text-xs leading-normal text-radio-muted">
      Position tracking is off for your account on {{ hubName }}, so the hub keeps nothing you share. Turn it on for your radio ID on
      <a :href="hubPositions" target="_blank" rel="noopener">the Positions page of DMRHub</a>.
    </p>
  </div>
</template>
