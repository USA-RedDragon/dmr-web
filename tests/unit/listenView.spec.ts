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

import { listenLcd, talkgroupLabel, type ListenInput } from '@/lib/listenView';

const base: ListenInput = {
  link: 'up',
  linkDetail: '',
  host: 'dmrhub.example.org',
  tuned: 91,
  error: '',
  talkgroups: [
    { id: 91, name: 'World' },
    { id: 3100, name: 'USA' },
  ],
  call: null,
  calls: {},
};

describe('talkgroupLabel', () => {
  it('names a talkgroup from the list of the hub', () => {
    expect(talkgroupLabel(91, base.talkgroups)).toBe('TG 91  WORLD');
    expect(talkgroupLabel(7, base.talkgroups)).toBe('TG 7');
    expect(talkgroupLabel(0, base.talkgroups)).toBe('NO TALKGROUP');
  });
});

describe('listenLcd', () => {
  it('shows a quiet talkgroup', () => {
    const lcd = listenLcd(base);
    expect(lcd.band).toBe('TG 91  WORLD');
    expect(lcd.status).toBe('LISTENING');
    expect(lcd.headline).toBe('TG 91');
    expect(lcd.sub).toBe('QUIET');
    expect(lcd.details).toEqual(['LISTEN ONLY, NO ACCOUNT', 'HUB  DMRHUB.EXAMPLE.ORG']);
  });

  it('shows the caller with the callsign and repeater that the hub sent', () => {
    const lcd = listenLcd({
      ...base,
      call: { source: 3000001, vocoder: 'codec2', timer: '00:12', alias: '' },
      calls: {
        3000001: { talkgroup: 91, source: 3000001, callsign: 'N0CALL', repeater: { id: 300000101, callsign: 'N0CALL' }, alias: '', active: true, durationMs: 0 },
      },
    });
    expect(lcd.status).toBe('RECEIVING');
    expect(lcd.badge).toBe('CODEC2');
    expect(lcd.headline).toBe('N0CALL');
    expect(lcd.sub).toBe('ID 3000001');
    expect(lcd.details).toEqual(['ALIAS  -', 'VIA  N0CALL 300000101']);
  });

  it('falls back to the talker alias, then the ID', () => {
    expect(listenLcd({ ...base, call: { source: 3000002, vocoder: 'ambe', timer: '', alias: 'N1CALL Demo' } }).headline).toBe('N1CALL');
    expect(listenLcd({ ...base, call: { source: 3000003, vocoder: '', timer: '', alias: '' } }).headline).toBe('3000003');
  });

  it('shows why the hub refused a tune or the session', () => {
    expect(listenLcd({ ...base, tuned: 0, error: 'this talkgroup is not open to listeners' }).sub).toBe('THIS TALKGROUP IS NOT OPEN TO LISTENERS');
    const off = listenLcd({ ...base, link: 'failed', linkDetail: 'listening is off on this network' });
    expect(off.headline).toBe('NO LINK');
    expect(off.sub).toBe('LISTENING IS OFF ON THIS NETWORK');
  });
});
