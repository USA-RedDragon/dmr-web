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

import { octetCount, parseHex } from '@/lib/hex';

describe('parseHex', () => {
  it('reads spaced, packed and prefixed hex', () => {
    expect([...parseHex('48 65 6C 6C 6F')!]).toEqual([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    expect([...parseHex('deadBEEF')!]).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect([...parseHex('0x01, 0x02:03')!]).toEqual([1, 2, 3]);
  });

  it('refuses odd lengths, stray letters and nothing', () => {
    expect(parseHex('ABC')).toBeNull();
    expect(parseHex('zz')).toBeNull();
    expect(parseHex('  ')).toBeNull();
    expect(octetCount('48 65 6C 6C 6F')).toBe(5);
    expect(octetCount('nope')).toBe(0);
  });
});
