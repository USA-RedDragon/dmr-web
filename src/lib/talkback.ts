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

/** TALKBACK_MS is how long after a private over PTT still replies to it. */
export const TALKBACK_MS = 10_000;

/** Talkback is the private call PTT replies to; until is Infinity while an over is on the air. */
export type Talkback = { id: number; slot: number; until: number };

/** rxStart opens talkback to a station that calls self privately. */
export function rxStart(tb: Talkback | null, self: number, source: number, target: number, group: boolean, slot: number): Talkback | null {
  if (group || target !== self || source === self) {
    return tb;
  }
  return { id: source, slot, until: Infinity };
}

/** rxEnd starts the talkback countdown when the private over of its station ends. */
export function rxEnd(tb: Talkback | null, source: number, slot: number, now: number): Talkback | null {
  if (!tb || tb.id !== source || tb.slot !== slot) {
    return tb;
  }
  return { ...tb, until: now + TALKBACK_MS };
}

/** txStart holds talkback open while the reply is on the air. */
export function txStart(tb: Talkback | null, target: number, group: boolean): Talkback | null {
  if (!tb || group || tb.id !== target) {
    return tb;
  }
  return { ...tb, until: Infinity };
}

/** txEnd restarts the countdown after a reply, so the other station can answer. */
export function txEnd(tb: Talkback | null, target: number, group: boolean, now: number): Talkback | null {
  if (!tb || group || tb.id !== target) {
    return tb;
  }
  return { ...tb, until: now + TALKBACK_MS };
}

/** live returns tb while it still holds at now. */
export function live(tb: Talkback | null, now: number): Talkback | null {
  return tb && tb.until > now ? tb : null;
}

/** left returns the whole seconds of talkback left at now, and the share of the window used. */
export function left(tb: Talkback, now: number): { seconds: number; used: number } {
  if (tb.until === Infinity) {
    return { seconds: TALKBACK_MS / 1000, used: 0 };
  }
  const ms = Math.max(0, tb.until - now);
  return { seconds: Math.ceil(ms / 1000), used: 1 - ms / TALKBACK_MS };
}
