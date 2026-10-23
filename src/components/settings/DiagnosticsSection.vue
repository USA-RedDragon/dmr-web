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
import { useMediaQuery } from '@vueuse/core';
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { toast } from '@/components/ui/toast';
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

const url = computed(() => radio.endpoint || '-');
const desktop = useMediaQuery('(min-width: 1024px)');
const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';
const tiles = computed(() => [
  { label: 'Round trip', value: radio.stats.roundTripMs ? `${Math.round(radio.stats.roundTripMs)} ms` : '-' },
  { label: 'Datagrams lost', value: radio.stats.bursts ? `${((100 * radio.stats.lost) / (radio.stats.bursts + radio.stats.lost)).toFixed(1)}%` : '-' },
  { label: 'Jitter buffer', value: `${store.settings.jitterMs} ms` },
  { label: 'Late bursts', value: String(radio.stats.late) },
]);
const ambeText = computed(() =>
  radio.ambe.status === 'loaded' ? `Module loaded, ABI ${radio.ambe.version}, ${radio.stats.codecs} codecs open` : radio.ambe.status === 'none' ? 'No module' : radio.ambe.status,
);

function stamp(at: number): string {
  return `${format(at, desktop.value ? 'HH:mm:ss' : 'HH:mm')} ${zone}`;
}
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
    `round trip: ${radio.stats.roundTripMs} ms, bursts ${radio.stats.bursts}, lost ${radio.stats.lost}, late ${radio.stats.late}`,
    '',
    ...radio.log.map((l) => `${format(l.at, 'HH:mm:ss')} ${zone} ${l.text}`),
  ];
  await navigator.clipboard.writeText(lines.join('\n'));
  toast.success('Diagnostics copied');
}
</script>

<template>
  <div class="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
    <div v-for="t in tiles" :key="t.label" class="flex flex-col gap-1.5 rounded-[14px] border border-radio-line bg-radio-surface px-3.5 py-3 lg:px-4 lg:py-3.5">
      <span class="text-xs text-radio-text/80">{{ t.label }}</span>
      <span class="font-mono text-xl font-semibold">{{ t.value }}</span>
    </div>
  </div>

  <div v-if="desktop" class="grid gap-4 lg:grid-cols-2">
    <SettingsCard title="Session">
      <dl class="m-0 grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <dt class="text-radio-muted">Login</dt>
        <dd class="m-0" :class="radio.connected ? 'text-radio-green' : ''">{{ radio.connected ? 'Running' : radio.link }}</dd>
        <dt class="text-radio-muted">Transport</dt>
        <dd class="m-0">WebTransport datagrams</dd>
        <dt class="text-radio-muted">Endpoint</dt>
        <dd class="m-0 truncate font-mono text-xs">{{ url }}</dd>
        <dt class="text-radio-muted">Up for</dt>
        <dd class="m-0">{{ up }}</dd>
      </dl>
    </SettingsCard>
    <SettingsCard title="Vocoders">
      <dl class="m-0 grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
        <dt class="text-radio-muted">AMBE</dt>
        <dd class="m-0">{{ ambeText }}</dd>
        <dt class="text-radio-muted">Codec2</dt>
        <dd class="m-0">dmrgo, browser WebAssembly</dd>
        <dt class="text-radio-muted">Frame errors</dt>
        <dd class="m-0">{{ radio.stats.frameErrors }}</dd>
        <dt class="text-radio-muted">Concealed</dt>
        <dd class="m-0">{{ radio.stats.concealed }} frames</dd>
      </dl>
    </SettingsCard>
  </div>

  <RouterLink
    to="/settings/diagnostics/data"
    class="flex items-center justify-between gap-4 rounded-2xl border border-radio-line bg-radio-surface p-4 text-radio-text no-underline sm:px-[22px] sm:py-[18px]"
  >
    <span class="flex flex-col gap-1">
      <span class="text-[15px] font-semibold">Data console</span>
      <span class="text-xs text-radio-muted">Every data packet in and out, and raw data to send.</span>
    </span>
    <span class="text-radio-accent" aria-hidden="true">&rsaquo;</span>
  </RouterLink>

  <SettingsCard title="Event log">
    <template #action>
      <button type="button" :class="[secondaryButton, 'h-10']" @click="copy">{{ desktop ? 'Copy diagnostics' : 'Copy' }}</button>
    </template>
    <div class="max-h-[360px] min-h-40 overflow-y-auto font-mono text-xs leading-[1.8] text-radio-text/80">
      <p v-if="radio.log.length === 0" class="m-0 text-radio-muted">Nothing yet.</p>
      <div v-for="(l, i) in radio.log" :key="i">
        <span class="text-radio-muted">{{ stamp(l.at) }}</span>&nbsp;{{ l.text }}
      </div>
    </div>
  </SettingsCard>

  <SettingsCard v-if="!standalone && (install || safari)">
    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-col gap-1">
        <span class="text-[15px] font-semibold">{{ desktop ? 'Install dmr-web' : 'Add to Home Screen' }}</span>
        <span class="text-xs text-radio-muted">
          {{
            install
              ? desktop
                ? 'Its own window and Dock or taskbar icon, starts without a network.'
                : 'Opens full screen, starts offline.'
              : 'In Safari, use Share, then Add to Home Screen or Add to Dock.'
          }}
        </span>
      </div>
      <button v-if="install" type="button" :class="primaryButton" @click="doInstall">Install</button>
    </div>
  </SettingsCard>
</template>
