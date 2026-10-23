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
import type { TextFormat } from '@/radio/protocol';

export type Peer = { group: boolean; id: number };

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'failed' | 'received';

export type Message = {
  id: number;
  key: string;
  dir: 'in' | 'out';
  from: number;
  text: string;
  at: number;
  slot: number;
  format: TextFormat;
  status: MessageStatus;
  error: string;
  hub?: number;
};

export type Thread = {
  key: string;
  peer: Peer;
  lastAt: number;
  unread: number;
  format: TextFormat | null;
  slot: number;
};

export const MAX_MESSAGES = 2000;

export const FORMATS: { value: TextFormat; label: string }[] = [
  { value: 'tms', label: 'MOTOTRBO TMS' },
  { value: 'ip', label: 'ETSI IP text' },
  { value: 'anytone', label: 'AnyTone text' },
  { value: 'dd', label: 'ETSI defined data' },
  { value: 'hytera', label: 'AnyTone H-SMS' },
];

export function formatLabel(f: string): string {
  return FORMATS.find((x) => x.value === f)?.label ?? f;
}

export function keyOf(p: Peer): string {
  return `${p.group ? 'g' : 'u'}${p.id}`;
}

export function peerOf(key: string): Peer | null {
  const m = /^([gu])(\d+)$/.exec(key);
  if (!m) {
    return null;
  }
  const id = Number(m[2]);
  return id > 0 && id < 1 << 24 ? { group: m[1] === 'g', id } : null;
}

const rank: Record<MessageStatus, number> = { sending: 0, failed: 1, sent: 2, delivered: 3, received: 3 };

export function nextStatus(current: MessageStatus, reason: string): { status: MessageStatus; error: string } {
  const status: MessageStatus = reason === 'sent' || reason === 'delivered' ? reason : 'failed';
  if (rank[status] < rank[current] && current !== 'failed') {
    return { status: current, error: '' };
  }
  return { status, error: status === 'failed' ? reason : '' };
}

export function autoFormat(thread: Thread | undefined): TextFormat {
  return thread?.format ?? 'tms';
}

export function trim(messages: Message[]): Message[] {
  return messages.length > MAX_MESSAGES ? messages.slice(messages.length - MAX_MESSAGES) : messages;
}

/** HubMessage is a text message as the hub's messages API and websocket send it. */
export type HubMessage = {
  id: number;
  received_at: string;
  source_id: number;
  destination_id: number;
  group: boolean;
  format: string;
  text: string | null;
  confirmed: boolean;
  response: string;
};

/** HUB_MATCH_MS is how far apart a hub message and a radio one may be and still be the same text. */
export const HUB_MATCH_MS = 120_000;

const hubFormats: Record<string, TextFormat> = { tms: 'tms', ip: 'ip', anytone: 'anytone', defined_data: 'dd', hytera: 'hytera' };

/** fromHub turns a hub message into one of a thread, or returns null for one with no text. */
export function fromHub(m: HubMessage, box: 'inbox' | 'outbox'): Omit<Message, 'id' | 'slot'> | null {
  const format = hubFormats[m.format];
  if (!format || m.text === null || m.text === '') {
    return null;
  }
  const out = box === 'outbox';
  const peer: Peer = m.group ? { group: true, id: m.destination_id } : { group: false, id: out ? m.destination_id : m.source_id };
  let status: MessageStatus = 'received';
  if (out) {
    status = m.response === 'ack' ? 'delivered' : m.response === 'nack' ? 'failed' : 'sent';
  }
  return {
    key: keyOf(peer),
    dir: out ? 'out' : 'in',
    from: m.source_id,
    text: m.text,
    at: Date.parse(m.received_at) || Date.now(),
    format,
    status,
    error: status === 'failed' ? 'refused' : '',
    hub: m.id,
  };
}

/** matchHub finds the message that m is the hub's copy of: the one with its hub ID, or the same text heard over the radio. */
export function matchHub(messages: Message[], m: Omit<Message, 'id' | 'slot'>): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.hub === m.hub) {
      return i;
    }
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const x = messages[i]!;
    if (x.hub === undefined && x.key === m.key && x.dir === m.dir && x.text === m.text && Math.abs(x.at - m.at) <= HUB_MATCH_MS) {
      return i;
    }
  }
  return -1;
}
