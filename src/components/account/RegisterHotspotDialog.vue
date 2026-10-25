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
import { Check, Lock, X } from 'lucide-vue-next';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { computed, ref, watch } from 'vue';

import { nextSuffix, suffixes, takenText } from '@/lib/hotspots';
import { useAccount } from '@/store/account';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; connect: [id: number, password: string] }>();

const account = useAccount();
const radioId = computed(() => account.user?.id ?? 0);
const ids = computed(() => account.hotspots.map((h) => h.id));

const suffix = ref('');
const name = ref('');
const busy = ref(false);
const failure = ref('');
const done = ref<{ id: number; password: string } | null>(null);
const copied = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) {
      suffix.value = nextSuffix(radioId.value, ids.value);
      name.value = '';
      failure.value = '';
      done.value = null;
      copied.value = false;
    }
  },
  { immediate: true },
);

const taken = computed(() => suffixes(radioId.value, ids.value));
const full = computed(() => (/^\d{2}$/.test(suffix.value) && suffix.value !== '00' ? Number(`${radioId.value}${suffix.value}`) : 0));
const inUse = computed(() => taken.value.includes(suffix.value));

async function register(): Promise<void> {
  if (!full.value || inUse.value) {
    return;
  }
  busy.value = true;
  failure.value = '';
  try {
    const password = await account.register(full.value, name.value.trim());
    done.value = { id: full.value, password };
  } catch (err) {
    failure.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

async function copy(): Promise<void> {
  if (done.value) {
    await navigator.clipboard.writeText(done.value.password).catch(() => undefined);
    copied.value = true;
  }
}

const inputClass = 'rounded-[10px] border border-radio-line bg-radio-page px-3 text-radio-text outline-none focus-visible:border-radio-amber';
</script>

<template>
  <DialogRoot :open="open" @update:open="(v) => !v && emit('close')">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/70" />
      <DialogContent
        class="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-[18px] rounded-t-3xl border-t border-radio-line bg-radio-raised max-h-dvh overflow-y-auto px-4 pt-[22px] pb-[calc(1.75rem+env(safe-area-inset-bottom))] text-radio-text sm:max-h-[calc(100dvh-166px)] shadow-2xl sm:inset-auto sm:top-[150px] sm:left-1/2 sm:w-[480px] sm:-translate-x-1/2 sm:rounded-[20px] sm:border sm:p-[26px]"
      >
        <span aria-hidden="true" class="h-1 w-10 self-center rounded-sm bg-radio-line sm:hidden" />
        <template v-if="done">
          <div class="flex items-center gap-3">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-radio-green text-radio-page"><Check class="size-[22px]" /></span>
            <DialogTitle class="m-0 text-xl font-bold">Hotspot <span class="font-mono">{{ done.id }}</span> registered</DialogTitle>
          </div>
          <div class="flex flex-col gap-2">
            <span class="text-[13px] text-radio-text/80">Hotspot password. DMRHub shows it only this once.</span>
            <div class="flex items-center gap-2 rounded-xl border border-radio-line bg-radio-page py-1.5 pr-1.5 pl-3.5">
              <span class="grow font-mono text-lg tracking-[0.06em] break-all">{{ done.password }}</span>
              <button type="button" class="h-10 rounded-[9px] border border-radio-line bg-radio-raised px-3.5 text-sm" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
            </div>
            <span class="flex items-center gap-1.5 text-[13px] text-radio-green"><Check class="size-4" />Saved on this device</span>
            <span class="text-xs text-radio-muted">Copy it if you also want to use this hotspot ID somewhere else.</span>
          </div>
          <button type="button" class="h-[54px] rounded-xl bg-radio-amber text-base font-bold text-radio-amber-ink" @click="emit('connect', done.id, done.password)">Connect now</button>
        </template>
        <form v-else class="flex flex-col gap-[18px]" @submit.prevent="register">
          <div class="flex items-center justify-between">
            <DialogTitle class="m-0 text-xl font-bold">Register a hotspot</DialogTitle>
            <button type="button" aria-label="Close" class="flex size-11 items-center justify-center rounded-[10px] border border-radio-line text-radio-text/80" @click="emit('close')">
              <X class="size-5" />
            </button>
          </div>
          <div class="flex flex-col gap-2">
            <label for="reg-suffix" class="text-[13px] font-semibold text-radio-text/80">Hotspot ID</label>
            <div class="flex flex-wrap items-center gap-2">
              <span class="flex h-12 items-center rounded-[10px] border border-radio-line bg-radio-page px-3.5 font-mono text-lg text-radio-muted">{{ radioId }}</span>
              <span class="text-radio-muted">+</span>
              <input
                id="reg-suffix"
                v-model="suffix"
                maxlength="2"
                inputmode="numeric"
                :aria-invalid="inUse || !full"
                :class="[inputClass, 'h-12 w-[72px] text-center font-mono text-lg', inUse ? 'border-radio-red' : 'border-radio-amber']"
              />
              <span class="text-radio-muted">=</span>
              <span class="font-mono text-lg font-bold text-radio-accent">{{ full || '-' }}</span>
            </div>
            <span class="text-xs" :class="inUse ? 'text-radio-red' : 'text-radio-muted'">{{ inUse ? `${radioId}${suffix} is already yours.` : takenText(taken) }}</span>
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="reg-name" class="text-[13px] font-semibold text-radio-text/80">Name <span class="font-normal text-radio-muted">(optional)</span></label>
            <input id="reg-name" v-model="name" placeholder="Laptop radio" :class="[inputClass, 'h-11 text-[15px]']" />
          </div>
          <div class="flex gap-2.5 rounded-xl border border-radio-line bg-radio-surface px-3.5 py-3 text-[13px] leading-normal text-radio-text/80">
            <Lock class="mt-0.5 size-[18px] shrink-0 text-radio-accent" />
            <span>DMRHub creates a password for the hotspot and shows it only once. dmr-web saves it on this device so you don't have to type it.</span>
          </div>
          <p v-if="failure" role="alert" class="m-0 text-sm text-radio-red">{{ failure }}</p>
          <div class="flex justify-end gap-2.5">
            <button type="button" class="h-12 rounded-xl border border-radio-line px-[18px] text-[15px]" @click="emit('close')">Cancel</button>
            <button type="submit" class="h-12 rounded-xl bg-radio-amber px-[22px] text-[15px] font-bold text-radio-amber-ink disabled:opacity-50" :disabled="busy || !full || inUse">
              {{ busy ? 'Registering' : 'Register' }}
            </button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
