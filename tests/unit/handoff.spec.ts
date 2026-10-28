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

import { drainToken, isDMRD, moveSession, RecentBursts, resumed, resumeRequest } from '@/radio/handoff';

function dmrd(seq: number, stream: number, slot2 = false): Uint8Array {
  const p = new Uint8Array(55);
  p.set([0x44, 0x4d, 0x52, 0x44]);
  p[4] = seq;
  p[15] = slot2 ? 0x80 : 0;
  p[16] = (stream >>> 24) & 0xff;
  p[17] = (stream >>> 16) & 0xff;
  p[18] = (stream >>> 8) & 0xff;
  p[19] = stream & 0xff;
  return p;
}

describe('drainToken', () => {
  it('takes the token of a drain notice', () => {
    expect(drainToken('{"drain":true,"resume":"abc"}\n')).toBe('abc');
  });

  it('skips lines that are no drain notice', () => {
    expect(drainToken('nonsense\n{"drain":false,"resume":"x"}\n{"drain":true,"resume":"y"}')).toBe('y');
  });

  it('has no token without a notice', () => {
    expect(drainToken('{"resumed":true}')).toBeNull();
    expect(drainToken('')).toBeNull();
    expect(drainToken('{"drain":true,"resume":""}')).toBeNull();
  });
});

describe('resume messages', () => {
  it('asks with the token on one line', () => {
    expect(resumeRequest('t0k')).toBe('{"resume":"t0k"}\n');
  });

  it('reads the answer', () => {
    expect(resumed('{"resumed":true}\n')).toBe(true);
    expect(resumed('{"resumed":false,"reason":"bad token"}\n')).toBe(false);
    expect(resumed('garbage')).toBe(false);
  });
});

describe('RecentBursts', () => {
  it('drops the second copy of a burst', () => {
    const r = new RecentBursts(2000);
    expect(r.repeated(dmrd(5, 81, false), 0)).toBe(false);
    expect(r.repeated(dmrd(5, 81, false), 10)).toBe(true);
    expect(r.repeated(dmrd(6, 81, false), 20)).toBe(false);
    expect(r.repeated(dmrd(5, 81, true), 30)).toBe(false);
    expect(r.repeated(dmrd(5, 82, false), 40)).toBe(false);
  });

  it('forgets a burst after the window', () => {
    const r = new RecentBursts(2000);
    expect(r.repeated(dmrd(9, 1), 0)).toBe(false);
    expect(r.repeated(dmrd(9, 1), 2500)).toBe(false);
  });

  it('keeps the bursts of a move until the window after it ends', () => {
    const r = new RecentBursts(2000, 12000);
    r.startMove();
    expect(r.repeated(dmrd(1, 1), 0)).toBe(false);
    expect(r.repeated(dmrd(2, 1), 9000)).toBe(false);
    expect(r.repeated(dmrd(2, 1), 11000)).toBe(true);
    expect(r.repeated(dmrd(3, 1), 13000)).toBe(false);
    r.endMove(13000);
    expect(r.repeated(dmrd(2, 1), 14500)).toBe(true);
    expect(r.repeated(dmrd(1, 1), 14500)).toBe(false);
    expect(r.repeated(dmrd(3, 1), 15500)).toBe(false);
  });

  it('knows a DMRD packet', () => {
    expect(isDMRD(dmrd(1, 1))).toBe(true);
    expect(isDMRD(new TextEncoder().encode('MSTPONG0000'))).toBe(false);
  });
});

describe('moveSession', () => {
  it('tries until a session resumes and closes those that do not', async () => {
    const closed: number[] = [];
    let n = 0;
    const got = await moveSession(
      async () => {
        n++;
        if (n === 1) {
          throw new Error('503');
        }
        return n;
      },
      async (t) => t === 3,
      (t) => closed.push(t),
      { tries: 5, retryMs: 1, still: () => true },
    );
    expect(got).toBe(3);
    expect(closed).toEqual([2]);
  });

  it('gives up', async () => {
    expect(await moveSession(async () => 1, async () => false, () => undefined, { tries: 2, retryMs: 1, still: () => true })).toBeNull();
    let opened = 0;
    expect(
      await moveSession(
        async () => ++opened,
        async () => true,
        () => undefined,
        { tries: 5, retryMs: 1, still: () => false },
      ),
    ).toBeNull();
    expect(opened).toBe(0);
  });
});
