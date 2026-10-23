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
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';

import { hotspotError } from '@/lib/hotspots';
import { hubOrigin } from '@/radio/discover';
import { useAccount } from '@/store/account';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

import HotspotList from './HotspotList.vue';
import ManualHotspotDialog from './ManualHotspotDialog.vue';
import RegisterHotspotDialog from './RegisterHotspotDialog.vue';

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const account = useAccount();
const store = useSettings();
const radio = useRadio();

const selected = ref(0);
const callsign = ref(account.user?.callsign ?? store.settings.hotspot.callsign);
const password = ref('');
const show = ref(false);
const registering = ref(false);
const manual = ref(false);
const handId = ref('');
const handPassword = ref('');
const failure = ref('');
const loading = ref(false);

const hubName = computed(() => {
  try {
    return hubOrigin(account.host).host;
  } catch {
    return account.host;
  }
});
const radioId = computed(() => account.user?.id ?? 0);
const savedPassword = computed(() => account.saved[String(selected.value)]?.password ?? '');
const handError = computed(() => (handId.value ? hotspotError(handId.value, radioId.value) : ''));
const handOpen = computed(() => props.compact && manual.value);

async function refresh(): Promise<void> {
  loading.value = true;
  failure.value = '';
  try {
    await account.loadHotspots();
  } catch (err) {
    failure.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
  if (!selected.value) {
    selected.value = account.hotspots.find((h) => account.saved[String(h.id)]?.password)?.id ?? account.hotspots[0]?.id ?? 0;
  }
}

onMounted(refresh);

watch(selected, () => {
  password.value = '';
  if (props.compact && selected.value) {
    manual.value = false;
  }
});

const canConnect = computed(() => {
  if (handOpen.value) {
    return handId.value !== '' && !handError.value && handPassword.value !== '';
  }
  return selected.value !== 0 && (savedPassword.value !== '' || password.value !== '');
});

async function use(id: number, pw: string, save: boolean): Promise<void> {
  if (save) {
    await account.saveHotspot(id, { password: pw, name: account.saved[String(id)]?.name ?? '' });
  }
  await account.choose(id, pw, callsign.value || account.user?.callsign || '');
  radio.connect();
}

async function connect(): Promise<void> {
  if (!canConnect.value) {
    return;
  }
  if (handOpen.value) {
    await use(Number(handId.value), handPassword.value, true);
    return;
  }
  await use(selected.value, savedPassword.value || password.value, true);
}

async function registered(id: number, pw: string): Promise<void> {
  registering.value = false;
  selected.value = id;
  await use(id, pw, false);
}

async function useManual(id: number, pw: string, save: boolean): Promise<void> {
  manual.value = false;
  await use(id, pw, save);
}

const inputClass = 'h-11 w-full rounded-[10px] border border-radio-line bg-radio-page px-3 text-[15px] text-radio-text outline-none focus-visible:border-radio-amber';
</script>

<template>
  <section
    aria-label="Choose a hotspot"
    class="flex flex-col"
    :class="compact ? 'grow gap-3.5' : 'w-[620px] gap-6 rounded-[20px] border border-radio-line bg-radio-surface p-8'"
  >
    <div class="flex flex-col" :class="compact ? 'gap-1' : 'gap-1.5'">
      <span v-if="!compact" class="flex items-center gap-1.5 text-[13px] text-radio-green"><span class="size-2 rounded-full bg-radio-green" />Logged in to {{ hubName }}</span>
      <h1 class="m-0 font-bold" :class="compact ? 'text-2xl' : 'text-[26px]'">Welcome, {{ account.user?.callsign }}</h1>
      <p class="m-0 text-sm text-radio-text/80">
        {{ compact ? 'Choose a hotspot for this phone.' : 'Choose a hotspot for this browser. dmr-web joins the hub as that hotspot.' }}
      </p>
    </div>

    <fieldset class="m-0 flex flex-col gap-2.5 border-none p-0">
      <legend v-if="!compact" class="mb-2.5 p-0 text-[13px] font-semibold text-radio-text/80">Your hotspots on {{ hubName }}</legend>
      <legend v-else class="sr-only">Your hotspots</legend>
      <p v-if="loading && !account.hotspots.length" class="m-0 text-sm text-radio-muted">Loading your hotspots</p>
      <p v-else-if="failure" role="alert" class="m-0 text-sm text-radio-red">
        {{ failure }} <button type="button" class="text-radio-accent underline" @click="refresh">Try again</button>
      </p>
      <p v-else-if="account.hotspotsLoaded && !account.hotspots.length" class="m-0 text-sm text-radio-muted">No hotspots yet. Register one for this {{ compact ? 'phone' : 'browser' }}.</p>
      <HotspotList v-model="selected" :compact="compact" badge />
      <label v-if="selected && !savedPassword && !handOpen" class="flex flex-col gap-1.5 text-[13px] font-semibold text-radio-text/80">
        Hotspot password
        <input v-model="password" type="password" autocomplete="current-password" :class="inputClass" />
        <span class="text-xs font-normal text-radio-muted">The password DMRHub showed when {{ selected }} was registered. Saved on this device.</span>
      </label>
      <div v-if="!compact" class="flex gap-2.5">
        <button type="button" class="h-11 rounded-[10px] border border-radio-line px-4 text-sm" @click="registering = true">Register a new hotspot</button>
        <button type="button" class="h-11 px-3.5 text-sm text-radio-accent" @click="manual = true">Enter ID and password by hand</button>
      </div>
      <button v-else type="button" class="h-11 rounded-[10px] border border-radio-line text-sm" @click="registering = true">Register a new hotspot</button>
    </fieldset>

    <section
      v-if="compact"
      aria-label="Enter hotspot by hand"
      class="flex flex-col gap-2.5 rounded-2xl border bg-radio-surface p-3.5"
      :class="manual ? 'border-radio-amber' : 'border-radio-line'"
    >
      <button type="button" class="flex items-center justify-between text-left" :aria-expanded="manual" @click="manual = !manual">
        <h2 class="m-0 text-[15px] font-semibold">Enter ID and password by hand</h2>
        <ChevronUp v-if="manual" class="size-[18px] text-radio-accent" />
        <ChevronDown v-else class="size-[18px] text-radio-muted" />
      </button>
      <template v-if="manual">
        <label for="hand-id" class="text-xs text-radio-muted">Hotspot ID</label>
        <input id="hand-id" v-model.trim="handId" inputmode="numeric" :aria-invalid="!!handError" :class="[inputClass, 'font-mono', handError ? 'border-radio-red' : '']" />
        <span v-if="handError" class="text-[11px] text-radio-red">{{ handError }}</span>
        <label for="hand-pw" class="text-xs text-radio-muted">Hotspot password</label>
        <div class="flex gap-2">
          <input id="hand-pw" v-model="handPassword" :type="show ? 'text' : 'password'" autocomplete="current-password" :class="[inputClass, 'min-w-0 grow']" />
          <button
            type="button"
            :aria-label="show ? 'Hide password' : 'Show password'"
            class="flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-radio-line text-radio-text/80"
            @click="show = !show"
          >
            <EyeOff v-if="show" class="size-5" />
            <Eye v-else class="size-5" />
          </button>
        </div>
        <span class="text-[11px] text-radio-muted">Shown on {{ hubName }} when the hotspot was registered.</span>
        <label for="hand-call" class="text-xs text-radio-muted">Callsign</label>
        <input id="hand-call" v-model.trim="callsign" :class="[inputClass, 'font-mono uppercase']" />
      </template>
    </section>

    <div v-if="!compact" class="flex flex-col gap-1.5">
      <label for="pick-call" class="text-[13px] font-semibold text-radio-text/80">Callsign</label>
      <input id="pick-call" v-model.trim="callsign" :class="[inputClass, 'font-mono uppercase']" />
      <span class="text-xs text-radio-muted">From your DMRHub account. Sent in the hotspot login.</span>
    </div>

    <button
      type="button"
      class="h-[52px] rounded-xl bg-radio-amber text-base font-bold text-radio-amber-ink disabled:opacity-50"
      :class="compact ? 'mt-auto' : ''"
      :disabled="!canConnect || radio.link === 'connecting'"
      @click="connect"
    >
      {{ radio.link === 'connecting' ? 'Connecting' : 'Connect' }}
    </button>
  </section>
  <RegisterHotspotDialog :open="registering" @close="registering = false" @connect="registered" />
  <ManualHotspotDialog v-if="!compact" :open="manual" :radio-id="radioId" @close="manual = false" @use="useManual" />
</template>
