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
import { formatDistanceToNowStrict } from 'date-fns';
import { format as formatDate } from 'date-fns';
import { Check, ChevronLeft, MoreHorizontal, SendHorizontal, ArrowUp } from 'lucide-vue-next';
import { computed, nextTick, ref, watch } from 'vue';

import { useNames } from '@/lib/names';
import { autoFormat, FORMATS, formatLabel, type Message } from '@/lib/threads';
import { dayLabel } from '@/lib/when';
import type { CheckKind, TextFormat } from '@/radio/protocol';
import { useMessages } from '@/store/messages';
import { useRadio } from '@/store/radio';

import PeerAvatar from './PeerAvatar.vue';

const MAX = 140;

const props = defineProps<{ threadKey: string; compact?: boolean }>();
const emit = defineEmits<{ back: []; check: [kind: CheckKind] ; call: [] }>();

const store = useMessages();
const radio = useRadio();
const names = useNames();

const thread = computed(() => store.threadMap[props.threadKey]);
const peer = computed(() => thread.value?.peer ?? { group: false, id: 0 });
const msgs = computed(() => store.forThread(props.threadKey));
const text = ref('');
const format = ref<TextFormat | 'auto'>('auto');
const slot = ref(thread.value?.slot ?? 2);
const scroller = ref<HTMLElement | null>(null);
const menu = ref(false);

const who = computed(() => names.name(peer.value));
const sub = computed(() => {
  if (peer.value.group) {
    return 'Everyone on this talkgroup';
  }
  const h = names.lastHeard(peer.value.id);
  const heard = h ? ` · ${props.compact ? 'heard' : `last heard on ${h.group ? `TG ${h.target}` : 'a private call'},`} ${formatDistanceToNowStrict(h.at)} ago` : '';
  return `ID ${peer.value.id}${heard}`;
});
const autoLabel = computed(() => {
  const f = formatLabel(autoFormat(thread.value));
  return thread.value?.format && !peer.value.group ? `Auto (${f}, what ${who.value} uses)` : `Auto (${f})`;
});
const shownFormat = computed(() => formatLabel(format.value === 'auto' ? autoFormat(thread.value) : format.value));

type Row = { day?: string; m: Message };
const rows = computed(() => {
  const out: Row[] = [];
  let last = '';
  for (const m of msgs.value) {
    const d = dayLabel(m.at);
    out.push(d !== last ? { day: d, m } : { m });
    last = d;
  }
  return out;
});

function meta(m: Message): string {
  const t = formatDate(m.at, 'HH:mm');
  if (m.dir === 'in') {
    const from = peer.value.group ? `${names.callsign(m.from) || m.from} · ` : '';
    return `${from}${t} · ${formatLabel(m.format)}`;
  }
  switch (m.status) {
    case 'sending':
      return 'Now · Sending';
    case 'sent':
      return `${t} · Sent`;
    case 'delivered':
      return `${t} · Delivered`;
    default:
      return `${t} · ${failure(m.error)}`;
  }
}

function failure(reason: string): string {
  switch (reason) {
    case 'noAnswer':
      return 'No answer from the radio';
    case 'refused':
      return 'The radio refused it';
    case 'notConnected':
      return 'Not connected';
    default:
      return reason ? `Not sent: ${reason}` : 'Not sent';
  }
}

async function bottom(): Promise<void> {
  await nextTick();
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight });
}

watch(
  () => [props.threadKey, msgs.value.length],
  () => {
    store.markRead(props.threadKey);
    void bottom();
  },
  { immediate: true },
);
watch(
  () => props.threadKey,
  () => {
    format.value = 'auto';
    slot.value = thread.value?.slot ?? 2;
    text.value = '';
  },
);

function send(): void {
  const body = text.value.trim();
  if (!body || body.length > MAX) {
    return;
  }
  radio.sendText(peer.value, body, format.value, slot.value);
  text.value = '';
}

function retry(m: Message): void {
  radio.sendText(peer.value, m.text, m.format, m.slot);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey && !props.compact) {
    e.preventDefault();
    send();
  }
}
</script>

<template>
  <section v-if="thread" class="flex min-h-0 grow flex-col" :aria-label="`Conversation with ${who}`">
    <header class="flex shrink-0 items-center gap-3 border-b border-radio-line" :class="compact ? 'h-16 px-2' : 'min-h-[68px] px-6 py-3'">
      <button v-if="compact" type="button" aria-label="Back to messages" class="flex size-11 items-center justify-center text-radio-accent" @click="emit('back')">
        <ChevronLeft class="size-6" />
      </button>
      <PeerAvatar v-if="compact" :peer="peer" :size="36" />
      <div class="flex min-w-0 grow flex-col">
        <h2 class="m-0 truncate font-semibold" :class="compact ? 'text-base' : 'text-[17px]'">{{ who }}</h2>
        <span class="truncate text-xs text-radio-muted">{{ sub }}</span>
      </div>
      <div v-if="!compact && !peer.group" class="flex gap-2">
        <button type="button" class="h-10 rounded-[10px] border border-radio-line px-3.5 text-[13px]" @click="emit('check', 'radioCheck')">Radio check</button>
        <button type="button" class="h-10 rounded-[10px] border border-radio-line px-3.5 text-[13px]" @click="emit('check', 'callAlert')">Call alert</button>
        <button type="button" class="h-10 rounded-[10px] border border-radio-line px-3.5 text-[13px]" @click="emit('call')">Private call</button>
      </div>
      <div v-if="compact && !peer.group" class="relative">
        <button type="button" aria-label="More" :aria-expanded="menu" class="flex size-11 items-center justify-center text-radio-text" @click="menu = !menu">
          <MoreHorizontal class="size-5" />
        </button>
        <div v-if="menu" class="absolute top-12 right-0 z-10 flex w-48 flex-col rounded-xl border border-radio-line bg-radio-surface p-1 shadow-xl" @click="menu = false">
          <button type="button" class="h-11 rounded-lg px-3 text-left text-sm" @click="emit('check', 'radioCheck')">Radio check</button>
          <button type="button" class="h-11 rounded-lg px-3 text-left text-sm" @click="emit('check', 'callAlert')">Call alert</button>
          <button type="button" class="h-11 rounded-lg px-3 text-left text-sm" @click="emit('check', 'presence')">Presence check</button>
          <button type="button" class="h-11 rounded-lg px-3 text-left text-sm" @click="emit('call')">Private call</button>
        </div>
      </div>
    </header>

    <div ref="scroller" class="flex min-h-0 grow flex-col gap-1 overflow-y-auto" :class="compact ? 'px-4 py-4' : 'px-6 py-5'" aria-live="polite">
      <template v-for="r in rows" :key="r.m.id">
        <div v-if="r.day" class="py-3 text-center text-xs text-radio-muted">{{ r.day }}</div>
        <div class="flex flex-col pb-2" :class="r.m.dir === 'out' ? 'items-end' : 'items-start'">
          <div
            class="max-w-[85%] rounded-2xl border px-4 py-2.5 text-[15px] leading-snug break-words whitespace-pre-wrap lg:max-w-[70%]"
            :class="
              r.m.dir === 'in'
                ? 'border-radio-line bg-radio-raised text-radio-text'
                : r.m.status === 'failed'
                  ? 'border-dashed border-radio-red bg-radio-amber-soft text-radio-text'
                  : 'border-radio-amber/40 bg-radio-amber-soft text-radio-text'
            "
          >
            {{ r.m.text }}
          </div>
          <span class="flex items-center gap-1 pt-1 text-[11px]" :class="r.m.status === 'failed' ? 'text-radio-red' : 'text-radio-muted'">
            {{ meta(r.m) }}
            <Check v-if="r.m.status === 'delivered'" class="size-3.5 text-radio-green" aria-hidden="true" />
            <button v-if="r.m.status === 'failed'" type="button" class="text-radio-accent underline" @click="retry(r.m)">Retry</button>
          </span>
        </div>
      </template>
    </div>

    <form class="shrink-0 border-t border-radio-line" :class="compact ? 'px-3 pt-3 pb-2' : 'px-6 pt-4 pb-3'" @submit.prevent="send">
      <div class="flex items-end gap-2.5">
        <textarea
          v-model="text"
          :aria-label="`Message ${who}`"
          :placeholder="compact ? 'Message' : `Message ${who}`"
          :rows="compact ? 1 : 2"
          class="min-h-12 min-w-0 grow resize-none rounded-[14px] border border-radio-line bg-radio-raised px-4 py-3 text-[15px] text-radio-text outline-none focus-visible:border-radio-amber"
          :class="compact ? 'rounded-3xl' : ''"
          @keydown="onKey"
        />
        <button
          type="submit"
          :disabled="!text.trim() || text.trim().length > MAX || radio.link !== 'up'"
          :aria-label="compact ? 'Send' : undefined"
          class="flex shrink-0 items-center justify-center gap-2 bg-radio-amber font-bold text-radio-amber-ink disabled:opacity-50"
          :class="compact ? 'size-12 rounded-full' : 'h-12 rounded-[14px] px-6 text-[15px]'"
        >
          <ArrowUp v-if="compact" class="size-5" />
          <template v-else>Send <SendHorizontal class="size-4" /></template>
        </button>
      </div>
      <div class="flex items-center justify-between gap-3 pt-2 text-xs text-radio-muted">
        <span v-if="compact">{{ shownFormat }} · TS{{ slot }}</span>
        <span v-else class="flex items-center gap-2">
          <label class="flex items-center gap-2">
            Format
            <select v-model="format" class="h-9 rounded-lg border border-radio-line bg-radio-raised px-2 text-[13px] text-radio-text">
              <option value="auto">{{ autoLabel }}</option>
              <option v-for="f in FORMATS" :key="f.value" :value="f.value">{{ f.label }}</option>
            </select>
          </label>
          <label class="flex items-center gap-1">
            on
            <select v-model.number="slot" aria-label="Timeslot" class="h-9 rounded-lg border border-radio-line bg-radio-raised px-2 text-[13px] text-radio-text">
              <option :value="1">TS1</option>
              <option :value="2">TS2</option>
            </select>
          </label>
        </span>
        <span :class="text.trim().length > MAX ? 'text-radio-red' : ''">
          {{ text.trim().length }} / {{ MAX }}<template v-if="!compact"> · Enter to send, Shift+Enter for a new line</template>
        </span>
      </div>
    </form>
  </section>
</template>
