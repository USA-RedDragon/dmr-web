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

import { kvDelete, kvGet, kvSet } from './kv';

const FILE = 'ambe.wasm';
const KEY = 'ambe-module';

export type StoredModule = { bytes: Uint8Array; name: string; sha256: string; savedAt: number };

type Meta = { name: string; sha256: string; savedAt: number };

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function opfs(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await navigator.storage.getDirectory();
  } catch {
    return null;
  }
}

export async function saveModule(bytes: Uint8Array, name: string): Promise<StoredModule> {
  const sha256 = await sha256Hex(bytes);
  const meta: Meta = { name, sha256, savedAt: Date.now() };
  const dir = await opfs();
  let inOPFS = false;
  if (dir) {
    try {
      const handle = await dir.getFileHandle(FILE, { create: true });
      const w = await handle.createWritable();
      await w.write(bytes as BufferSource);
      await w.close();
      inOPFS = true;
    } catch {
      inOPFS = false;
    }
  }
  if (inOPFS) {
    await kvSet(KEY, { ...meta, opfs: true });
  } else {
    await kvSet(KEY, { ...meta, opfs: false, bytes });
  }
  return { ...meta, bytes };
}

export async function loadModule(): Promise<StoredModule | null> {
  const rec = await kvGet<Meta & { opfs: boolean; bytes?: Uint8Array }>(KEY);
  if (!rec) {
    return null;
  }
  if (!rec.opfs) {
    return rec.bytes ? { name: rec.name, sha256: rec.sha256, savedAt: rec.savedAt, bytes: rec.bytes } : null;
  }
  const dir = await opfs();
  if (!dir) {
    return null;
  }
  try {
    const file = await (await dir.getFileHandle(FILE)).getFile();
    return { name: rec.name, sha256: rec.sha256, savedAt: rec.savedAt, bytes: new Uint8Array(await file.arrayBuffer()) };
  } catch {
    return null;
  }
}

export async function removeModule(): Promise<void> {
  const dir = await opfs();
  if (dir) {
    await dir.removeEntry(FILE).catch(() => undefined);
  }
  await kvDelete(KEY);
}
