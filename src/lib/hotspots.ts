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

import type { TalkgroupEntry } from '@/store/settings';

/** suffixes returns the 2-digit hotspot suffixes of radioId that ids already use. */
export function suffixes(radioId: number, ids: number[]): string[] {
  const prefix = String(radioId);
  return ids
    .map(String)
    .filter((s) => s.length === 9 && s.startsWith(prefix))
    .map((s) => s.slice(7))
    .sort();
}

/** nextSuffix returns the first free 2-digit suffix for radioId, or '' when all 99 are taken. */
export function nextSuffix(radioId: number, ids: number[]): string {
  const taken = new Set(suffixes(radioId, ids));
  for (let i = 1; i <= 99; i++) {
    const s = String(i).padStart(2, '0');
    if (!taken.has(s)) {
      return s;
    }
  }
  return '';
}

/** takenText says which suffixes are already in use, the way the register form words it. */
export function takenText(taken: string[]): string {
  if (taken.length === 0) {
    return 'Your radio ID plus a 2-digit suffix.';
  }
  if (taken.length === 1) {
    return `Your radio ID plus a 2-digit suffix. ${taken[0]} is already yours.`;
  }
  if (taken.length <= 4) {
    return `Your radio ID plus a 2-digit suffix. ${taken.slice(0, -1).join(', ')} and ${taken.at(-1)} are already yours.`;
  }
  return `Your radio ID plus a 2-digit suffix. ${taken.length} are already yours.`;
}

/** hotspotError explains why id is not a hotspot of radioId, or returns ''. */
export function hotspotError(id: string, radioId: number): string {
  const s = id.trim();
  const ok = /^\d+$/.test(s) && (s.length === 7 || s.length === 9) && (!radioId || s.startsWith(String(radioId)));
  if (ok) {
    return '';
  }
  return radioId
    ? `Hotspot IDs are 7 or 9 digits and start with your radio ID (${radioId}).`
    : 'Hotspot IDs are 7 or 9 digits and start with your radio ID.';
}

/** mergeStatics marks the talkgroups in ids static on a slot and the rest dynamic, adding any that are missing. */
export function mergeStatics(entries: TalkgroupEntry[], ids: number[], names: Map<number, string>): TalkgroupEntry[] {
  const out = entries.map((e) => ({ ...e, static: ids.includes(e.id), name: e.name || names.get(e.id) || '' }));
  for (const id of ids) {
    if (!out.some((e) => e.id === id)) {
      out.push({ id, name: names.get(id) ?? '', static: true });
    }
  }
  return out;
}
