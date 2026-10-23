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
import { useEventListener, useMediaQuery, useWakeLock } from '@vueuse/core';
import { computed, watch } from 'vue';

import AppNav from '@/components/AppNav.vue';
import LastHeard from '@/components/radio/LastHeard.vue';
import OnAir from '@/components/radio/OnAir.vue';
import LinkNotice from '@/components/radio/LinkNotice.vue';
import MicDialogs from '@/components/radio/MicDialogs.vue';
import RadioPanel from '@/components/radio/RadioPanel.vue';
import SetupCard from '@/components/radio/SetupCard.vue';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

const radio = useRadio();
const store = useSettings();
const desktop = useMediaQuery('(min-width: 1024px)');
const wake = useWakeLock();

const showSetup = computed(() => !store.configured || radio.link === 'idle');
const showFailure = computed(() => !radio.supported || radio.link === 'failed');

watch(
  () => radio.connected && store.settings.display.keepScreenOn,
  (on) => {
    if (on && wake.isSupported.value) {
      wake.request('screen').catch(() => undefined);
    } else if (wake.isActive.value) {
      wake.release().catch(() => undefined);
    }
  },
  { immediate: true },
);

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
}

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.code !== store.settings.audio.pttKey || e.repeat || typing(e) || !radio.connected) {
    return;
  }
  e.preventDefault();
  if (store.settings.audio.pttMode === 'toggle' && radio.tx.active) {
    radio.pttUp();
  } else {
    void radio.pttDown();
  }
});

useEventListener(window, 'keyup', (e: KeyboardEvent) => {
  if (e.code !== store.settings.audio.pttKey || typing(e)) {
    return;
  }
  if (store.settings.audio.pttMode === 'hold' && radio.tx.active) {
    e.preventDefault();
    radio.pttUp();
  }
});

function onLogin(): void {
  if (store.configured) {
    radio.connect();
  }
}
</script>

<template>
  <main v-if="showFailure" class="flex grow flex-col" :class="desktop ? 'p-8 pt-16' : 'gap-3 px-4 pt-3 pb-4'">
    <LinkNotice mode="failed" :compact="!desktop" />
  </main>
  <main v-else-if="desktop" class="flex grow gap-8 p-8">
    <RadioPanel class="w-[780px] shrink-0" @login="onLogin" />
    <aside class="flex min-w-0 grow flex-col gap-4">
      <SetupCard v-if="showSetup" />
      <OnAir v-if="showSetup && !radio.heard.length" :host="store.settings.hub.host" />
      <section v-if="!showSetup || radio.heard.length" class="grow rounded-[20px] border border-radio-line bg-radio-surface p-[22px]">
        <LastHeard :entries="radio.heard" :limit="12" />
      </section>
    </aside>
  </main>
  <main v-else class="flex grow flex-col gap-3 px-4 pb-4">
    <RadioPanel compact class="grow" @login="onLogin">
      <template #middle>
        <SetupCard v-if="showSetup" compact />
        <div v-else class="rounded-[14px] border border-radio-line bg-radio-surface px-3.5 py-1">
          <LastHeard :entries="radio.heard" :limit="3" compact />
        </div>
      </template>
    </RadioPanel>
  </main>
  <LinkNotice v-if="radio.link === 'reconnecting'" mode="reconnecting" :compact="!desktop" />
  <AppNav v-if="!desktop && store.configured && !showFailure" bar />
  <MicDialogs />
</template>
