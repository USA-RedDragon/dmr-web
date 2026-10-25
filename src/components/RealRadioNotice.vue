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
import { LockOpen, Radio, ScrollText } from 'lucide-vue-next';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { onMounted, ref } from 'vue';

import RadioLogo from '@/components/RadioLogo.vue';
import { kvGet, kvSet } from '@/lib/kv';

const KEY = 'realRadioNoticeSeen';

const open = ref(false);

onMounted(async () => {
  open.value = !(await kvGet<boolean>(KEY));
});

function understood(): void {
  open.value = false;
  void kvSet(KEY, true).catch(() => undefined);
}

const point = 'flex gap-3 text-sm leading-snug';
const icon = 'mt-px size-[18px] shrink-0 text-radio-amber';
</script>

<template>
  <DialogRoot :open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/70" />
      <DialogContent
        class="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-[22px] border-t border-radio-line bg-radio-raised max-h-[calc(100dvh-env(safe-area-inset-top))] overflow-y-auto px-4 pt-6 pb-[calc(1.75rem+env(safe-area-inset-bottom))] text-radio-text lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[520px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:gap-[18px] lg:rounded-[20px] lg:border lg:p-7"
        @escape-key-down.prevent
        @interact-outside.prevent
      >
        <div class="flex items-center gap-3 lg:gap-3.5">
          <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-radio-amber-soft text-radio-amber lg:size-12">
            <RadioLogo class="size-[22px] lg:size-6" />
          </span>
          <DialogTitle class="m-0 text-xl font-bold lg:text-[22px]">This is a real DMR radio</DialogTitle>
        </div>
        <DialogDescription class="m-0 text-[15px] leading-normal text-radio-text/80">
          It has a DMR modem and AMBE and Codec2 vocoders, running in this browser. It joins a DMRHub network as a hotspot, which can carry what you send to repeaters and hotspots on the amateur radio bands.
        </DialogDescription>
        <ul class="m-0 flex list-none flex-col gap-3 p-0">
          <li :class="point"><Radio :class="icon" aria-hidden="true" /><span>Talking, texting and sharing your location put real traffic on the air. Other hams hear it and see it.</span></li>
          <li :class="point">
            <ScrollText :class="icon" aria-hidden="true" /><span>It goes out under your callsign and DMR ID, so your license's rules apply, like identifying your station.</span>
          </li>
          <li :class="point"><LockOpen :class="icon" aria-hidden="true" /><span>Nothing is encrypted. Treat everything you send as public.</span></li>
        </ul>
        <button type="button" class="h-[52px] rounded-[14px] bg-radio-amber text-base font-bold text-radio-amber-ink lg:h-12 lg:rounded-xl lg:text-[15px]" @click="understood">I understand</button>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
