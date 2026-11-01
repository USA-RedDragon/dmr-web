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

/**
 * A hub replica that stops tells the radio to move with a drain notice on
 * a stream of the session: a JSON line with drain and a resume token. The
 * radio opens a second session, which reaches another replica, sends the
 * token and its anchors there, and once that replica took the login over
 * it sends on the new session and closes the old one. The radio never logs
 * in again. The new replica sends the bursts that the old one sent after
 * the anchors as soon as it takes the login over, so the radio reads the
 * new session from the start, holds the bursts of the old session aside
 * until the resume answer, and drops the second copy of a burst. A replica
 * whose path to the radio moved asks it for its anchors on a stream that
 * it opens, and sends again what came after them.
 */

/** drainToken returns the resume token of a drain notice, or null. */
export function drainToken(text: string): string | null {
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      const msg = JSON.parse(line) as { drain?: unknown; resume?: unknown };
      if (msg.drain === true && typeof msg.resume === 'string' && msg.resume) {
        return msg.resume;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * resumeRequest is the line that asks a replica to take the login over,
 * with the anchors of the radio when it keeps them.
 */
export function resumeRequest(token: string, anchors?: Anchor[]): string {
  return `${JSON.stringify(anchors ? { resume: token, anchor: anchors } : { resume: token })}\n`;
}

/**
 * ANCHOR_VERSION is the version of the anchor messages that the radio
 * speaks. The radio opens its sessions with it in the anchor query
 * parameter, so that a replica asks it the anchor question.
 */
export const ANCHOR_VERSION = '1';

/** withAnchors returns url with the anchor query parameter. */
export function withAnchors(url: string): string {
  const u = new URL(url);
  u.searchParams.set('anchor', ANCHOR_VERSION);
  return u.toString();
}

/** askedForAnchors reports whether a question of a replica asks for the anchors. */
export function askedForAnchors(text: string): boolean {
  const line = text.split('\n')[0] ?? '';
  try {
    return (JSON.parse(line) as { ask?: unknown }).ask === 'anchor';
  } catch {
    return false;
  }
}

/** anchorAnswer is the line that answers an anchor question. */
export function anchorAnswer(anchors: Anchor[]): string {
  return `${JSON.stringify({ anchor: anchors })}\n`;
}

/** resumed reports whether the answer of a replica took the login over. */
export function resumed(text: string): boolean {
  const line = text.split('\n')[0] ?? '';
  try {
    return (JSON.parse(line) as { resumed?: unknown }).resumed === true;
  } catch {
    return false;
  }
}

const DMRD = [0x44, 0x4d, 0x52, 0x44];
const DMRD_LENGTH = 53;

/** isDMRD reports whether a datagram is a DMRD packet. */
export function isDMRD(data: Uint8Array): boolean {
  return data.length >= DMRD_LENGTH && DMRD.every((b, i) => data[i] === b);
}

/**
 * RecentBursts remembers the DMRD packets that came in the last windowMs,
 * by slot, stream and sequence number, so that a copy from the other
 * session is dropped. The new replica hands over what the old one sent
 * since the drain notice, and sends it up to a second after it took the
 * login over, so while the radio moves it remembers them for moveMs, and
 * for windowMs after the move ends. Both stay below the 15.36 s in which
 * the sequence number of a call comes round again.
 */
export class RecentBursts {
  private readonly seen = new Map<string, number>();
  private moving = false;

  constructor(
    private readonly windowMs: number,
    private readonly moveMs = windowMs,
  ) {}

  /** startMove keeps the packets for moveMs until endMove. */
  startMove(): void {
    this.moving = true;
  }

  /** endMove keeps the packets that came until now for windowMs from now. */
  endMove(now: number): void {
    this.moving = false;
    for (const key of this.seen.keys()) {
      this.seen.set(key, now);
    }
  }

  /** repeated reports whether a DMRD packet came before, and notes it. */
  repeated(data: Uint8Array, now: number): boolean {
    const window = this.moving ? this.moveMs : this.windowMs;
    for (const [key, at] of this.seen) {
      if (now - at <= window) {
        break;
      }
      this.seen.delete(key);
    }
    const slot = (data[15]! & 0x80) !== 0 ? 2 : 1;
    const stream = ((data[16]! << 24) | (data[17]! << 16) | (data[18]! << 8) | data[19]!) >>> 0;
    const key = `${slot}:${stream}:${data[4]!}`;
    const at = this.seen.get(key);
    if (at !== undefined && now - at <= window) {
      return true;
    }
    this.seen.delete(key);
    this.seen.set(key, now);
    return false;
  }
}

/**
 * Anchor is the last DMRD burst of a slot that the radio took with no
 * burst of its stream missing before it. A replica that takes the radio
 * over, or whose path to it moved, sends it every burst after its anchors.
 */
export type Anchor = { slot: number; stream: number; seq: number };

/**
 * ANCHOR_GAP is how many bursts of a stream after a missing one the radio
 * takes before it gives the missing one up, so that a burst that never
 * comes holds the anchor back by at most that many.
 */
const ANCHOR_GAP = 64;

type SlotAnchor = { stream: number; last: number | null; seq: number; ahead: Set<number> };

/** Anchors keeps the anchor of each slot from the DMRD packets that the radio takes. */
export class Anchors {
  private readonly slots: [SlotAnchor | null, SlotAnchor | null] = [null, null];

  /** take notes a DMRD packet that the radio took. */
  take(data: Uint8Array): void {
    const i = (data[15]! & 0x80) !== 0 ? 1 : 0;
    const stream = ((data[16]! << 24) | (data[17]! << 16) | (data[18]! << 8) | data[19]!) >>> 0;
    const seq = data[4]!;
    const s = this.slots[i];
    if (!s || (stream !== s.stream && stream !== s.last)) {
      this.slots[i] = { stream, last: s ? s.stream : null, seq, ahead: new Set() };
      return;
    }
    if (stream !== s.stream) {
      return;
    }
    const d = (seq - s.seq) & 0xff;
    if (d === 0 || d > 128) {
      return;
    }
    s.ahead.add(seq);
    if (d > ANCHOR_GAP) {
      const to = (seq - ANCHOR_GAP) & 0xff;
      for (const x of s.ahead) {
        if (((x - s.seq) & 0xff) <= ((to - s.seq) & 0xff)) {
          s.ahead.delete(x);
        }
      }
      s.seq = to;
    }
    while (s.ahead.delete((s.seq + 1) & 0xff)) {
      s.seq = (s.seq + 1) & 0xff;
    }
  }

  /** list returns the anchors of the slots on which the radio took a burst. */
  list(): Anchor[] {
    const out: Anchor[] = [];
    this.slots.forEach((s, i) => {
      if (s) {
        out.push({ slot: i + 1, stream: s.stream, seq: s.seq });
      }
    });
    return out;
  }
}

export type MoveOptions = { tries: number; retryMs: number; still: () => boolean };

/**
 * moveSession opens sessions with open until one takes the login over
 * with resume, and returns it. A session that opens but does not resume is
 * closed. It gives up after tries, or once still turns false, and returns
 * null.
 */
export async function moveSession<T>(
  open: () => Promise<T>,
  resume: (t: T) => Promise<boolean>,
  close: (t: T) => void,
  options: MoveOptions,
): Promise<T | null> {
  for (let i = 0; i < options.tries && options.still(); i++) {
    const t = await attempt(open, resume, close, options.still);
    if (t !== null) {
      return t;
    }
    await new Promise((r) => setTimeout(r, options.retryMs));
  }
  return null;
}

async function attempt<T>(
  open: () => Promise<T>,
  resume: (t: T) => Promise<boolean>,
  close: (t: T) => void,
  still: () => boolean,
): Promise<T | null> {
  let t: T;
  try {
    t = await open();
  } catch {
    return null;
  }
  let ok = false;
  try {
    ok = still() && (await resume(t));
  } catch {
    ok = false;
  }
  if (ok) {
    return t;
  }
  close(t);
  return null;
}
