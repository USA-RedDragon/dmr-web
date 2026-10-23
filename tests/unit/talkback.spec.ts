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

import { left, live, rxEnd, rxStart, TALKBACK_MS, txEnd, txStart } from '@/lib/talkback';

const self = 3100001;

describe('talkback', () => {
  it('opens on a private call to this radio only', () => {
    expect(rxStart(null, self, 3100002, self, false, 2)).toEqual({ id: 3100002, slot: 2, until: Infinity });
    expect(rxStart(null, self, 3100002, 91, true, 2)).toBeNull();
    expect(rxStart(null, self, 3100002, 3100003, false, 2)).toBeNull();
  });

  it('counts down after the over and after each reply', () => {
    let tb = rxStart(null, self, 3100002, self, false, 2);
    tb = rxEnd(tb, 3100002, 2, 1000);
    expect(tb!.until).toBe(1000 + TALKBACK_MS);
    expect(live(tb, 1000 + TALKBACK_MS - 1)).not.toBeNull();
    expect(live(tb, 1000 + TALKBACK_MS)).toBeNull();
    tb = txStart(tb, 3100002, false);
    expect(tb!.until).toBe(Infinity);
    tb = txEnd(tb, 3100002, false, 5000);
    expect(tb!.until).toBe(5000 + TALKBACK_MS);
  });

  it('ignores other stations and group calls', () => {
    const tb = { id: 3100002, slot: 2, until: 9000 };
    expect(rxEnd(tb, 3100003, 2, 1000)).toBe(tb);
    expect(rxEnd(tb, 3100002, 1, 1000)).toBe(tb);
    expect(txStart(tb, 91, true)).toBe(tb);
    expect(txEnd(tb, 3100003, false, 1000)).toBe(tb);
  });

  it('says how much is left', () => {
    expect(left({ id: 1, slot: 2, until: 10_000 }, 4000)).toEqual({ seconds: 6, used: 0.4 });
    expect(left({ id: 1, slot: 2, until: Infinity }, 4000)).toEqual({ seconds: TALKBACK_MS / 1000, used: 0 });
  });
});
