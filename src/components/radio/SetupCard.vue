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
import { Eye, EyeOff } from 'lucide-vue-next';
import { computed, ref } from 'vue';

import { useRadio } from '@/store/radio';
import { useSettings, validHotspot } from '@/store/settings';

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const store = useSettings();
const radio = useRadio();

const host = ref(store.settings.hub.host);
const hotspot = ref(store.settings.hotspot.id ? String(store.settings.hotspot.id) : '');
const password = ref(store.settings.hotspot.password);
const callsign = ref(store.settings.hotspot.callsign);
const show = ref(false);
const touched = ref(false);

const idValid = computed(() => /^\d+$/.test(hotspot.value) && validHotspot(Number(hotspot.value)));
const canConnect = computed(() => idValid.value && password.value !== '' && host.value.trim() !== '');

function connect(): void {
  touched.value = true;
  if (!canConnect.value) {
    return;
  }
  const s = store.settings;
  s.hub.host = host.value.trim();
  s.hotspot.id = Number(hotspot.value);
  s.hotspot.password = password.value;
  s.hotspot.callsign = callsign.value.trim().toUpperCase();
  radio.connect();
}

const inputClass =
  'h-11 w-full rounded-[10px] border border-radio-line bg-radio-page px-3 text-[15px] text-radio-text outline-none focus-visible:border-radio-amber';
void props;
</script>

<template>
  <section class="flex flex-col gap-4 rounded-[20px] border border-radio-line bg-radio-surface" :class="compact ? 'gap-3 rounded-[14px] p-4' : 'p-6'">
    <div class="flex flex-col gap-2">
      <h1 class="m-0 font-bold leading-tight" :class="compact ? 'text-lg' : 'text-2xl'">Your browser is a DMR radio</h1>
      <p class="m-0 text-sm leading-relaxed text-radio-text/80">
        Talk on DMR talkgroups and hear who's on the air. Nothing to install. Use a hotspot that you registered on your DMRHub account.
      </p>
    </div>
    <form class="flex flex-col gap-3" @submit.prevent="connect">
      <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
        Hub
        <input v-model="host" :class="inputClass" autocomplete="url" />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
          Hotspot ID
          <input
            v-model="hotspot"
            :class="[inputClass, 'font-mono', touched && !idValid ? 'border-radio-red' : '']"
            inputmode="numeric"
            autocomplete="username"
            :aria-invalid="touched && !idValid"
          />
        </label>
        <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
          Callsign
          <input v-model="callsign" :class="[inputClass, 'font-mono uppercase']" autocomplete="off" />
        </label>
      </div>
      <p v-if="touched && !idValid" class="m-0 text-xs text-radio-red">Hotspot IDs are 7 or 9 digits and start with your radio ID.</p>
      <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
        Hotspot password
        <span class="relative">
          <input v-model="password" :type="show ? 'text' : 'password'" :class="[inputClass, 'pr-12']" autocomplete="current-password" />
          <button
            type="button"
            :aria-label="show ? 'Hide password' : 'Show password'"
            class="absolute right-0 top-0 flex size-11 items-center justify-center text-radio-muted"
            @click="show = !show"
          >
            <EyeOff v-if="show" class="size-4" />
            <Eye v-else class="size-4" />
          </button>
        </span>
      </label>
      <button
        type="submit"
        class="h-[52px] rounded-xl bg-radio-amber text-base font-bold text-radio-amber-ink disabled:opacity-50"
        :disabled="!radio.supported || radio.link === 'connecting'"
      >
        {{ radio.link === 'connecting' ? 'Connecting' : 'Connect' }}
      </button>
      <span class="text-[13px] text-radio-muted">
        No hotspot yet? Register one on <a :href="`https://${host || 'dmrhub.net'}`" target="_blank" rel="noopener">your hub</a>. It shows the password once.
      </span>
    </form>
  </section>
</template>
