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
import { computed, ref } from 'vue';

import { kvGet, kvSet } from '@/lib/kv';

/** Contact is a radio the user starred. */
export type Contact = {
  id: number;
  callsign: string;
  name: string;
  note: string;
  addedAt: number;
  heardAt: number;
  heardTarget: number;
  heardGroup: boolean;
};

/** Undo is the last star change, which the toast can take back. */
export type Undo = { contact: Contact; added: boolean; at: number };

const KEY = 'contacts';

/** UNDO_MS is how long the toast offers Undo. */
export const UNDO_MS = 5000;

/** sortContacts orders contacts by callsign, then by ID for those without one. */
export function sortContacts(list: Contact[]): Contact[] {
  return [...list].sort((a, b) => {
    if (a.callsign && b.callsign) {
      return a.callsign.localeCompare(b.callsign);
    }
    if (a.callsign || b.callsign) {
      return a.callsign ? -1 : 1;
    }
    return a.id - b.id;
  });
}

/** matchContact reports whether c matches a search of its callsign, name, ID or note. */
export function matchContact(c: Contact, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || [c.callsign, c.name, c.note, String(c.id)].some((x) => x.toLowerCase().includes(s));
}

export const useContacts = defineStore('contacts', () => {
  const list = ref<Contact[]>([]);
  const loaded = ref(false);
  const undo = ref<Undo | null>(null);

  const contacts = computed(() => sortContacts(list.value));
  const ids = computed(() => new Set(list.value.map((c) => c.id)));

  const save = useDebounceFn(() => {
    void kvSet(KEY, JSON.parse(JSON.stringify(list.value)) as Contact[]).catch(() => undefined);
  }, 300);

  async function load(): Promise<void> {
    list.value = (await kvGet<Contact[]>(KEY)) ?? [];
    loaded.value = true;
  }

  function replaceAll(next: Contact[]): void {
    list.value = next.filter((c) => Number.isInteger(c.id) && c.id > 0);
    save();
  }

  function get(id: number): Contact | undefined {
    return list.value.find((c) => c.id === id);
  }

  function has(id: number): boolean {
    return ids.value.has(id);
  }

  function add(id: number, callsign = '', heard?: { at: number; target: number; group: boolean }): Contact {
    const existing = get(id);
    if (existing) {
      return existing;
    }
    const c: Contact = {
      id,
      callsign: callsign.toUpperCase(),
      name: '',
      note: '',
      addedAt: Date.now(),
      heardAt: heard?.at ?? 0,
      heardTarget: heard?.target ?? 0,
      heardGroup: heard?.group ?? true,
    };
    list.value.push(c);
    undo.value = { contact: c, added: true, at: Date.now() };
    save();
    return c;
  }

  function remove(id: number): void {
    const c = get(id);
    if (!c) {
      return;
    }
    list.value = list.value.filter((x) => x.id !== id);
    undo.value = { contact: c, added: false, at: Date.now() };
    save();
  }

  function toggle(id: number, callsign = '', heard?: { at: number; target: number; group: boolean }): void {
    if (has(id)) {
      remove(id);
    } else {
      add(id, callsign, heard);
    }
  }

  function takeBack(): void {
    const u = undo.value;
    undo.value = null;
    if (!u) {
      return;
    }
    if (u.added) {
      list.value = list.value.filter((x) => x.id !== u.contact.id);
    } else if (!has(u.contact.id)) {
      list.value.push(u.contact);
    }
    save();
  }

  function update(id: number, fields: Partial<Pick<Contact, 'name' | 'note' | 'callsign'>>): void {
    const c = get(id);
    if (c) {
      Object.assign(c, fields);
      save();
    }
  }

  function heard(id: number, callsign: string, at: number, target: number, group: boolean): void {
    const c = get(id);
    if (!c) {
      return;
    }
    if (callsign) {
      c.callsign = callsign.toUpperCase();
    }
    if (at >= c.heardAt) {
      Object.assign(c, { heardAt: at, heardTarget: target, heardGroup: group });
    }
    save();
  }

  return { contacts, loaded, undo, load, replaceAll, get, has, add, remove, toggle, takeBack, update, heard };
});
