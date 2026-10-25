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
import { ArrowUp, X } from 'lucide-vue-next';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { computed, ref, watch } from 'vue';

import { useNow } from '@/composables/useNow';
import { useNames } from '@/lib/names';
import { FORMATS, keyOf, type Peer } from '@/lib/threads';
import { since } from '@/lib/when';
import type { TextFormat } from '@/radio/protocol';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

import PeerAvatar from './PeerAvatar.vue';

const MAX = 140;

const props = defineProps<{ open: boolean; compact?: boolean }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; sent: [key: string] }>();

const radio = useRadio();
const settings = useSettings();
const names = useNames();
const now = useNow();

const query = ref('');
const to = ref<Peer | null>(null);
const text = ref('');
const format = ref<TextFormat | 'auto'>('auto');
const slot = ref<number>(settings.settings.selected.slot);

watch(
  () => props.open,
  (open) => {
    if (open) {
      query.value = '';
      to.value = null;
      text.value = '';
      format.value = 'auto';
      slot.value = settings.settings.selected.slot;
    }
  },
);

type Option = { peer: Peer; title: string; sub: string; section: 'match' | 'heard' };

const options = computed<Option[]>(() => {
  const q = query.value.trim().toLowerCase();
  const out: Option[] = [];
  const seen = new Set<string>();
  const push = (o: Option) => {
    const k = keyOf(o.peer);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(o);
    }
  };
  const n = Number(q.replace(/^tg\s*/, ''));
  const numeric = /^(tg\s*)?\d+$/.test(q) && n > 0 && n < 1 << 24;
  if (numeric && !q.startsWith('tg')) {
    push({ peer: { group: false, id: n }, title: names.callsign(n) || `Radio ${n}`, sub: `ID ${n}`, section: 'match' });
  }
  if (numeric) {
    push({ peer: { group: true, id: n }, title: names.name({ group: true, id: n }), sub: 'Everyone on this talkgroup', section: 'match' });
  }
  for (const t of [...settings.settings.talkgroups[1], ...settings.settings.talkgroups[2]]) {
    const title = names.name({ group: true, id: t.id });
    if (!q || title.toLowerCase().includes(q) || String(t.id).includes(q.replace(/^tg\s*/, ''))) {
      push({ peer: { group: true, id: t.id }, title, sub: 'Everyone on this talkgroup', section: 'match' });
    }
  }
  for (const h of radio.heard) {
    if (h.self) {
      continue;
    }
    const title = names.callsign(h.source) || String(h.source);
    if (!q || title.toLowerCase().includes(q) || String(h.source).includes(q)) {
      push({
        peer: { group: false, id: h.source },
        title,
        sub: `ID ${h.source} · heard ${since(h.at, now.value)} ago${h.group ? ` on TG ${h.target}` : ''}`,
        section: 'heard',
      });
    }
  }
  return out.slice(0, 12);
});

function pick(o: Option): void {
  to.value = o.peer;
  query.value = '';
}

function send(): void {
  const body = text.value.trim();
  if (!to.value || !body || body.length > MAX) {
    return;
  }
  radio.sendText(to.value, body, format.value, slot.value);
  emit('sent', keyOf(to.value));
  emit('update:open', false);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey && !props.compact) {
    e.preventDefault();
    send();
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/70" />
      <DialogContent
        class="fixed z-50 flex flex-col bg-radio-surface text-radio-text"
        :class="compact ? 'inset-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]' : 'top-1/2 left-1/2 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[22px] border border-radio-line p-6'"
      >
        <div v-if="compact" class="flex h-14 shrink-0 items-center justify-between px-4">
          <button type="button" class="min-h-11 text-[15px] text-radio-accent" @click="emit('update:open', false)">Cancel</button>
          <DialogTitle class="text-[17px] font-semibold">New message</DialogTitle>
          <span class="w-14" />
        </div>
        <div v-else class="flex items-center justify-between">
          <DialogTitle class="text-lg font-semibold">New message</DialogTitle>
          <button type="button" aria-label="Close" class="flex size-11 items-center justify-center rounded-[10px] border border-radio-line" @click="emit('update:open', false)">
            <X class="size-4" />
          </button>
        </div>

        <label class="flex flex-col gap-1.5 text-xs text-radio-muted" :class="compact ? 'px-4' : ''">
          <span v-if="!compact">To: callsign, radio ID or talkgroup</span>
          <span class="flex min-h-12 items-center gap-2 rounded-[12px] border bg-radio-page px-3" :class="to ? 'border-radio-line' : 'border-radio-amber'">
            <span v-if="compact" class="text-[15px] text-radio-text/80">To</span>
            <button
              v-if="to"
              type="button"
              class="flex h-8 items-center gap-2 rounded-full border border-radio-amber/50 bg-radio-amber-soft px-3 font-mono text-[13px] font-semibold text-radio-accent"
              :aria-label="`Remove ${names.name(to)}`"
              @click="to = null"
            >
              {{ names.name(to) }} <X class="size-3.5" />
            </button>
            <input
              v-else
              v-model="query"
              autofocus
              class="h-11 min-w-0 grow bg-transparent text-[15px] text-radio-text outline-none"
              :placeholder="compact ? 'Callsign, ID or talkgroup' : ''"
              aria-label="To"
              @keydown.enter.prevent="options[0] && pick(options[0])"
            />
          </span>
        </label>

        <ul v-if="!to && options.length" class="m-0 flex flex-col overflow-y-auto p-0" :class="compact ? 'grow' : 'max-h-64 rounded-[12px] border border-radio-line'">
          <template v-for="(o, i) in options" :key="keyOf(o.peer)">
            <li v-if="compact && o.section === 'heard' && (i === 0 || options[i - 1]!.section !== 'heard')" class="list-none px-4 pt-4 pb-1 text-xs text-radio-muted">
              Recently heard
            </li>
            <li class="list-none">
              <button type="button" class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-radio-raised" @click="pick(o)">
                <PeerAvatar :peer="o.peer" :size="36" />
                <span class="flex min-w-0 grow flex-col">
                  <span class="truncate text-[15px] font-semibold" :class="o.peer.group ? '' : 'font-mono'">{{ o.title }}</span>
                  <span class="truncate text-xs text-radio-muted">{{ o.sub }}</span>
                </span>
                <span
                  class="rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
                  :class="o.peer.group ? 'border-radio-amber/60 text-radio-accent' : 'border-radio-line text-radio-text/80'"
                >
                  {{ o.peer.group ? 'GROUP' : 'PRIVATE' }}
                </span>
              </button>
            </li>
          </template>
        </ul>
        <div v-else-if="compact" class="grow" />

        <template v-if="!compact">
          <label class="flex flex-col gap-1.5 text-xs text-radio-muted">
            Message
            <textarea
              v-model="text"
              rows="3"
              placeholder="Write a message"
              class="resize-none rounded-[12px] border border-radio-line bg-radio-page px-3.5 py-3 text-[15px] text-radio-text outline-none focus-visible:border-radio-amber"
              @keydown="onKey"
            />
          </label>
          <div class="flex items-center gap-2 text-xs text-radio-muted">
            <label class="flex items-center gap-2">
              Format
              <select v-model="format" class="h-9 rounded-lg border border-radio-line bg-radio-page px-2 text-[13px] text-radio-text">
                <option value="auto">Auto</option>
                <option v-for="f in FORMATS" :key="f.value" :value="f.value">{{ f.label }}</option>
              </select>
            </label>
            <label class="flex items-center gap-2">
              Slot
              <select v-model.number="slot" class="h-9 rounded-lg border border-radio-line bg-radio-page px-2 text-[13px] text-radio-text">
                <option :value="1">TS1</option>
                <option :value="2">TS2</option>
              </select>
            </label>
            <button
              type="button"
              class="ml-auto h-12 rounded-[12px] bg-radio-amber px-6 text-[15px] font-bold text-radio-amber-ink disabled:opacity-50"
              :disabled="!to || !text.trim() || text.trim().length > MAX || radio.link !== 'up'"
              @click="send"
            >
              Send
            </button>
          </div>
        </template>
        <form v-else class="shrink-0 border-t border-radio-line px-3 pt-3 pb-2" @submit.prevent="send">
          <div class="flex items-end gap-2.5">
            <textarea
              v-model="text"
              rows="1"
              placeholder="Message"
              aria-label="Message"
              class="max-h-40 min-h-12 min-w-0 grow resize-none rounded-3xl [field-sizing:content] border border-radio-line bg-radio-raised px-4 py-3 text-[15px] text-radio-text outline-none"
            />
            <button
              type="submit"
              aria-label="Send"
              :disabled="!to || !text.trim() || text.trim().length > MAX || radio.link !== 'up'"
              class="flex size-12 shrink-0 items-center justify-center rounded-full bg-radio-amber text-radio-amber-ink disabled:opacity-50"
            >
              <ArrowUp class="size-5" />
            </button>
          </div>
          <div class="flex justify-between pt-2 text-xs text-radio-muted">
            <span>Auto format · TS{{ slot }}</span>
            <span>{{ text.trim().length }} / {{ MAX }}</span>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
