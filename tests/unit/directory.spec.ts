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

import { FOUND_MS, MISSING_MS, listable, listingOf, stale } from '@/store/directory';

const blank = { callsign: '', name: '', city: '', state: '', country: '', flag: '' };

describe('listable', () => {
  it('takes radio IDs and the parrot, not talkgroups or hotspots', () => {
    expect(listable(3100001)).toBe(true);
    expect(listable(9990)).toBe(true);
    expect(listable(3100)).toBe(false);
    expect(listable(310000101)).toBe(false);
  });
});

describe('listingOf', () => {
  it('reads a RadioID row', () => {
    expect(
      listingOf({ callsign: 'n0call ', fname: 'Pat', surname: 'Smith', name: 'Patrick', city: 'Dallas', state: 'Texas', country: 'United States', flag: '🇺🇸' }),
    ).toEqual({ callsign: 'N0CALL', name: 'Pat Smith', city: 'Dallas', state: 'Texas', country: 'United States', flag: '🇺🇸' });
  });

  it('falls back to the full name', () => {
    expect(listingOf({ callsign: 'Parrot', name: 'Parrot' })).toMatchObject({ callsign: 'PARROT', name: 'Parrot' });
  });
});

describe('stale', () => {
  it('keeps a listing longer than a miss', () => {
    const now = 10 * FOUND_MS;
    expect(stale(undefined, now)).toBe(true);
    expect(stale({ listing: blank, at: now - MISSING_MS * 2 }, now)).toBe(false);
    expect(stale({ listing: blank, at: now - FOUND_MS - 1 }, now)).toBe(true);
    expect(stale({ listing: null, at: now - MISSING_MS / 2 }, now)).toBe(false);
    expect(stale({ listing: null, at: now - MISSING_MS - 1 }, now)).toBe(true);
  });
});
