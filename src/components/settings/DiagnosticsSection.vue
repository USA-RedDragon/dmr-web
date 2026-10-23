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
import { format, formatDistanceToNowStrict } from 'date-fns';
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { toast } from '@/components/ui/toast';
import { endpointURL } from '@/radio/transport';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

import { primaryButton, secondaryButton } from './fields';
import SettingsCard from './SettingsCard.vue';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const radio = useRadio();
const store = useSettings();
const install = ref<InstallPrompt | null>(null);
const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const standalone = window.matchMedia('(display-mode: standalone)').matches;

function onPrompt(e: Event): void {
  e.preventDefault();
  install.value = e as InstallPrompt;
}

onMounted(() => window.addEventListener('beforeinstallprompt', onPrompt));
onUnmounted(() => window.removeEventListener('beforeinstallprompt', onPrompt));

async function doInstall(): Promise<void> {
  if (install.value) {
    await install.value.prompt();
    install.value = null;
  }
}

const url = computed(() => endpointURL(store.settings.hub.host, store.settings.hub.port, store.settings.hub.path));
const up = computed(() => (radio.connected && radio.upSince ? formatDistanceToNowStrict(radio.upSince) : '-'));

async function copy(): Promise<void> {
  const lines = [
    `dmr-web diagnostics ${new Date().toISOString()}`,
    `link: ${radio.link} ${radio.linkDetail}`,
    `endpoint: ${url.value}`,
    `hotspot: ${store.settings.hotspot.id}`,
    `transmit vocoder: ${radio.transmitVocoder}`,
    `ambe: ${radio.ambe.status} ${radio.ambe.sha256}`,
    `user agent: ${navigator.userAgent}`,
    '',
    ...radio.log.map((l) => `${format(l.at, 'HH:mm:ss')} ${l.text}`),
  ];
  await navigator.clipboard.writeText(lines.join('\n'));
  toast.success('Diagnostics copied');
}
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <SettingsCard title="Session">
      <dl class="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <dt class="text-radio-muted">Link</dt>
        <dd class="m-0" :class="radio.connected ? 'text-radio-green' : ''">{{ radio.link }}</dd>
        <dt class="text-radio-muted">Transport</dt>
        <dd class="m-0">WebTransport datagrams</dd>
        <dt class="text-radio-muted">Endpoint</dt>
        <dd class="m-0 truncate font-mono text-xs">{{ url }}</dd>
        <dt class="text-radio-muted">Up for</dt>
        <dd class="m-0">{{ up }}</dd>
      </dl>
    </SettingsCard>
    <SettingsCard title="Vocoders">
      <dl class="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <dt class="text-radio-muted">AMBE</dt>
        <dd class="m-0">{{ radio.ambe.status === 'loaded' ? `Module loaded, ABI ${radio.ambe.version}` : radio.ambe.status }}</dd>
        <dt class="text-radio-muted">Codec2</dt>
        <dd class="m-0">dmrgo, browser WebAssembly</dd>
        <dt class="text-radio-muted">Transmit</dt>
        <dd class="m-0">{{ radio.transmitVocoder }}</dd>
      </dl>
    </SettingsCard>
  </div>

  <SettingsCard title="Event log">
    <template #action>
      <button type="button" :class="[secondaryButton, 'h-10']" @click="copy">Copy diagnostics</button>
    </template>
    <div class="max-h-[360px] overflow-y-auto font-mono text-xs leading-[1.8] text-radio-text/80">
      <p v-if="radio.log.length === 0" class="m-0 text-radio-muted">Nothing yet.</p>
      <div v-for="(l, i) in radio.log" :key="i">
        <span class="text-radio-muted">{{ format(l.at, 'HH:mm:ss') }}</span>&nbsp;&nbsp;{{ l.text }}
      </div>
    </div>
  </SettingsCard>

  <SettingsCard v-if="!standalone && (install || safari)">
    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-col gap-1">
        <span class="text-sm font-semibold">Install dmr-web</span>
        <span class="text-xs text-radio-muted">
          {{ install ? 'Its own window and icon, starts without a network.' : 'In Safari, use Share, then Add to Home Screen or Add to Dock.' }}
        </span>
      </div>
      <button v-if="install" type="button" :class="primaryButton" @click="doInstall">Install</button>
    </div>
  </SettingsCard>
</template>
