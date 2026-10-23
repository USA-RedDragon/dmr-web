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
import { useContacts } from '@/store/contacts';

defineProps<{ tab: 'chats' | 'contacts'; compact?: boolean }>();
const contacts = useContacts();
</script>

<template>
  <div role="tablist" aria-label="Messages or contacts" class="grid grid-cols-2 gap-1 rounded-xl border border-radio-line bg-radio-page p-1">
    <RouterLink
      to="/messages"
      role="tab"
      :aria-selected="tab === 'chats'"
      class="flex items-center justify-center rounded-[9px] font-semibold no-underline"
      :class="[compact ? 'h-10 text-sm' : 'h-9 text-[13px]', tab === 'chats' ? 'bg-radio-raised text-radio-accent shadow-sm' : 'text-radio-text/80']"
    >
      Chats
    </RouterLink>
    <RouterLink
      to="/messages/contacts"
      role="tab"
      :aria-selected="tab === 'contacts'"
      class="flex items-center justify-center rounded-[9px] font-semibold no-underline"
      :class="[compact ? 'h-10 text-sm' : 'h-9 text-[13px]', tab === 'contacts' ? 'bg-radio-raised text-radio-accent shadow-sm' : 'text-radio-text/80']"
    >
      Contacts<template v-if="contacts.contacts.length"> · {{ contacts.contacts.length }}</template>
    </RouterLink>
  </div>
</template>
