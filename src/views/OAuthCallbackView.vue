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
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAccount } from '@/store/account';
import { useSettings } from '@/store/settings';

const account = useAccount();
const store = useSettings();
const router = useRouter();
const failure = ref('');

onMounted(async () => {
  const query = new URLSearchParams(location.search);
  try {
    store.settings.hub.host = await account.complete(query);
    await router.replace('/');
  } catch (err) {
    failure.value = err instanceof Error ? err.message : String(err);
  }
});
</script>

<template>
  <main class="flex min-h-0 grow justify-center overflow-y-auto px-4 pt-12 sm:px-8">
    <section class="flex w-full max-w-[480px] flex-col gap-4 self-start rounded-[20px] border border-radio-line bg-radio-surface p-6">
      <template v-if="failure">
        <h1 class="m-0 text-xl font-bold">Login didn't finish</h1>
        <p role="alert" class="m-0 text-sm text-radio-text/80">{{ failure }}</p>
        <RouterLink to="/" class="flex h-11 items-center justify-center rounded-[10px] bg-radio-amber text-sm font-bold text-radio-amber-ink no-underline">
          Back to the radio
        </RouterLink>
      </template>
      <p v-else class="m-0 text-sm text-radio-muted">Finishing login</p>
    </section>
  </main>
</template>
