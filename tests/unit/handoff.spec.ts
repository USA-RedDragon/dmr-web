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

import {
  anchorAnswer,
  Anchors,
  askedForAnchors,
  drainToken,
  isDMRD,
  moveSession,
  RecentBursts,
  resumed,
  resumeRequest,
  withAnchors,
} from '@/radio/handoff';

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

  it('carries the anchors when the radio keeps them', () => {
    expect(resumeRequest('t0k', [])).toBe('{"resume":"t0k","anchor":[]}\n');
    expect(resumeRequest('t0k', [{ slot: 2, stream: 9, seq: 4, first: 2 }])).toBe(
      '{"resume":"t0k","anchor":[{"slot":2,"stream":9,"seq":4,"first":2}]}\n',
    );
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

describe('anchor messages', () => {
  it('opens a session with the anchor version', () => {
    expect(withAnchors('https://hub.example:62032/mmdvm')).toBe('https://hub.example:62032/mmdvm?anchor=1');
    expect(withAnchors('https://hub.example:62032/mmdvm?x=y')).toBe('https://hub.example:62032/mmdvm?x=y&anchor=1');
  });

  it('knows the anchor question', () => {
    expect(askedForAnchors('{"ask":"anchor"}\n')).toBe(true);
    expect(askedForAnchors('{"ask":"other"}\n')).toBe(false);
    expect(askedForAnchors('garbage')).toBe(false);
  });

  it('answers with the anchors on one line', () => {
    expect(anchorAnswer([])).toBe('{"anchor":[]}\n');
    expect(anchorAnswer([{ slot: 1, stream: 7, seq: 3, first: 1 }])).toBe('{"anchor":[{"slot":1,"stream":7,"seq":3,"first":1}]}\n');
  });
});

describe('Anchors', () => {
  function took(seqs: number[], stream = 81, slot2 = false, a = new Anchors()): Anchors {
    for (const seq of seqs) {
      a.take(dmrd(seq, stream, slot2));
    }
    return a;
  }

  it('has no anchor before a burst', () => {
    expect(new Anchors().list()).toEqual([]);
  });

  it('moves on with the bursts of a stream in order', () => {
    expect(took([4, 5, 6]).list()).toEqual([{ slot: 1, stream: 81, seq: 6, first: 4 }]);
  });

  it('stays before a missing burst until it comes', () => {
    const a = took([1, 2, 5, 6]);
    expect(a.list()).toEqual([{ slot: 1, stream: 81, seq: 2, first: 1 }]);
    took([3, 4], 81, false, a);
    expect(a.list()).toEqual([{ slot: 1, stream: 81, seq: 6, first: 1 }]);
  });

  it('ignores copies, and takes an older burst only as the first', () => {
    expect(took([10, 11, 11, 9, 3]).list()).toEqual([{ slot: 1, stream: 81, seq: 11, first: 9 }]);
  });

  it('gives a missing burst up 64 bursts later', () => {
    const seqs = [0];
    for (let s = 2; s <= 65; s++) {
      seqs.push(s);
    }
    expect(took(seqs.slice(0, -1)).list()).toEqual([{ slot: 1, stream: 81, seq: 0, first: 0 }]);
    expect(took(seqs).list()).toEqual([{ slot: 1, stream: 81, seq: 65, first: 0 }]);
  });

  it('counts the sequence number round from 255 to 0', () => {
    expect(took([254, 255, 0, 1]).list()).toEqual([{ slot: 1, stream: 81, seq: 1, first: 254 }]);
  });

  it('starts again at a new stream and ignores the one before', () => {
    const a = took([1, 2, 3]);
    took([40, 41], 82, false, a);
    took([4], 81, false, a);
    expect(a.list()).toEqual([{ slot: 1, stream: 82, seq: 41, first: 40 }]);
  });

  it('tells the first burst that it took of the stream, so that a replica sends the lost start again', () => {
    expect(took([25, 26, 27]).list()).toEqual([{ slot: 1, stream: 81, seq: 27, first: 25 }]);
  });

  it('moves the first burst back with the bursts that a replica sends again', () => {
    const a = took([25, 26, 27, 22, 23]);
    expect(a.list()).toEqual([{ slot: 1, stream: 81, seq: 27, first: 25 }]);
    took([24], 81, false, a);
    expect(a.list()).toEqual([{ slot: 1, stream: 81, seq: 27, first: 22 }]);
  });

  it('counts the first burst back round from 0 to 255', () => {
    expect(took([1, 2, 0, 255]).list()).toEqual([{ slot: 1, stream: 81, seq: 2, first: 255 }]);
  });

  it('keeps an anchor for each slot', () => {
    const a = took([1, 2], 81, false);
    took([7], 90, true, a);
    expect(a.list()).toEqual([
      { slot: 1, stream: 81, seq: 2, first: 1 },
      { slot: 2, stream: 90, seq: 7, first: 7 },
    ]);
  });
});
