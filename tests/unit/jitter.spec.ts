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

import { JitterBuffer, MAX_BUFFERED_SECONDS, PREBUFFER_SECONDS } from '@/radio/audio/jitter';
import { FRAME_SAMPLES } from '@/radio/audio/resample';

const RATE = 48000;
const QUANTUM = 128;
const LEVEL = 0.5;
const BURST_MS = 60;

function at(ms: number): number {
  return Math.round((ms * RATE) / 1000);
}

function frame(): Int16Array {
  return new Int16Array(FRAME_SAMPLES).fill(LEVEL * 32768);
}

// Plays bursts of three frames that arrive at the given times, one render
// quantum at a time, and returns the output.
function simulate(arrivals: number[], durationMs: number, jb = new JitterBuffer(RATE)): Float32Array {
  const out = new Float32Array(Math.ceil(at(durationMs) / QUANTUM) * QUANTUM);
  let next = 0;
  for (let t = 0; t < out.length; t += QUANTUM) {
    while (next < arrivals.length && at(arrivals[next]!) <= t) {
      for (let f = 0; f < 3; f++) {
        jb.push(frame());
      }
      next++;
    }
    jb.mix(out.subarray(t, t + QUANTUM), 1);
  }
  return out;
}

function silent(out: Float32Array, fromMs: number, toMs: number): boolean {
  return out.subarray(at(fromMs), at(toMs)).every((x) => x === 0);
}

function steady(out: Float32Array, fromMs: number, toMs: number): boolean {
  return out.subarray(at(fromMs), at(toMs)).every((x) => Math.abs(x - LEVEL) < 0.01);
}

describe('jitter buffer', () => {
  it('waits for the prebuffer before it plays', () => {
    expect(PREBUFFER_SECONDS * 1000).toBe(2 * BURST_MS);
    const out = simulate([0, 60, 120], 300);
    expect(silent(out, 0, 60)).toBe(true);
    expect(steady(out, 70, 60 + 180)).toBe(true);
  });

  it('plays without gaps while bursts arrive up to 50 ms late', () => {
    const late = [0, 50, 10, 45, 0, 30, 50, 5, 40, 20, 50, 0, 35, 50, 15, 25, 50, 0, 45, 10];
    const arrivals: number[] = [];
    late.forEach((l, k) => arrivals.push(Math.max(arrivals[k - 1] ?? 0, k * BURST_MS + l)));
    const jb = new JitterBuffer(RATE);
    const out = simulate(arrivals, 2000, jb);
    const start = arrivals[1]! + 10;
    expect(silent(out, 0, arrivals[1]!)).toBe(true);
    expect(steady(out, start, arrivals[1]! + late.length * BURST_MS - 5)).toBe(true);
  });

  it('waits for the prebuffer again after it runs dry', () => {
    const jb = new JitterBuffer(RATE);
    const out = simulate([0, 60, 120, 1000, 1060, 1120], 1400, jb);
    expect(steady(out, 70, 230)).toBe(true);
    expect(silent(out, 245, 1060)).toBe(true);
    expect(steady(out, 1070, 1230)).toBe(true);
    expect(jb.playing).toBe(false);
    expect(jb.buffered).toBe(0);
  });

  it('plays a short transmission after the prebuffer time without audio', () => {
    const jb = new JitterBuffer(RATE);
    const out = new Float32Array(at(300));
    jb.push(frame());
    for (let t = 0; t < out.length; t += QUANTUM) {
      jb.mix(out.subarray(t, t + QUANTUM), 1);
    }
    expect(silent(out, 0, 120)).toBe(true);
    const played = out.subarray(at(120), at(160));
    expect(played.filter((x) => Math.abs(x - LEVEL) < 0.01).length).toBeGreaterThan(at(15));
    expect(silent(out, 170, 300)).toBe(true);
  });

  it('drops the queue above the cap', () => {
    const jb = new JitterBuffer(RATE);
    for (let i = 0; i < 150; i++) {
      jb.push(frame());
    }
    expect(jb.buffered).toBeLessThanOrEqual(RATE * MAX_BUFFERED_SECONDS + at(20));
    expect(jb.buffered).toBeGreaterThan(0);
  });
});
