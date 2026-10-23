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

import { describe, expect, it } from 'vitest';

import { mergeContacts, pickParts } from '@/lib/backup';
import { type Contact, matchContact, sortContacts } from '@/store/contacts';
import { defaultSettings, mergeSettings } from '@/store/settings';

function contact(id: number, callsign: string, extra: Partial<Contact> = {}): Contact {
  return { id, callsign, name: '', note: '', addedAt: 0, heardAt: 0, heardTarget: 0, heardGroup: true, ...extra };
}

describe('contacts', () => {
  it('sorts by callsign, with bare IDs last', () => {
    const got = sortContacts([contact(3100099, ''), contact(3100003, 'N2CALL'), contact(3100002, 'N1CALL'), contact(3100001, '')]);
    expect(got.map((c) => c.id)).toEqual([3100002, 3100003, 3100001, 3100099]);
  });

  it('finds a contact by callsign, name, ID or note', () => {
    const c = contact(3100002, 'N1CALL', { name: 'Pat', note: 'evenings on TG 9' });
    expect(matchContact(c, 'n1c')).toBe(true);
    expect(matchContact(c, 'pat')).toBe(true);
    expect(matchContact(c, '31000')).toBe(true);
    expect(matchContact(c, 'evenings')).toBe(true);
    expect(matchContact(c, 'W9')).toBe(false);
  });

  it('go with a backup and merge back by ID', () => {
    const mine = [contact(3100002, 'N1CALL', { note: 'old' })];
    const content = pickParts(defaultSettings(), 'dark', ['contacts'], mine);
    expect(content.contacts).toEqual(mine);
    expect(pickParts(defaultSettings(), 'dark', ['talkgroups'], mine).contacts).toBeUndefined();
    const merged = mergeContacts(mine, [contact(3100002, 'N1CALL', { note: 'new' }), contact(3100003, 'N2CALL'), contact(0, 'BAD')]);
    expect(merged.map((c) => [c.id, c.note])).toEqual([
      [3100002, 'new'],
      [3100003, ''],
    ]);
  });
});

describe('private targets', () => {
  it('keep their own flag per slot', () => {
    const s = mergeSettings(defaultSettings(), { selected: { slot: 1, index: { 1: 0, 2: 0 }, manual: { 1: 3100002, 2: null } } } as never);
    expect(s.selected.private).toEqual({ 1: false, 2: false });
  });
});
