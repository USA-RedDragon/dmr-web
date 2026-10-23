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

import { defaultSettings, mergeSettings, radioIdOf, rptoOptions, validHotspot } from '@/store/settings';

describe('settings', () => {
  it('takes the radio ID from a 9-digit hotspot ID', () => {
    expect(radioIdOf(310000101)).toBe(3100001);
    expect(radioIdOf(3100001)).toBe(3100001);
  });

  it('accepts 7 and 9 digit hotspot IDs only', () => {
    expect(validHotspot(3100001)).toBe(true);
    expect(validHotspot(310000101)).toBe(true);
    expect(validHotspot(31000010)).toBe(false);
    expect(validHotspot(0)).toBe(false);
    expect(validHotspot(3100001.5)).toBe(false);
  });

  it('builds RPTO options from the static talkgroups', () => {
    const tg = {
      1: [
        { id: 1, name: '', static: true },
        { id: 3100, name: '', static: true },
      ],
      2: [
        { id: 9990, name: '', static: false },
        { id: 91, name: '', static: true },
      ],
    };
    expect(rptoOptions(tg)).toBe('TS1=1,3100;TS2=91');
    expect(rptoOptions({ 1: [], 2: [{ id: 9, name: '', static: false }] })).toBe('');
  });

  it('keeps defaults for fields a saved copy lacks', () => {
    const base = defaultSettings();
    const merged = mergeSettings(base, { hub: { host: 'example.org' } } as never);
    expect(merged.hub.host).toBe('example.org');
    expect(merged.hub.port).toBe(base.hub.port);
    expect(merged.hub.path).toBe(base.hub.path);
    expect(mergeSettings(base, undefined)).toBe(base);
  });
});
