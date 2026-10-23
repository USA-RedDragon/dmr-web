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
