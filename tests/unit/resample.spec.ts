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

import { Downsampler, FRAME_SAMPLES, toInt16, Upsampler } from '@/radio/audio/resample';

describe('resample', () => {
  it('clamps to 16 bits', () => {
    expect(toInt16(2)).toBe(32767);
    expect(toInt16(-2)).toBe(-32768);
    expect(toInt16(0)).toBe(0);
  });

  it('turns 48 kHz into 160-sample frames at 8 kHz', () => {
    const frames: Int16Array[] = [];
    const d = new Downsampler(48000, (f) => frames.push(f));
    d.push(new Float32Array(48000));
    expect(frames).toHaveLength(8000 / FRAME_SAMPLES);
    expect(frames.every((f) => f.length === FRAME_SAMPLES)).toBe(true);
  });

  it('keeps a voice-band tone and its level', () => {
    const frames: Int16Array[] = [];
    const d = new Downsampler(48000, (f) => frames.push(f));
    const tone = new Float32Array(48000).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / 48000));
    d.push(tone);
    const tail = frames.slice(10).flatMap((f) => Array.from(f));
    const peak = Math.max(...tail.map(Math.abs));
    expect(peak).toBeGreaterThan(0.4 * 32767);
    expect(peak).toBeLessThan(0.6 * 32767);
  });

  it('upsamples 8 kHz to 48 kHz', () => {
    const out: number[] = [];
    new Upsampler(48000).convert(new Int16Array(FRAME_SAMPLES), out);
    expect(Math.abs(out.length - FRAME_SAMPLES * 6)).toBeLessThanOrEqual(1);
  });
});
