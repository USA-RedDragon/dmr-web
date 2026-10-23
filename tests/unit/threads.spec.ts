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

import { messagesSocketURL, retryDelay } from '@/lib/hubMessages';
import { autoFormat, fromHub, type HubMessage, keyOf, matchHub, MAX_MESSAGES, nextStatus, peerOf, trim, type Message } from '@/lib/threads';

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

const hubMsg: HubMessage = {
  id: 7,
  received_at: '2026-10-23T14:00:00Z',
  source_id: 3100002,
  destination_id: 3100001,
  group: false,
  format: 'defined_data',
  text: 'hello',
  confirmed: true,
  response: 'ack',
};

describe('hub messages', () => {
  it('puts an inbox message in the thread of its sender', () => {
    expect(fromHub(hubMsg, 'inbox')).toMatchObject({ key: 'u3100002', dir: 'in', format: 'dd', status: 'received', hub: 7, at: Date.parse('2026-10-23T14:00:00Z') });
  });

  it('puts an outbox message in the thread of its target, with its answer', () => {
    expect(fromHub({ ...hubMsg, source_id: 3100001, destination_id: 3100002 }, 'outbox')).toMatchObject({ key: 'u3100002', dir: 'out', status: 'delivered' });
    expect(fromHub({ ...hubMsg, response: 'nack' }, 'outbox')).toMatchObject({ status: 'failed' });
    expect(fromHub({ ...hubMsg, group: true, destination_id: 91, response: '' }, 'outbox')).toMatchObject({ key: 'g91', status: 'sent' });
  });

  it('skips data and messages with no text', () => {
    expect(fromHub({ ...hubMsg, format: 'data' }, 'inbox')).toBeNull();
    expect(fromHub({ ...hubMsg, text: null }, 'inbox')).toBeNull();
  });

  it('matches the copy heard over the radio, then the hub ID', () => {
    const got = fromHub(hubMsg, 'inbox')!;
    const radio: Message = { ...got, id: 1, slot: 2, hub: undefined, at: got.at + 3000 };
    const old: Message = { ...radio, id: 2, at: got.at - 600_000 };
    expect(matchHub([old, radio], got)).toBe(1);
    expect(matchHub([old], got)).toBe(-1);
    expect(matchHub([{ ...old, hub: 7 }], got)).toBe(0);
    expect(matchHub([{ ...radio, text: 'other' }], got)).toBe(-1);
  });

  it('opens the websocket on the hub and backs off', () => {
    expect(messagesSocketURL('dmrhub.net')).toBe('wss://dmrhub.net/ws/messages');
    expect(messagesSocketURL('http://127.0.0.1:3005')).toBe('ws://127.0.0.1:3005/ws/messages');
    expect(retryDelay(0)).toBe(1000);
    expect(retryDelay(3)).toBe(8000);
    expect(retryDelay(20)).toBe(60_000);
  });
});
