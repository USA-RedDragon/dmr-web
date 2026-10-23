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
import { format } from 'date-fns';
import { computed, nextTick, ref } from 'vue';

import HotspotList from '@/components/account/HotspotList.vue';
import RegisterHotspotDialog from '@/components/account/RegisterHotspotDialog.vue';
import { allowedSummary } from '@/lib/oauth';
import { useAccount } from '@/store/account';
import { useRadio } from '@/store/radio';
import { useSettings, validHotspot } from '@/store/settings';

import { dangerButton, inputClass, labelClass, primaryButton, secondaryButton } from './fields';
import SettingsCard from './SettingsCard.vue';
import ToggleSwitch from './ToggleSwitch.vue';

const store = useSettings();
const radio = useRadio();
const account = useAccount();
const s = computed(() => store.settings);

const hotspotText = computed({
  get: () => (s.value.hotspot.id ? String(s.value.hotspot.id) : ''),
  set: (v: string) => {
    s.value.hotspot.id = /^\d+$/.test(v) ? Number(v) : 0;
  },
});
const idValid = computed(() => validHotspot(s.value.hotspot.id));
const linked = computed(() => radio.link !== 'idle' && radio.link !== 'failed');
const registering = ref(false);
const loginFailure = ref('');
const hostInput = ref<HTMLInputElement | null>(null);

const selected = computed({
  get: () => s.value.hotspot.id,
  set: (id: number) => {
    const saved = account.saved[String(id)]?.password ?? '';
    void account.choose(id, saved, s.value.hotspot.callsign || account.user?.callsign || '');
  },
});
const initials = computed(() => (account.user?.callsign ?? '').slice(0, 2));
const endpoint = computed(() => {
  const url = radio.endpoint;
  if (!url) {
    return '';
  }
  const u = new URL(url);
  return `UDP ${u.port || 443}, path ${u.pathname}`;
});

function savePassword(): void {
  const id = s.value.hotspot.id;
  if (account.loggedIn && validHotspot(id) && s.value.hotspot.password) {
    void account.saveHotspot(id, { password: s.value.hotspot.password, name: account.saved[String(id)]?.name ?? '' });
  }
}

async function login(): Promise<void> {
  loginFailure.value = '';
  try {
    await account.login(s.value.hub.host);
  } catch (err) {
    loginFailure.value = err instanceof Error ? err.message : String(err);
  }
}

async function changeHub(): Promise<void> {
  if (linked.value) {
    radio.disconnect();
  }
  await account.logout();
  await nextTick();
  hostInput.value?.focus();
  hostInput.value?.select();
}

function registered(id: number, password: string): void {
  registering.value = false;
  void account.choose(id, password, s.value.hotspot.callsign || account.user?.callsign || '').then(() => radio.connect());
}

if (account.loggedIn && !account.hotspotsLoaded) {
  account.loadHotspots().catch(() => undefined);
}
</script>

<template>
  <SettingsCard title="Hub">
    <label :class="labelClass">Host<input ref="hostInput" v-model.trim="s.hub.host" :class="inputClass" autocomplete="url" :disabled="account.loggedIn" /></label>
    <div class="flex items-start justify-between gap-3">
      <p class="m-0 text-xs text-radio-muted">
        <template v-if="endpoint">{{ endpoint }}, from the hub.</template>
        <template v-else>Any DMRHub. The hub tells dmr-web its WebTransport port and certificate.</template>
      </p>
      <button
        v-if="account.loggedIn"
        type="button"
        class="-my-3 -mr-2 flex min-h-11 shrink-0 items-center px-2 text-xs text-radio-accent"
        :title="`Logs you out of ${s.hub.host}`"
        @click="changeHub"
      >
        Change
      </button>
    </div>
  </SettingsCard>

  <section v-if="account.loggedIn" class="flex items-center justify-between gap-3 rounded-2xl border border-radio-line bg-radio-surface p-4 sm:p-[22px]">
    <div class="flex min-w-0 items-center gap-2.5 sm:gap-3">
      <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-radio-raised text-[13px] font-bold text-radio-accent sm:size-10 sm:text-sm">{{ initials }}</span>
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="truncate text-sm font-semibold sm:text-[15px]">{{ account.user?.callsign }}<span class="hidden sm:inline">, DMRHub account</span></span>
        <span class="truncate text-xs text-radio-muted sm:hidden">DMRHub account</span>
        <span class="hidden truncate text-xs text-radio-muted sm:inline">Allowed: {{ allowedSummary(account.scope) }}</span>
      </div>
    </div>
    <button type="button" :class="[secondaryButton, 'shrink-0']" @click="account.logout()">Log out</button>
  </section>
  <SettingsCard v-else title="DMRHub account" description="Log in to pick a hotspot from your account, register new ones and keep your talkgroups in step.">
    <p v-if="loginFailure || account.error" role="alert" class="m-0 text-xs text-radio-red">{{ loginFailure || account.error }}</p>
    <div class="flex justify-end">
      <button type="button" :class="primaryButton" @click="login">Log in with DMRHub</button>
    </div>
  </SettingsCard>

  <SettingsCard title="Hotspot" :description="account.loggedIn ? undefined : 'Sent to the hub in the hotspot login (RPTC).'">
    <template v-if="account.loggedIn" #action>
      <button type="button" :class="[secondaryButton, 'hidden sm:block']" @click="registering = true">Register a new hotspot</button>
    </template>
    <template v-if="account.loggedIn">
      <fieldset class="m-0 flex flex-col gap-2.5 border-none p-0">
        <legend class="sr-only">Your hotspots</legend>
        <p v-if="account.hotspotsLoaded && !account.hotspots.length" class="m-0 text-sm text-radio-muted">No hotspots on this account yet.</p>
        <HotspotList v-model="selected" :extra="s.hotspot.id" saved-text="password saved" />
        <button type="button" :class="[secondaryButton, 'sm:hidden']" @click="registering = true">Register a new hotspot</button>
      </fieldset>
      <div class="grid gap-4 sm:grid-cols-3">
        <label :class="labelClass">Callsign<input v-model.trim="s.hotspot.callsign" :class="[inputClass, 'font-mono uppercase']" /></label>
        <label :class="labelClass">Location<input v-model="s.hotspot.location" :class="inputClass" placeholder="City, State" /></label>
        <label :class="labelClass">
          Hotspot password
          <input v-model="s.hotspot.password" type="password" :class="inputClass" autocomplete="current-password" @change="savePassword" />
        </label>
      </div>
      <p class="m-0 text-xs text-radio-muted sm:hidden">Sent to the hub in the hotspot login (RPTC).</p>
    </template>
    <template v-else>
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
    </template>
    <div class="flex items-center justify-end gap-2.5" :class="account.loggedIn ? 'max-sm:hidden sm:justify-between' : ''">
      <span v-if="account.loggedIn" class="hidden text-xs text-radio-muted sm:inline">Sent to the hub in the hotspot login (RPTC).</span>
      <button v-if="linked" type="button" :class="dangerButton" @click="radio.disconnect()">Disconnect</button>
      <button v-else type="button" :class="primaryButton" :disabled="!store.configured" @click="radio.connect()">Connect</button>
    </div>
  </SettingsCard>

  <section class="flex items-center justify-between gap-3 rounded-2xl border border-radio-line bg-radio-surface px-4 py-3 sm:gap-5 sm:px-[22px] sm:py-[18px]">
    <div class="flex min-w-0 flex-col gap-1">
      <div class="flex items-center gap-2.5">
        <h2 class="m-0 text-[15px] font-semibold">ARS registration</h2>
        <span v-if="s.ars && radio.ars.status !== 'none'" class="flex items-center gap-1.5 text-xs" :class="radio.ars.status === 'registered' ? 'text-radio-green' : 'text-radio-red'">
          <span class="size-2 rounded-full" :class="radio.ars.status === 'registered' ? 'bg-radio-green' : 'bg-radio-red'" />
          {{ radio.ars.status === 'registered' ? 'Registered' : 'Not registered' }}
        </span>
      </div>
      <span class="text-xs text-radio-muted max-sm:hidden">
        Tells location and text servers this radio is on, so they can send it texts and location requests.<template v-if="s.ars && radio.ars.at">
          Last registered {{ format(radio.ars.at, 'HH:mm') }}.</template
        >
      </span>
    </div>
    <ToggleSwitch v-model="s.ars" class="shrink-0" label="Register with ARS" />
  </section>
  <template v-if="account.loggedIn">
    <button v-if="linked" type="button" class="h-12 w-full rounded-xl border border-radio-red/60 text-[15px] font-semibold text-radio-red sm:hidden" @click="radio.disconnect()">Disconnect</button>
    <button v-else type="button" class="h-12 w-full rounded-xl bg-radio-amber text-[15px] font-bold text-radio-amber-ink disabled:opacity-50 sm:hidden" :disabled="!store.configured" @click="radio.connect()">
      Connect
    </button>
  </template>
  <RegisterHotspotDialog :open="registering" @close="registering = false" @connect="registered" />
</template>
