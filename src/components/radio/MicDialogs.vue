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
import { Mic, MicOff } from 'lucide-vue-next';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { computed } from 'vue';

import { useRadio } from '@/store/radio';

const radio = useRadio();

const denied = computed({
  get: () => radio.micPermission === 'denied' && radio.tx.error !== '',
  set: (v: boolean) => {
    if (!v) {
      radio.tx.error = '';
    }
  },
});

async function allow(): Promise<void> {
  if (await radio.enableMic()) {
    radio.tx.error = '';
  }
}

async function retry(): Promise<void> {
  await radio.checkMicPermission();
  if (radio.micPermission !== 'denied') {
    radio.tx.error = '';
    await allow();
  }
}
const site = location.host;
</script>

<template>
  <DialogRoot :open="radio.micPrompt" @update:open="(v) => (radio.micPrompt = v)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/70" />
      <DialogContent
        class="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-3xl border-t border-radio-chassis-line bg-radio-raised px-4 pt-[22px] pb-7 sm:inset-auto sm:p-6 sm:left-1/2 sm:top-1/2 sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:border"
      >
        <span class="flex size-12 items-center justify-center rounded-full bg-radio-amber-soft text-radio-accent"><Mic class="size-6" /></span>
        <span aria-hidden="true" class="h-1 w-10 self-center rounded-full bg-radio-chassis-line sm:hidden" />
        <DialogTitle class="m-0 text-xl font-bold">dmr-web needs your microphone to transmit</DialogTitle>
        <DialogDescription class="m-0 text-sm leading-relaxed text-radio-text/80">
          It only listens while you hold PTT. Your browser will ask next. Receiving works without it.
        </DialogDescription>
        <div class="grid grid-cols-2 gap-2.5">
          <button type="button" class="h-12 rounded-xl bg-radio-amber font-bold text-radio-amber-ink" @click="allow">Allow microphone</button>
          <button type="button" class="h-12 rounded-xl border border-radio-line" @click="radio.micPrompt = false">Not now</button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DialogRoot v-model:open="denied">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/70" />
      <DialogContent
        class="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-3xl border-t border-radio-chassis-line bg-radio-raised px-4 pt-[22px] pb-7 sm:inset-auto sm:p-6 sm:left-1/2 sm:top-1/2 sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:border"
      >
        <span aria-hidden="true" class="h-1 w-10 self-center rounded-full bg-radio-chassis-line sm:hidden" />
        <div class="flex items-center gap-3">
          <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--radio-red)_18%,transparent)] text-radio-red">
            <MicOff class="size-[22px]" />
          </span>
          <DialogTitle class="m-0 text-xl font-bold">Microphone is blocked</DialogTitle>
        </div>
        <DialogDescription class="m-0 text-sm leading-relaxed text-radio-text/80">You can still listen. To transmit, allow the microphone for this site:</DialogDescription>
        <ol class="m-0 flex flex-col gap-2 pl-[22px] text-sm leading-snug">
          <li>Tap the icon next to the address, or open the browser's site settings.</li>
          <li>Find Microphone and set it to Allow for {{ site }}.</li>
          <li>Come back here and tap Try again.</li>
        </ol>
        <div class="flex flex-col gap-2.5 sm:grid sm:grid-cols-2">
          <button type="button" class="h-[54px] rounded-xl bg-radio-amber text-base font-bold text-radio-amber-ink sm:h-12" @click="retry">Try again</button>
          <button type="button" class="h-12 rounded-xl border border-radio-line text-[15px]" @click="denied = false">Keep listening only</button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
