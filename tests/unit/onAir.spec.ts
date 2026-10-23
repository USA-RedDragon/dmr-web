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

import { entryOf, lastHeardSocketURL, mergeCall } from '@/lib/onAir';

describe('entryOf', () => {
  it('reads a DMRHub last heard row', () => {
    const e = entryOf({
      id: 7,
      user: { id: 3100001, callsign: 'N0CALL' },
      start_time: '2026-10-23T08:00:00Z',
      duration: 12_400_000_000,
      active: false,
      group_call: true,
      is_to_talkgroup: true,
      to_talkgroup: { id: 3100, name: 'USA' },
      destination_id: 3100,
      source_id: 3100001,
    });
    expect(e).toMatchObject({ callsign: 'N0CALL', source: 3100001, target: 'TG 3100', seconds: 12, active: false });
  });

  it('falls back to the ID for an unknown user', () => {
    const e = entryOf({
      id: 8,
      start_time: '2026-10-23T08:00:00Z',
      duration: 0,
      active: true,
      group_call: false,
      is_to_talkgroup: false,
      destination_id: 3100002,
      source_id: 3100009,
    });
    expect(e).toMatchObject({ callsign: '3100009', target: 'Private', active: true });
  });
});

describe('mergeCall', () => {
  const call = (id: number, start: string, extra: Record<string, unknown> = {}) => ({
    id,
    start_time: start,
    duration: 0,
    active: true,
    group_call: true,
    is_to_talkgroup: true,
    destination_id: 91,
    source_id: 3100001,
    ...extra,
  });

  it('puts a new call first and keeps the limit', () => {
    let list = [entryOf(call(1, '2026-10-23T08:00:00Z')), entryOf(call(2, '2026-10-23T07:00:00Z'))];
    list = mergeCall(list, call(3, '2026-10-23T09:00:00Z'), 2);
    expect(list.map((e) => e.id)).toEqual([3, 1]);
  });

  it('updates a call in place when it ends', () => {
    const list = mergeCall([entryOf(call(1, '2026-10-23T08:00:00Z'))], call(1, '2026-10-23T08:00:00Z', { active: false, duration: 5e9 }), 5);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ active: false, seconds: 5 });
  });

  it('leaves out calls other than voice', () => {
    expect(mergeCall([], call(1, '2026-10-23T08:00:00Z', { kind: 'data' }), 5)).toEqual([]);
  });
});

describe('lastHeardSocketURL', () => {
  it('is the public websocket of the hub', () => {
    expect(lastHeardSocketURL('dmrhub.net')).toBe('wss://dmrhub.net/ws/lastheard');
  });
});
