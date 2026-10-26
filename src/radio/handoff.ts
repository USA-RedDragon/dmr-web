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
 * token there, and once that replica took the login over it sends on the
 * new session and closes the old one. The radio never logs in again. The
 * new replica sends the bursts that the old one sent since the notice as
 * soon as it takes the login over, so the radio reads the new session from
 * the start, holds the bursts of the old session aside until the resume
 * answer, and drops the second copy of a burst.
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

/** resumeRequest is the line that asks a replica to take the login over. */
export function resumeRequest(token: string): string {
  return `${JSON.stringify({ resume: token })}\n`;
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
 * session is dropped.
 */
export class RecentBursts {
  private readonly seen = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  /** repeated reports whether a DMRD packet came before, and notes it. */
  repeated(data: Uint8Array, now: number): boolean {
    for (const [key, at] of this.seen) {
      if (now - at <= this.windowMs) {
        break;
      }
      this.seen.delete(key);
    }
    const slot = (data[15]! & 0x80) !== 0 ? 2 : 1;
    const stream = ((data[16]! << 24) | (data[17]! << 16) | (data[18]! << 8) | data[19]!) >>> 0;
    const key = `${slot}:${stream}:${data[4]!}`;
    const at = this.seen.get(key);
    if (at !== undefined && now - at <= this.windowMs) {
      return true;
    }
    this.seen.delete(key);
    this.seen.set(key, now);
    return false;
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
