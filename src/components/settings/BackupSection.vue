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
import { useMediaQuery } from '@vueuse/core';
import { format } from 'date-fns';
import { computed, ref } from 'vue';

import { toast } from '@/components/ui/toast';
import { useColorMode } from '@/composables/useColorMode';
import {
  applyParts,
  describeChanges,
  exportBackup,
  mergeContacts,
  openBackup,
  pickParts,
  readBackup,
  type BackupContent,
  type BackupFile,
  type BackupPart,
  type Change,
} from '@/lib/backup';
import { useContacts } from '@/store/contacts';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

import { inputClass, labelClass, primaryButton, secondaryButton } from './fields';
import SettingsCard from './SettingsCard.vue';
import ToggleSwitch from './ToggleSwitch.vue';

const store = useSettings();
const radio = useRadio();
const contacts = useContacts();
const { mode, setMode } = useColorMode();
const desktop = useMediaQuery('(min-width: 1024px)');

const tab = ref<'export' | 'import'>('export');
const parts = ref<BackupPart[]>(['hotspot', 'identity', 'talkgroups', 'contacts', 'preferences']);
const protect = ref(true);
const pass1 = ref('');
const pass2 = ref('');
const exporting = ref(false);

const fileName = ref('');
const loadedFile = ref<BackupFile | null>(null);
const importPass = ref('');
const preview = ref<{ content: BackupContent; changes: Change[] } | null>(null);
const importError = ref('');
const picker = ref<HTMLInputElement | null>(null);

const partLabels = computed<{ value: BackupPart; label: string }[]>(() => [
  { value: 'hotspot', label: desktop.value ? 'Hub and hotspot, with the hotspot password' : 'Hub and hotspot, with password' },
  { value: 'identity', label: 'Callsign and location' },
  { value: 'talkgroups', label: desktop.value ? 'Talkgroup lists for TS1 and TS2' : 'Talkgroup lists' },
  { value: 'contacts', label: desktop.value ? 'Contacts, with their names and notes' : 'Contacts' },
  { value: 'preferences', label: desktop.value ? 'Vocoder, audio and display settings' : 'Vocoder, audio and display' },
]);

const passOK = computed(() => !protect.value || (pass1.value.length >= 8 && (!desktop.value || pass1.value === pass2.value)));
const today = format(new Date(), 'yyyy-MM-dd');
const exportName = `dmr-web-settings-${today}.dmrweb`;
const exportedAt = computed(() => (loadedFile.value ? format(new Date(loadedFile.value.exportedAt), 'yyyy-MM-dd HH:mm') : ''));

async function doExport(): Promise<void> {
  exporting.value = true;
  try {
    const text = await exportBackup(pickParts(store.settings, mode.value, parts.value, contacts.contacts), protect.value ? pass1.value : null);
    const file = new File([text], exportName, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (!desktop.value && nav.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'dmr-web settings' }).catch(() => undefined);
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportName;
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
  importPass.value = '';
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
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
    preview.value = { content, changes: describeChanges(
        store.settings,
        content.settings,
        { from: mode.value, to: content.theme },
        content.contacts ? { from: contacts.contacts.length, to: mergeContacts(contacts.contacts, content.contacts).length } : undefined,
      ),
    };
  } catch (err) {
    importError.value = err instanceof Error ? err.message : String(err);
  }
}

function cancel(): void {
  preview.value = null;
  loadedFile.value = null;
  fileName.value = '';
  importPass.value = '';
  importError.value = '';
}

function apply(): void {
  if (!preview.value) {
    return;
  }
  const wasLinked = radio.link !== 'idle';
  radio.disconnect();
  store.replace(applyParts(store.settings, preview.value.content.settings));
  if (preview.value.content.contacts) {
    contacts.replaceAll(mergeContacts(contacts.contacts, preview.value.content.contacts));
  }
  const t = preview.value.content.theme;
  if (t === 'light' || t === 'dark' || t === 'system') {
    setMode(t);
  }
  cancel();
  toast.success('Settings imported');
  if (wasLinked && store.configured) {
    radio.connect();
  }
}
</script>

<template>
  <div v-if="!desktop" role="tablist" aria-label="Backup" class="grid grid-cols-2 gap-1 rounded-xl border border-radio-line bg-radio-page p-1">
    <button
      v-for="t in ['export', 'import'] as const"
      :key="t"
      type="button"
      role="tab"
      :aria-selected="tab === t"
      class="h-11 rounded-[9px] text-sm font-semibold"
      :class="tab === t ? 'bg-radio-raised text-radio-accent' : 'text-radio-text/80'"
      @click="tab = t"
    >
      {{ t === 'export' ? 'Export' : 'Import' }}
    </button>
  </div>

  <div class="grid items-start gap-5 lg:grid-cols-2">
    <template v-if="desktop || tab === 'export'">
      <SettingsCard v-if="desktop" title="Export settings" description="Save your settings to a file, then import it in dmr-web on another browser or device.">
        <span class="text-xs text-radio-muted">Included</span>
        <div class="flex flex-col">
          <label v-for="p in partLabels" :key="p.value" class="flex min-h-[42px] items-center gap-3 text-[15px]">
            <input v-model="parts" type="checkbox" :value="p.value" class="size-5 accent-radio-amber" />{{ p.label }}
          </label>
        </div>
        <div class="flex flex-col gap-1 rounded-xl border border-radio-line bg-radio-raised px-3.5 py-3 text-[13px]">
          <span class="text-xs text-radio-muted">Not included</span>
          <span>AMBE module. Upload it again on the new device.</span>
          <span>DMRHub login. Log in again on the new device.</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[15px]">Protect with a passphrase</span>
          <ToggleSwitch v-model="protect" label="Protect with a passphrase" />
        </div>
        <div v-if="protect" class="grid grid-cols-2 gap-2.5">
          <label :class="labelClass">Passphrase<input v-model="pass1" type="password" :class="inputClass" autocomplete="new-password" /></label>
          <label :class="labelClass">Repeat it<input v-model="pass2" type="password" :class="inputClass" autocomplete="new-password" /></label>
        </div>
        <span class="text-xs text-radio-muted">
          The file holds your hotspot password.{{ protect ? ' Without the passphrase anyone with the file could use your hotspot.' : '' }}
        </span>
        <button type="button" :class="[primaryButton, 'h-12']" :disabled="!passOK || exporting || !parts.length" @click="doExport">Export</button>
        <span class="font-mono text-xs text-radio-muted">{{ exportName }}</span>
      </SettingsCard>

      <template v-else>
        <section class="flex flex-col rounded-2xl border border-radio-line bg-radio-surface px-4 py-1">
          <label
            v-for="(p, i) in partLabels"
            :key="p.value"
            class="flex min-h-[49px] items-center justify-between text-sm"
            :class="i > 0 ? 'border-t border-radio-line' : ''"
          >
            {{ p.label }}
            <input v-model="parts" type="checkbox" :value="p.value" class="size-5 accent-radio-amber" />
          </label>
        </section>
        <span class="px-1 text-xs text-radio-muted">
          Not included: the AMBE module and your DMRHub login. Upload the module and log in again on the new device.
        </span>
        <section class="flex flex-col gap-3 rounded-2xl border border-radio-line bg-radio-surface p-4">
          <div class="flex items-center justify-between">
            <span class="text-sm">Protect with a passphrase</span>
            <ToggleSwitch v-model="protect" label="Protect with a passphrase" />
          </div>
          <template v-if="protect">
            <input v-model="pass1" type="password" aria-label="Passphrase" placeholder="Passphrase" :class="inputClass" autocomplete="new-password" />
            <span class="text-xs text-radio-muted">The file holds your hotspot password. At least 8 characters.</span>
          </template>
        </section>
        <div class="mt-auto flex flex-col items-center gap-2 pt-4">
          <button type="button" :class="[primaryButton, 'h-[52px] w-full text-base']" :disabled="!passOK || exporting || !parts.length" @click="doExport">
            Export to a file
          </button>
          <span class="text-center text-xs text-radio-muted">Saves {{ exportName }}, or opens the share sheet</span>
        </div>
      </template>
    </template>

    <SettingsCard
      v-if="desktop || tab === 'import'"
      :title="desktop ? 'Import settings' : ''"
      :description="desktop ? 'Replaces the settings in this browser with the ones in the file.' : ''"
    >
      <p v-if="!desktop" class="m-0 text-[13px] text-radio-text/80">Replaces the settings in this browser with the ones in the file.</p>
      <input ref="picker" type="file" accept=".dmrweb,application/json" class="sr-only" @change="choose" />
      <div v-if="loadedFile" class="flex items-center justify-between gap-3 rounded-xl border border-radio-amber bg-radio-amber-soft px-3.5 py-3">
        <span class="flex min-w-0 flex-col">
          <span class="truncate font-mono text-[13px] font-semibold">{{ fileName }}</span>
          <span class="text-xs text-radio-text/80">Exported {{ exportedAt }}</span>
        </span>
        <button type="button" :class="[secondaryButton, 'h-10 shrink-0 text-[13px]']" @click="picker?.click()">Choose another</button>
      </div>
      <button v-else type="button" :class="[secondaryButton, 'h-12']" @click="picker?.click()">Choose a .dmrweb file</button>
      <template v-if="loadedFile?.encrypted && !preview">
        <label :class="labelClass">Passphrase<input v-model="importPass" type="password" :class="inputClass" autocomplete="off" @keydown.enter="unlock" /></label>
        <button type="button" :class="primaryButton" :disabled="!importPass" @click="unlock">Unlock</button>
      </template>
      <p v-if="importError" class="m-0 text-sm text-radio-red">{{ importError }}</p>
      <template v-if="preview">
        <span class="text-xs text-radio-muted">What changes</span>
        <dl v-if="preview.changes.length" class="m-0 grid grid-cols-[100px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border border-radio-line bg-radio-raised px-3.5 py-3 text-[13px] lg:grid-cols-[110px_minmax(0,1fr)]">
          <template v-for="c in preview.changes" :key="c.label">
            <dt class="text-radio-muted">{{ c.label }}</dt>
            <dd class="m-0">{{ c.to }} replaces {{ c.from }}</dd>
          </template>
        </dl>
        <p v-else class="m-0 text-sm">Nothing changes.</p>
        <span class="text-xs text-radio-muted">The radio disconnects and logs in again with the imported hotspot.</span>
        <div class="grid grid-cols-2 gap-2.5">
          <button type="button" :class="[primaryButton, 'h-12']" @click="apply">Import and replace</button>
          <button type="button" :class="[secondaryButton, 'h-12']" @click="cancel">Cancel</button>
        </div>
      </template>
    </SettingsCard>
  </div>
</template>
