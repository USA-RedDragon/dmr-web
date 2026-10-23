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
import { computed, onMounted, watchEffect } from 'vue';

import AppHeader from '@/components/AppHeader.vue';
import UpdateNotice from '@/components/UpdateNotice.vue';
import { Toaster } from '@/components/ui/toast';
import { useColorMode } from '@/composables/useColorMode';
import { useMessages } from '@/store/messages';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

const { isDark } = useColorMode();
const store = useSettings();
const radio = useRadio();

const reduceMotion = computed(() => store.settings.display.reduceMotion);

watchEffect(() => {
  document.documentElement.classList.toggle('reduce-motion', reduceMotion.value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark.value ? '#0e0f11' : '#f4f4f2');
});

onMounted(async () => {
  await Promise.all([store.load(), useMessages().load()]);
  radio.init();
});
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-radio-page text-radio-text">
    <AppHeader />
    <RouterView v-if="store.loaded" />
    <Toaster />
    <UpdateNotice />
  </div>
</template>
