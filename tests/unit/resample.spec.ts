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

import { Downsampler, FRAME_SAMPLES, Resampler, toInt16, Upsampler, VOICE_RATE } from '@/radio/audio/resample';

const RATES = [11025, 16000, 22050, 44100, 48000, 96000, 192000, 47999];
const AMPLITUDE = 0.5;

function tone(rate: number, freq: number, length: number): Float32Array {
  return new Float32Array(length).map((_, i) => AMPLITUDE * Math.sin((2 * Math.PI * freq * i) / rate));
}

function voiceTone(freq: number, frames: number): Int16Array {
  return Int16Array.from(tone(VOICE_RATE, freq, frames * FRAME_SAMPLES), toInt16);
}

function upsample(rate: number, input: Int16Array): Float32Array {
  const up = new Upsampler(rate);
  const out = new Float32Array(up.maxOutput(FRAME_SAMPLES) * Math.ceil(input.length / FRAME_SAMPLES));
  let n = 0;
  for (let i = 0; i < input.length; i += FRAME_SAMPLES) {
    n += up.convert(input.subarray(i, i + FRAME_SAMPLES), out, n);
  }
  return out.subarray(0, n);
}

function downsample(rate: number, input: Float32Array, chunk = 128): Float32Array {
  const frames: Int16Array[] = [];
  const down = new Downsampler(rate, (f) => frames.push(f));
  for (let i = 0; i < input.length; i += chunk) {
    down.push(input.subarray(i, i + chunk));
  }
  return Float32Array.from(frames.flatMap((f) => Array.from(f)), (s) => s / 32767);
}

// Least-squares fit of a sinusoid at freq; returns its amplitude and the
// power of what is left.
function fit(signal: Float32Array, rate: number, freq: number): { amplitude: number; residual: number } {
  const w = (2 * Math.PI * freq) / rate;
  let ss = 0;
  let cc = 0;
  let sc = 0;
  let ys = 0;
  let yc = 0;
  for (let i = 0; i < signal.length; i++) {
    const s = Math.sin(w * i);
    const c = Math.cos(w * i);
    ss += s * s;
    cc += c * c;
    sc += s * c;
    ys += signal[i]! * s;
    yc += signal[i]! * c;
  }
  const det = ss * cc - sc * sc;
  const a = (ys * cc - yc * sc) / det;
  const b = (yc * ss - ys * sc) / det;
  let residual = 0;
  for (let i = 0; i < signal.length; i++) {
    const e = signal[i]! - a * Math.sin(w * i) - b * Math.cos(w * i);
    residual += e * e;
  }
  return { amplitude: Math.hypot(a, b), residual: residual / signal.length };
}

function db(x: number): number {
  return 20 * Math.log10(x);
}

function sweep(from: number, to: number, steps: number): number[] {
  return Array.from({ length: steps }, (_, i) => from + ((to - from) * i) / (steps - 1));
}

function noise(length: number): Float32Array {
  let x = 12345;
  return new Float32Array(length).map(() => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648 - 0.5;
  });
}

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

  it('upsamples 8 kHz to the output rate', () => {
    for (const rate of RATES) {
      const out = upsample(rate, new Int16Array(FRAME_SAMPLES * 50));
      expect(Math.abs(out.length - (FRAME_SAMPLES * 50 * rate) / VOICE_RATE)).toBeLessThanOrEqual(1);
    }
  });

  it('uses exact phases for common rates and interpolated phases otherwise', () => {
    expect(new Resampler(VOICE_RATE, 44100).exact).toBe(true);
    expect(new Resampler(48000, VOICE_RATE).exact).toBe(true);
    expect(new Resampler(VOICE_RATE, 47999).exact).toBe(false);
    expect(new Resampler(47999, VOICE_RATE).exact).toBe(false);
  });

  it.each(RATES)('rejects upsampling images by 70 dB at %i Hz', (rate) => {
    let worst = -Infinity;
    for (const freq of sweep(100, 3400, 34)) {
      const out = upsample(rate, voiceTone(freq, 20));
      const settled = out.subarray(Math.ceil((200 * rate) / VOICE_RATE));
      const { amplitude, residual } = fit(settled, rate, freq);
      worst = Math.max(worst, db(Math.sqrt(residual) / (amplitude / Math.SQRT2)));
    }
    console.log(`upsampler ${rate} Hz: images ${worst.toFixed(1)} dB`);
    expect(worst).toBeLessThan(-70);
  });

  it.each(RATES)('keeps the upsampling passband flat at %i Hz', (rate) => {
    for (const freq of sweep(100, 3400, 34)) {
      const out = upsample(rate, voiceTone(freq, 20));
      const { amplitude } = fit(out.subarray(Math.ceil((200 * rate) / VOICE_RATE)), rate, freq);
      expect(Math.abs(db(amplitude / AMPLITUDE))).toBeLessThan(0.1);
    }
  });

  it.each(RATES)('rejects downsampling aliases by 70 dB at %i Hz', (rate) => {
    let worst = -Infinity;
    for (const freq of [...sweep(4200, 4600, 9), ...sweep(4600, rate * 0.49, 40)]) {
      if (freq >= rate / 2) {
        continue;
      }
      const out = downsample(rate, tone(rate, freq, Math.round(rate / 4))).subarray(400);
      const rms = Math.sqrt(out.reduce((s, x) => s + x * x, 0) / out.length);
      worst = Math.max(worst, db(rms / (AMPLITUDE / Math.SQRT2)));
    }
    console.log(`downsampler ${rate} Hz: aliases ${worst.toFixed(1)} dB`);
    expect(worst).toBeLessThan(-70);
  });

  it.each(RATES)('keeps the downsampling passband flat at %i Hz', (rate) => {
    for (const freq of sweep(100, 3400, 34)) {
      const out = downsample(rate, tone(rate, freq, Math.round(rate / 4))).subarray(400);
      const { amplitude, residual } = fit(out, VOICE_RATE, freq);
      expect(Math.abs(db(amplitude / AMPLITUDE))).toBeLessThan(0.1);
      expect(db(Math.sqrt(residual) / (amplitude / Math.SQRT2))).toBeLessThan(-70);
    }
  });

  it.each(RATES)('upsamples frame by frame the same as all at once at %i Hz', (rate) => {
    const input = Int16Array.from(noise(FRAME_SAMPLES * 30), toInt16);
    const whole = new Upsampler(rate);
    const all = new Float32Array(whole.maxOutput(input.length));
    const n = whole.convert(input, all);
    expect(upsample(rate, input)).toEqual(all.subarray(0, n));
  });

  it.each(RATES)('downsamples quantum by quantum the same as all at once at %i Hz', (rate) => {
    const input = noise(rate);
    expect(downsample(rate, input, 128)).toEqual(downsample(rate, input, input.length));
  });

  it('starts over after reset', () => {
    const input = Int16Array.from(noise(FRAME_SAMPLES * 4), toInt16);
    const up = new Upsampler(44100);
    const first = new Float32Array(up.maxOutput(input.length));
    const second = new Float32Array(up.maxOutput(input.length));
    const n = up.convert(input, first);
    up.convert(input, second);
    up.reset();
    expect(up.convert(input, second)).toBe(n);
    expect(second.subarray(0, n)).toEqual(first.subarray(0, n));
  });
});
