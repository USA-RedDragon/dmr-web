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
import { computed, ref } from 'vue';

import OnAir from '@/components/radio/OnAir.vue';
import { hubOrigin } from '@/radio/discover';
import { useAccount } from '@/store/account';
import { useSettings } from '@/store/settings';

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const store = useSettings();
const account = useAccount();

const host = ref(store.settings.hub.host);
const busy = ref(false);
const failure = ref('');

const hubLink = computed(() => {
  try {
    return hubOrigin(host.value || 'dmrhub.net').origin;
  } catch {
    return 'https://dmrhub.net';
  }
});
const hubName = computed(() => new URL(hubLink.value).host);

async function login(): Promise<void> {
  const h = host.value.trim();
  if (!h) {
    return;
  }
  store.settings.hub.host = h;
  busy.value = true;
  failure.value = '';
  try {
    await account.login(h);
  } catch (err) {
    failure.value = err instanceof Error ? err.message : String(err);
    busy.value = false;
  }
}

defineExpose({ login });

const inputClass =
  'h-11 w-full rounded-[10px] border border-radio-line bg-radio-page px-3 text-[15px] text-radio-text outline-none focus-visible:border-radio-amber';
</script>

<template>
  <section v-if="compact" class="flex flex-col gap-2.5 rounded-[14px] border border-radio-line bg-radio-surface p-3.5">
    <h1 class="m-0 text-lg font-bold">Your phone is a DMR radio</h1>
    <p class="m-0 text-[13px] leading-normal text-radio-text/80">Talk on talkgroups, text any DMR radio and see who's on the air. Nothing to install.</p>
    <OnAir :host="store.settings.hub.host" compact />
  </section>
  <section v-else class="flex flex-col gap-4 rounded-[20px] border border-radio-line bg-radio-surface p-6">
    <div class="flex flex-col gap-2">
      <h1 class="m-0 text-2xl font-bold leading-tight">Your browser is a DMR radio</h1>
      <p class="m-0 text-sm leading-relaxed text-radio-text/80">Talk on DMR talkgroups, send texts to any DMR radio, and see who's on the air. Nothing to install.</p>
    </div>
    <form class="flex flex-col gap-4" @submit.prevent="login">
      <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
        Hub
        <input v-model="host" :class="inputClass" autocomplete="url" />
      </label>
      <p v-if="failure || account.error" role="alert" class="m-0 text-xs text-radio-red">{{ failure || account.error }}</p>
      <button
        type="submit"
        class="h-[52px] rounded-xl bg-radio-amber text-base font-bold text-radio-amber-ink disabled:opacity-50"
        :disabled="busy || !host.trim()"
      >
        {{ busy ? `Opening ${hubName}` : 'Log in with DMRHub' }}
      </button>
      <span class="text-[13px] text-radio-muted">
        No account? <a :href="`${hubLink}/register`" target="_blank" rel="noopener">Sign up on {{ hubName }}</a>. You need an amateur radio license and a DMR ID.
      </span>
    </form>
  </section>
</template>
