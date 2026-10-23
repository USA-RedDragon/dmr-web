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

import { toast } from '@/components/ui/toast';
import { useColorMode } from '@/composables/useColorMode';
import { describeChanges, exportBackup, openBackup, readBackup, type BackupContent, type BackupFile, type Change } from '@/lib/backup';
import { useRadio } from '@/store/radio';
import { useSettings, type Settings } from '@/store/settings';

import { inputClass, labelClass, primaryButton, secondaryButton } from './fields';
import SettingsCard from './SettingsCard.vue';

const store = useSettings();
const radio = useRadio();
const { mode, setMode } = useColorMode();

const protect = ref(true);
const pass1 = ref('');
const pass2 = ref('');
const exporting = ref(false);

const fileName = ref('');
const loadedFile = ref<BackupFile | null>(null);
const importPass = ref('');
const preview = ref<{ content: BackupContent; changes: Change[] } | null>(null);
const importError = ref('');

const passOK = computed(() => !protect.value || (pass1.value.length >= 8 && pass1.value === pass2.value));
const today = new Date().toISOString().slice(0, 10);

async function doExport(): Promise<void> {
  exporting.value = true;
  try {
    const text = await exportBackup(
      { settings: structuredClone(JSON.parse(JSON.stringify(store.settings))) as Settings, theme: mode.value },
      protect.value ? pass1.value : null,
    );
    const name = `dmr-web-settings-${today}.dmrweb`;
    const file = new File([text], name, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad/.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: 'dmr-web settings' });
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    }
  } finally {
    exporting.value = false;
  }
}

async function choose(e: Event): Promise<void> {
  importError.value = '';
  preview.value = null;
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) {
    return;
  }
  fileName.value = f.name;
  try {
    loadedFile.value = readBackup(await f.text());
    if (!loadedFile.value.encrypted) {
      await unlock();
    }
  } catch (err) {
    loadedFile.value = null;
    importError.value = err instanceof Error ? err.message : String(err);
  }
}

async function unlock(): Promise<void> {
  if (!loadedFile.value) {
    return;
  }
  importError.value = '';
  try {
    const content = await openBackup(loadedFile.value, importPass.value);
    preview.value = { content, changes: describeChanges(store.settings, content.settings, { from: mode.value, to: content.theme }) };
  } catch (err) {
    importError.value = err instanceof Error ? err.message : String(err);
  }
}

function apply(): void {
  if (!preview.value) {
    return;
  }
  const wasLinked = radio.link !== 'idle';
  radio.disconnect();
  store.replace(preview.value.content.settings);
  const t = preview.value.content.theme;
  if (t === 'light' || t === 'dark' || t === 'system') {
    setMode(t);
  }
  preview.value = null;
  loadedFile.value = null;
  fileName.value = '';
  importPass.value = '';
  toast.success('Settings imported');
  if (wasLinked && store.configured) {
    radio.connect();
  }
}
</script>

<template>
  <div class="grid items-start gap-5 xl:grid-cols-2">
    <SettingsCard title="Export settings" description="Save your settings to a file, then import it in dmr-web on another browser or device.">
      <ul class="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
        <li>Hub and hotspot, with the hotspot password</li>
        <li>Callsign</li>
        <li>Talkgroup lists for TS1 and TS2</li>
        <li>Vocoder, audio and display settings</li>
      </ul>
      <div class="flex flex-col gap-1.5 rounded-xl border border-radio-line bg-radio-raised px-3.5 py-3 text-[13px]">
        <span class="text-xs text-radio-muted">Not included</span>
        <span>AMBE module. Upload it again on the new device.</span>
      </div>
      <label class="flex min-h-11 items-center justify-between text-sm">
        Protect with a passphrase
        <input v-model="protect" type="checkbox" class="size-5 accent-radio-amber" />
      </label>
      <div v-if="protect" class="grid gap-2.5 sm:grid-cols-2">
        <label :class="labelClass">Passphrase<input v-model="pass1" type="password" :class="inputClass" autocomplete="new-password" /></label>
        <label :class="labelClass">Repeat it<input v-model="pass2" type="password" :class="inputClass" autocomplete="new-password" /></label>
      </div>
      <span class="text-xs text-radio-muted">
        {{ protect ? 'At least 8 characters.' : '' }} The file holds your hotspot password. Without a passphrase anyone with the file could use your hotspot.
      </span>
      <button type="button" :class="[primaryButton, 'h-12']" :disabled="!passOK || exporting" @click="doExport">Export</button>
      <span class="font-mono text-xs text-radio-muted">dmr-web-settings-{{ today }}.dmrweb</span>
    </SettingsCard>

    <SettingsCard title="Import settings" description="Replaces the settings in this browser with the ones in the file.">
      <label :class="[secondaryButton, 'flex cursor-pointer items-center justify-center']">
        {{ fileName || 'Choose a .dmrweb file' }}
        <input type="file" accept=".dmrweb,application/json" class="sr-only" @change="choose" />
      </label>
      <template v-if="loadedFile?.encrypted && !preview">
        <label :class="labelClass">Passphrase<input v-model="importPass" type="password" :class="inputClass" autocomplete="off" @keydown.enter="unlock" /></label>
        <button type="button" :class="primaryButton" :disabled="!importPass" @click="unlock">Unlock</button>
      </template>
      <p v-if="importError" class="m-0 text-sm text-radio-red">{{ importError }}</p>
      <template v-if="preview">
        <span class="text-xs text-radio-muted">What changes</span>
        <dl v-if="preview.changes.length" class="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border border-radio-line bg-radio-raised px-3.5 py-3 text-[13px]">
          <template v-for="c in preview.changes" :key="c.label">
            <dt class="text-radio-muted">{{ c.label }}</dt>
            <dd class="m-0">{{ c.to }} replaces {{ c.from }}</dd>
          </template>
        </dl>
        <p v-else class="m-0 text-sm">Nothing changes.</p>
        <span class="text-xs text-radio-muted">The radio disconnects and logs in again with the imported hotspot.</span>
        <div class="grid grid-cols-2 gap-2.5">
          <button type="button" :class="[primaryButton, 'h-12']" @click="apply">Import and replace</button>
          <button type="button" :class="[secondaryButton, 'h-12']" @click="preview = null">Cancel</button>
        </div>
      </template>
    </SettingsCard>
  </div>
</template>
