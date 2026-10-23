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

import type { Contact } from '@/store/contacts';
import { mergeSettings, type Settings } from '@/store/settings';

export const BACKUP_FORMAT = 'dmr-web-settings';
export const BACKUP_VERSION = 1;
const ITERATIONS = 600_000;

export type BackupPart = 'hotspot' | 'identity' | 'talkgroups' | 'contacts' | 'preferences';

export const BACKUP_PARTS: BackupPart[] = ['hotspot', 'identity', 'talkgroups', 'contacts', 'preferences'];

export type BackupContent = { settings: Partial<Settings>; theme?: string; contacts?: Contact[] };

export function pickParts(settings: Settings, theme: string, parts: BackupPart[], contacts: Contact[] = []): BackupContent {
  const s = structuredClone(JSON.parse(JSON.stringify(settings)) as Settings);
  const out: Partial<Settings> = {};
  if (parts.includes('hotspot') || parts.includes('identity')) {
    out.hotspot = { id: 0, password: '', callsign: '', location: '' };
  }
  if (parts.includes('hotspot')) {
    out.hub = s.hub;
    out.hotspot!.id = s.hotspot.id;
    out.hotspot!.password = s.hotspot.password;
  }
  if (parts.includes('identity')) {
    out.hotspot!.callsign = s.hotspot.callsign;
    out.hotspot!.location = s.hotspot.location;
  }
  if (parts.includes('talkgroups')) {
    out.talkgroups = s.talkgroups;
    out.selected = s.selected;
  }
  if (parts.includes('preferences')) {
    out.vocoder = s.vocoder;
    out.jitterMs = s.jitterMs;
    out.ars = s.ars;
    out.audio = s.audio;
    out.display = s.display;
  }
  const content: BackupContent = parts.includes('preferences') ? { settings: out, theme } : { settings: out };
  if (parts.includes('contacts')) {
    content.contacts = JSON.parse(JSON.stringify(contacts)) as Contact[];
  }
  return content;
}

/** mergeContacts adds the contacts of a backup to the current ones; a backup entry replaces one with its ID. */
export function mergeContacts(current: Contact[], incoming: Contact[] | undefined): Contact[] {
  if (!incoming) {
    return current;
  }
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of incoming) {
    if (Number.isInteger(c.id) && c.id > 0 && c.id < 1 << 24) {
      byId.set(c.id, { ...byId.get(c.id), ...c });
    }
  }
  return [...byId.values()];
}

export function applyParts(current: Settings, next: Partial<Settings>): Settings {
  const merged = mergeSettings(current, next);
  if (next.hotspot) {
    const h = next.hotspot;
    merged.hotspot = {
      id: h.id || current.hotspot.id,
      password: h.id ? h.password : current.hotspot.password,
      callsign: h.callsign || current.hotspot.callsign,
      location: h.callsign || h.location ? h.location : current.hotspot.location,
    };
  }
  return merged;
}

type PlainFile = { format: string; version: number; exportedAt: string; encrypted: false; content: BackupContent };
type SealedFile = {
  format: string;
  version: number;
  exportedAt: string;
  encrypted: true;
  salt: string;
  iv: string;
  data: string;
};

export type BackupFile = PlainFile | SealedFile;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    s += String.fromCharCode(b);
  }
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function key(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function exportBackup(content: BackupContent, passphrase: string | null, now = new Date()): Promise<string> {
  const head = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString() };
  if (!passphrase) {
    return JSON.stringify({ ...head, encrypted: false, content } satisfies PlainFile);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(content));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(passphrase, salt), plain));
  return JSON.stringify({ ...head, encrypted: true, salt: b64(salt), iv: b64(iv), data: b64(sealed) } satisfies SealedFile);
}

export function readBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This is not a dmr-web settings file');
  }
  const f = parsed as Partial<BackupFile>;
  if (f.format !== BACKUP_FORMAT) {
    throw new Error('This is not a dmr-web settings file');
  }
  if (f.version !== BACKUP_VERSION) {
    throw new Error('This settings file is from another version of dmr-web');
  }
  return f as BackupFile;
}

export async function openBackup(file: BackupFile, passphrase: string): Promise<BackupContent> {
  if (!file.encrypted) {
    return file.content;
  }
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(file.iv) as BufferSource },
      await key(passphrase, unb64(file.salt)),
      unb64(file.data) as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plain)) as BackupContent;
  } catch {
    throw new Error('The passphrase is wrong, or the file is damaged');
  }
}

export type Change = { label: string; from: string; to: string };

export function describeChanges(
  current: Settings,
  incoming: Partial<Settings>,
  theme: { from: string; to?: string },
  contacts?: { from: number; to: number },
): Change[] {
  const next = applyParts(current, incoming);
  const out: Change[] = [];
  const add = (label: string, from: string, to: string) => {
    if (from !== to) {
      out.push({ label, from, to });
    }
  };
  add('Hub', current.hub.host, next.hub.host);
  add('Hotspot', String(current.hotspot.id || '-'), String(next.hotspot.id || '-'));
  add('Callsign', current.hotspot.callsign || '-', next.hotspot.callsign || '-');
  const tg = (x: Settings) => `TS1: ${x.talkgroups[1].length}, TS2: ${x.talkgroups[2].length}`;
  add('Talkgroups', tg(current), tg(next));
  if (contacts) {
    add('Contacts', String(contacts.from), String(contacts.to));
  }
  add('Vocoder', current.vocoder, next.vocoder);
  add('Jitter buffer', `${current.jitterMs} ms`, `${next.jitterMs} ms`);
  if (theme.to) {
    add('Theme', theme.from, theme.to);
  }
  return out;
}
