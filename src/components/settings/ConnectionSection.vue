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
import { useSettings, validHotspot } from '@/store/settings';

import { dangerButton, inputClass, labelClass, primaryButton } from './fields';
import SettingsCard from './SettingsCard.vue';

const store = useSettings();
const radio = useRadio();
const s = computed(() => store.settings);

const hotspotText = computed({
  get: () => (s.value.hotspot.id ? String(s.value.hotspot.id) : ''),
  set: (v: string) => {
    s.value.hotspot.id = /^\d+$/.test(v) ? Number(v) : 0;
  },
});
const idValid = computed(() => validHotspot(s.value.hotspot.id));
const linked = computed(() => radio.link !== 'idle' && radio.link !== 'failed');
</script>

<template>
  <SettingsCard title="Hub">
    <label :class="labelClass">Host<input v-model.trim="s.hub.host" :class="inputClass" autocomplete="url" /></label>
    <p class="m-0 text-xs text-radio-muted">Any DMRHub. The hub tells dmr-web its WebTransport port and certificate.</p>
  </SettingsCard>

  <SettingsCard title="Hotspot" description="Sent to the hub in the hotspot login (RPTC).">
    <div class="grid gap-4 sm:grid-cols-2">
      <label :class="labelClass">
        Hotspot ID
        <input v-model="hotspotText" :class="[inputClass, 'font-mono', idValid || !hotspotText ? '' : 'border-radio-red']" inputmode="numeric" />
      </label>
      <label :class="labelClass">
        Hotspot password
        <input v-model="s.hotspot.password" type="password" :class="inputClass" autocomplete="current-password" />
      </label>
      <label :class="labelClass">
        Callsign
        <input v-model.trim="s.hotspot.callsign" :class="[inputClass, 'font-mono uppercase']" />
      </label>
      <label :class="labelClass">
        Radio ID
        <input :value="store.radioId || ''" :class="[inputClass, 'font-mono']" disabled />
      </label>
    </div>
    <p v-if="hotspotText && !idValid" class="m-0 text-xs text-radio-red">Hotspot IDs are 7 or 9 digits and start with your radio ID.</p>
    <div class="flex justify-end gap-2.5">
      <button v-if="linked" type="button" :class="dangerButton" @click="radio.disconnect()">Disconnect</button>
      <button v-else type="button" :class="primaryButton" :disabled="!store.configured" @click="radio.connect()">Connect</button>
    </div>
  </SettingsCard>
</template>
