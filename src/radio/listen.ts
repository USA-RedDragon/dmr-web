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

import { hubOrigin } from './discover';

/** ListenTalkgroup is a talkgroup that visitors may hear. */
export type ListenTalkgroup = { id: number; name: string };

/** ListenCall is a call on the talkgroup of a listen session. */
export type ListenCall = {
  talkgroup: number;
  source: number;
  callsign: string;
  repeater: { id: number; callsign: string };
  alias: string;
  active: boolean;
  durationMs: number;
};

/** ListenMessage is a text message of the listen monitor of a hub. */
export type ListenMessage =
  | { type: 'hello'; network: string; talkgroups: ListenTalkgroup[] }
  | { type: 'tuned'; talkgroup: number; error: string }
  | ({ type: 'call' } & ListenCall);

/** POLICY_CLOSE is the close code of a hub that refuses a listen session. */
export const POLICY_CLOSE = 1008;

/** listenURL returns the websocket URL of the listen monitor of host. */
export function listenURL(host: string): string {
  const u = hubOrigin(host);
  u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
  u.pathname = '/ws/listen';
  return u.toString();
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** parseListen reads a text message of the hub, or returns null for one it does not know. */
export function parseListen(text: string): ListenMessage | null {
  let m: Raw;
  try {
    m = JSON.parse(text) as Raw;
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') {
    return null;
  }
  switch (m.type) {
    case 'hello': {
      const list = Array.isArray(m.talkgroups) ? (m.talkgroups as Raw[]) : [];
      return {
        type: 'hello',
        network: str(m.network),
        talkgroups: list.filter((t) => t && num(t.id) > 0).map((t) => ({ id: num(t.id), name: str(t.name) })),
      };
    }
    case 'tuned':
      return { type: 'tuned', talkgroup: num(m.talkgroup), error: str(m.error) };
    case 'call': {
      const r = (m.repeater ?? {}) as Raw;
      return {
        type: 'call',
        talkgroup: num(m.talkgroup),
        source: num(m.source),
        callsign: str(m.callsign),
        repeater: { id: num(r.id), callsign: str(r.callsign) },
        alias: str(m.alias),
        active: m.active === true,
        durationMs: num(m.duration_ms),
      };
    }
    default:
      return null;
  }
}

/** tuneMessage is the message that tunes a listen session to tg, or to none with 0. */
export function tuneMessage(tg: number): string {
  return JSON.stringify({ tune: tg });
}

type SocketLike = {
  binaryType: string;
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number; reason: string }) => void) | null;
  onerror: (() => void) | null;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

export type SocketConstructor = new (url: string) => SocketLike;

export type ListenHandlers = {
  onOpen: () => void;
  onPacket: (data: Uint8Array) => void;
  onMessage: (m: ListenMessage) => void;
  /** onClosed gets the reason, and whether the hub refused the session, which a retry does not change. */
  onClosed: (reason: string, refused: boolean) => void;
};

const OPEN = 1;

/**
 * ListenLink is the websocket of a listen session. It only tunes: it has no
 * way to send voice or data, and the hub closes a session that tries.
 */
export class ListenLink {
  private ws: SocketLike | null = null;

  constructor(
    private readonly handlers: ListenHandlers,
    private readonly Socket: SocketConstructor = WebSocket as unknown as SocketConstructor,
  ) {}

  open(host: string): void {
    this.close();
    const ws = new this.Socket(listenURL(host));
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => this.handlers.onOpen();
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const m = parseListen(e.data);
        if (m) {
          this.handlers.onMessage(m);
        }
      } else if (e.data instanceof ArrayBuffer) {
        this.handlers.onPacket(new Uint8Array(e.data));
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) {
        return;
      }
      this.ws = null;
      const refused = e.code === POLICY_CLOSE;
      this.handlers.onClosed(e.reason || (refused ? 'refused by the hub' : 'the connection to the hub closed'), refused);
    };
  }

  tune(tg: number): void {
    if (this.ws?.readyState === OPEN) {
      this.ws.send(tuneMessage(tg));
    }
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    ws?.close(1000, 'closed by the radio');
  }
}
