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

import { ASK_MS, SHOW_MS, phaseOf } from '@/lib/positionRequest';
import type { LocationRequest, Position } from '@/store/positions';

const pos = (at: number): Position => ({ id: 3100002, latitude: 41.8853, longitude: -87.6213, format: 'lrrp', accuracy: 10, speed: null, heading: null, at, slot: 2 });
const req = (startedAt: number, status: LocationRequest['status']): LocationRequest => ({ id: 1, target: 3100002, slot: 2, startedAt, status, reason: '' });

describe('phaseOf', () => {
  const now = 10 * SHOW_MS;

  it('has nothing to show for a station never asked', () => {
    expect(phaseOf(null, undefined, now)).toBe('none');
  });

  it('asks until an answer or the wait runs out', () => {
    expect(phaseOf(null, req(now - 1000, 'asking'), now)).toBe('asking');
    expect(phaseOf(pos(now - SHOW_MS), req(now - 1000, 'asking'), now)).toBe('asking');
    expect(phaseOf(null, req(now - ASK_MS - 1, 'asking'), now)).toBe('noAnswer');
  });

  it('shows the answer', () => {
    expect(phaseOf(pos(now - 500), req(now - 1000, 'answered'), now)).toBe('answered');
    expect(phaseOf(pos(now - 500), undefined, now)).toBe('answered');
  });

  it('tells of a failed request, then falls back to the last position', () => {
    expect(phaseOf(pos(now - SHOW_MS), req(now - 1000, 'noPosition'), now)).toBe('noPosition');
    expect(phaseOf(null, req(now - 1000, 'failed'), now)).toBe('failed');
    expect(phaseOf(pos(now - 2 * SHOW_MS), req(now - SHOW_MS - 1, 'failed'), now)).toBe('answered');
    expect(phaseOf(null, req(now - SHOW_MS - 1, 'failed'), now)).toBe('none');
  });
});
