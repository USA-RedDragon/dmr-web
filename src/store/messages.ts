// SPDX-License-Identifier: AGPL-3.0-or-later
// dmr-web - A DMR radio in the browser
// Copyright (C) 2026 Jacob McSwain
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// The source code is available at <https://github.com/USA-RedDragon/dmr-web>
import { useDebounceFn } from '@vueuse/core';
import { defineStore } from 'pinia';
import { computed, ref, toRaw } from 'vue';

import { kvGet, kvSet } from '@/lib/kv';
import {
  autoFormat,
  fromHub,
  type HubMessage,
  keyOf,
  matchHub,
  nextStatus,
  peerOf,
  trim,
  type Message,
  type Peer,
  type Thread,
} from '@/lib/threads';
import type { CheckKind, RadioEvent, TextFormat } from '@/radio/protocol';

type Saved = { messages: Message[]; threads: Thread[] };

export type CheckState = {
  id: number;
  kind: CheckKind;
  target: number;
  slot: number;
  startedAt: number;
  status: 'checking' | 'answered' | 'noAnswer' | 'failed';
  reason: string;
  elapsedMs: number;
};

export type Alert = { id: number; source: number; slot: number; at: number };

const KEY = 'messages';

function newID(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % 0x7fffffff || 1;
}

export const useMessages = defineStore('messages', () => {
  const messages = ref<Message[]>([]);
  const threadMap = ref<Record<string, Thread>>({});
  const open = ref<string | null>(null);
  const checks = ref<Record<number, CheckState>>({});
  const alerts = ref<Alert[]>([]);
  const loaded = ref(false);

  const threads = computed(() => Object.values(threadMap.value).sort((a, b) => b.lastAt - a.lastAt));
  const unread = computed(() => threads.value.reduce((n, t) => n + t.unread, 0));

  const save = useDebounceFn(() => {
    const data: Saved = { messages: toRaw(messages.value), threads: Object.values(toRaw(threadMap.value)) };
    void kvSet(KEY, JSON.parse(JSON.stringify(data))).catch(() => undefined);
  }, 300);

  async function load(): Promise<void> {
    const saved = await kvGet<Saved>(KEY);
    if (saved) {
      messages.value = saved.messages ?? [];
      threadMap.value = Object.fromEntries((saved.threads ?? []).map((t) => [t.key, t]));
    }
    loaded.value = true;
  }

  function thread(peer: Peer, slot: number): Thread {
    const key = keyOf(peer);
    let t = threadMap.value[key];
    if (!t) {
      t = { key, peer, lastAt: Date.now(), unread: 0, format: null, slot };
      threadMap.value[key] = t;
    }
    return t;
  }

  function add(m: Message): void {
    messages.value.push(m);
    messages.value = trim(messages.value);
    save();
  }

  function forThread(key: string): Message[] {
    return messages.value.filter((m) => m.key === key);
  }

  function compose(peer: Peer, text: string, format: TextFormat | 'auto', slot: number): Message {
    const t = thread(peer, slot);
    const f = format === 'auto' ? autoFormat(t) : format;
    const m: Message = {
      id: newID(),
      key: t.key,
      dir: 'out',
      from: 0,
      text,
      at: Date.now(),
      slot,
      format: f,
      status: 'sending',
      error: '',
    };
    t.lastAt = m.at;
    t.slot = slot;
    add(m);
    return m;
  }

  function byID(id: number): Message | undefined {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      if (messages.value[i]!.id === id) {
        return messages.value[i];
      }
    }
    return undefined;
  }

  function status(id: number, reason: string): void {
    const m = byID(id);
    if (!m) {
      return;
    }
    Object.assign(m, nextStatus(m.status, reason));
    save();
  }

  function markRead(key: string): void {
    const t = threadMap.value[key];
    if (t && t.unread) {
      t.unread = 0;
      save();
    }
  }

  function setOpen(key: string | null): void {
    open.value = key;
    if (key) {
      markRead(key);
    }
  }

  function remove(key: string): void {
    messages.value = messages.value.filter((m) => m.key !== key);
    delete threadMap.value[key];
    save();
  }

  function startCheck(kind: CheckKind, target: number, slot: number): CheckState {
    const c: CheckState = { id: newID(), kind, target, slot, startedAt: Date.now(), status: 'checking', reason: '', elapsedMs: 0 };
    checks.value[c.id] = c;
    return c;
  }

  function failCheck(id: number, error: string): void {
    const c = checks.value[id];
    if (c) {
      Object.assign(c, { status: 'failed', reason: error });
    }
  }

  function dismissAlert(id: number): void {
    alerts.value = alerts.value.filter((a) => a.id !== id);
  }

  function fromHubBox(m: HubMessage, box: 'inbox' | 'outbox', live: boolean): void {
    const got = fromHub(m, box);
    if (!got) {
      return;
    }
    const i = matchHub(messages.value, got);
    if (i >= 0) {
      const x = messages.value[i]!;
      x.hub = got.hub;
      if (x.dir === 'out') {
        Object.assign(x, nextStatus(x.status, got.status === 'failed' ? 'refused' : got.status));
      }
      save();
      return;
    }
    const peer = peerOf(got.key);
    if (!peer) {
      return;
    }
    const t = thread(peer, 2);
    t.lastAt = Math.max(t.lastAt, got.at);
    if (got.dir === 'in' && live && (open.value !== t.key || document.visibilityState !== 'visible')) {
      t.unread++;
    }
    let at = messages.value.length;
    while (at > 0 && messages.value[at - 1]!.at > got.at) {
      at--;
    }
    messages.value.splice(at, 0, { ...got, id: newID(), slot: t.slot });
    messages.value = trim(messages.value);
    save();
  }

  function onEvent(e: RadioEvent, self: number): void {
    switch (e.kind) {
      case 'text': {
        const peer: Peer = e.group ? { group: true, id: e.target } : { group: false, id: e.source };
        if (!e.group && e.source === self) {
          return;
        }
        const t = thread(peer, e.slot);
        t.format = (e.format as TextFormat) || t.format;
        t.lastAt = Date.now();
        t.slot = e.slot;
        if (open.value !== t.key || document.visibilityState !== 'visible') {
          t.unread++;
        }
        add({
          id: newID(),
          key: t.key,
          dir: 'in',
          from: e.source,
          text: e.text,
          at: t.lastAt,
          slot: e.slot,
          format: (e.format as TextFormat) || 'tms',
          status: 'received',
          error: '',
        });
        break;
      }
      case 'textStatus':
        status(e.id, e.reason);
        break;
      case 'check': {
        const c = checks.value[e.id];
        if (c) {
          const answered = e.reason === 'answered';
          Object.assign(c, { status: answered ? 'answered' : e.reason === 'noAnswer' ? 'noAnswer' : 'failed', reason: e.reason, elapsedMs: e.elapsedMs });
        }
        break;
      }
      case 'callAlert':
        alerts.value.push({ id: newID(), source: e.source, slot: e.slot, at: Date.now() });
        break;
      default:
    }
  }

  return {
    messages,
    threads,
    threadMap,
    unread,
    open,
    checks,
    alerts,
    loaded,
    load,
    thread,
    forThread,
    compose,
    status,
    markRead,
    setOpen,
    remove,
    startCheck,
    failCheck,
    dismissAlert,
    fromHubBox,
    onEvent,
  };
});
