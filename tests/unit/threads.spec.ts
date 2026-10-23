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

import { autoFormat, keyOf, MAX_MESSAGES, nextStatus, peerOf, trim, type Message } from '@/lib/threads';

describe('threads', () => {
  it('keys a peer and reads the key back', () => {
    expect(keyOf({ group: true, id: 91 })).toBe('g91');
    expect(keyOf({ group: false, id: 3100002 })).toBe('u3100002');
    expect(peerOf('u3100002')).toEqual({ group: false, id: 3100002 });
    expect(peerOf('g91')).toEqual({ group: true, id: 91 });
    expect(peerOf('x1')).toBeNull();
    expect(peerOf('u0')).toBeNull();
    expect(peerOf('u16777216')).toBeNull();
  });

  it('moves a message state forward only', () => {
    expect(nextStatus('sending', 'sent')).toEqual({ status: 'sent', error: '' });
    expect(nextStatus('sent', 'delivered')).toEqual({ status: 'delivered', error: '' });
    expect(nextStatus('delivered', 'sent')).toEqual({ status: 'delivered', error: '' });
    expect(nextStatus('delivered', 'noAnswer')).toEqual({ status: 'delivered', error: '' });
    expect(nextStatus('sending', 'noAnswer')).toEqual({ status: 'failed', error: 'noAnswer' });
    expect(nextStatus('failed', 'delivered')).toEqual({ status: 'delivered', error: '' });
  });

  it('picks the format the contact last used', () => {
    expect(autoFormat(undefined)).toBe('tms');
    expect(autoFormat({ key: 'u1', peer: { group: false, id: 1 }, lastAt: 0, unread: 0, format: 'anytone', slot: 2 })).toBe('anytone');
  });

  it('keeps the newest messages', () => {
    const m = (i: number): Message => ({ id: i, key: 'u1', dir: 'in', from: 1, text: '', at: i, slot: 2, format: 'tms', status: 'received', error: '' });
    const many = Array.from({ length: MAX_MESSAGES + 5 }, (_, i) => m(i));
    const kept = trim(many);
    expect(kept).toHaveLength(MAX_MESSAGES);
    expect(kept[0]!.id).toBe(5);
  });
});
