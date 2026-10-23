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

import { hotspotError, mergeStatics, nextSuffix, suffixes, takenText } from '@/lib/hotspots';
import { hotspotOf } from '@/store/account';

describe('suffixes', () => {
  it('reads the suffixes of the radio ID only', () => {
    expect(suffixes(3100001, [310000102, 310000101, 310000201, 3100001])).toEqual(['01', '02']);
    expect(nextSuffix(3100001, [310000101, 310000102])).toBe('03');
    expect(nextSuffix(3100001, [310000102])).toBe('01');
  });

  it('words the taken suffixes', () => {
    expect(takenText([])).toBe('Your radio ID plus a 2-digit suffix.');
    expect(takenText(['01', '02'])).toBe('Your radio ID plus a 2-digit suffix. 01 and 02 are already yours.');
  });
});

describe('hotspotError', () => {
  it('wants 7 or 9 digits that start with the radio ID', () => {
    expect(hotspotError('310000102', 3100001)).toBe('');
    expect(hotspotError('3100001', 3100001)).toBe('');
    expect(hotspotError('31000', 3100001)).toBe('Hotspot IDs are 7 or 9 digits and start with your radio ID (3100001).');
    expect(hotspotError('310000201', 3100001)).not.toBe('');
  });
});

describe('mergeStatics', () => {
  it('follows the hub for static talkgroups and keeps the rest', () => {
    const got = mergeStatics(
      [
        { id: 9990, name: 'Parrot', static: false },
        { id: 3100, name: '', static: true },
      ],
      [91, 9990],
      new Map([
        [91, 'Worldwide'],
        [3100, 'USA'],
      ]),
    );
    expect(got).toEqual([
      { id: 9990, name: 'Parrot', static: true },
      { id: 3100, name: 'USA', static: false },
      { id: 91, name: 'Worldwide', static: true },
    ]);
  });
});

describe('hotspotOf', () => {
  it('reads the repeater JSON of the hub', () => {
    expect(
      hotspotOf({ id: 310000101, callsign: 'N0CALL', description: 'dmr-web radio', city: 'Austin', state: 'TX', ts1_static_talkgroups: null, ts2_static_talkgroups: [{ id: 91 }] }),
    ).toEqual({ id: 310000101, callsign: 'N0CALL', description: 'dmr-web radio', location: 'Austin, TX', ts1: [], ts2: [91] });
  });
});
