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

export const VOICE_RATE = 8000;
export const FRAME_SAMPLES = 160;

const PASSBAND_HZ = 3400;
const STOPBAND_HZ = 4200;
const ATTENUATION_DB = 80;
const MAX_TABLE = 1 << 18;
const INTERPOLATED_PHASES = 256;

export function toInt16(x: number): number {
  const s = Math.round(x * 32767);
  return s > 32767 ? 32767 : s < -32768 ? -32768 : s;
}

function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 64; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) {
      break;
    }
  }
  return sum;
}

function gcd(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function ratio(inRate: number, outRate: number): [number, number] {
  const scale = Number.isInteger(inRate) && Number.isInteger(outRate) ? 1 : 1000;
  const i = Math.round(inRate * scale);
  const o = Math.round(outRate * scale);
  const g = gcd(i, o);
  return [i / g, o / g];
}

/**
 * Streaming polyphase resampler with a Kaiser-windowed sinc kernel. The
 * kernel cuts off between PASSBAND_HZ and STOPBAND_HZ, so it serves as the
 * anti-imaging filter when upsampling from VOICE_RATE and as the
 * anti-aliasing filter when downsampling to it. Rates with a small rational
 * ratio get one exact phase per output position; other rates interpolate
 * linearly between INTERPOLATED_PHASES precomputed phases.
 */
export class Resampler {
  /** Number of taps in each phase. */
  readonly taps: number;
  private readonly step: number;
  private readonly den: number;
  private readonly phases: number;
  /** Whether every output position has its own precomputed phase. */
  readonly exact: boolean;
  private readonly table: Float32Array;
  private readonly hist: Float64Array;
  private pos = 0;
  private acc = 0;

  constructor(inRate: number, outRate: number) {
    [this.step, this.den] = ratio(inRate, outRate);
    const beta = 0.1102 * (ATTENUATION_DB - 8.7);
    const width = (2 * Math.PI * (STOPBAND_HZ - PASSBAND_HZ)) / inRate;
    const taps = 2 * Math.ceil((ATTENUATION_DB - 8) / (2.285 * width) / 2 + 0.5);
    this.taps = taps;
    this.exact = this.den * taps <= MAX_TABLE;
    this.phases = this.exact ? this.den : INTERPOLATED_PHASES;
    const rows = this.exact ? this.phases : this.phases + 1;
    this.table = new Float32Array(rows * taps);
    this.hist = new Float64Array(2 * taps);

    const c = (PASSBAND_HZ + STOPBAND_HZ) / inRate;
    const half = taps / 2;
    const i0Beta = besselI0(beta);
    for (let p = 0; p < rows; p++) {
      const mu = p / this.phases;
      let sum = 0;
      for (let i = 0; i < taps; i++) {
        const t = mu + half - 1 - i;
        const r = t / half;
        const w = r * r < 1 ? besselI0(beta * Math.sqrt(1 - r * r)) / i0Beta : 0;
        const x = Math.PI * c * t;
        const h = c * (x === 0 ? 1 : Math.sin(x) / x) * w;
        this.table[p * taps + i] = h;
        sum += h;
      }
      for (let i = 0; i < taps; i++) {
        this.table[p * taps + i] = this.table[p * taps + i]! / sum;
      }
    }
  }

  /** Upper bound on the output count of one process() call with n inputs. */
  maxOutput(n: number): number {
    return Math.ceil((n * this.den) / this.step) + 1;
  }

  /**
   * Resamples input[start, end) scaled by gain, writes the result to out
   * starting at outStart, and returns the number of samples written. out
   * must have room for maxOutput(end - start) samples.
   */
  process(input: ArrayLike<number>, start: number, end: number, gain: number, out: Float32Array, outStart = 0): number {
    const taps = this.taps;
    const hist = this.hist;
    const table = this.table;
    const den = this.den;
    let n = outStart;
    for (let k = start; k < end; k++) {
      const x = input[k]! * gain;
      hist[this.pos] = x;
      hist[this.pos + taps] = x;
      this.pos = this.pos + 1 === taps ? 0 : this.pos + 1;
      const base = this.pos;
      while (this.acc < den) {
        if (this.exact) {
          const row = this.acc * taps;
          let s = 0;
          for (let i = 0; i < taps; i++) {
            s += hist[base + i]! * table[row + i]!;
          }
          out[n++] = s;
        } else {
          const f = (this.acc * this.phases) / den;
          const p = Math.floor(f);
          const row = p * taps;
          let s0 = 0;
          let s1 = 0;
          for (let i = 0; i < taps; i++) {
            const h = hist[base + i]!;
            s0 += h * table[row + i]!;
            s1 += h * table[row + taps + i]!;
          }
          out[n++] = s0 + (f - p) * (s1 - s0);
        }
        this.acc += this.step;
      }
      this.acc -= den;
    }
    return n - outStart;
  }

  reset(): void {
    this.hist.fill(0);
    this.pos = 0;
    this.acc = 0;
  }
}

const CAPTURE_CHUNK = 256;

/** Converts microphone audio at the context rate into 8 kHz int16 frames. */
export class Downsampler {
  private readonly resampler: Resampler;
  private readonly scratch: Float32Array;
  private frame = new Int16Array(FRAME_SAMPLES);
  private filled = 0;

  constructor(
    inputRate: number,
    private readonly onFrame: (frame: Int16Array) => void,
  ) {
    this.resampler = new Resampler(inputRate, VOICE_RATE);
    this.scratch = new Float32Array(this.resampler.maxOutput(CAPTURE_CHUNK));
  }

  push(input: Float32Array, gain = 1): void {
    for (let start = 0; start < input.length; start += CAPTURE_CHUNK) {
      const end = Math.min(input.length, start + CAPTURE_CHUNK);
      const n = this.resampler.process(input, start, end, gain, this.scratch);
      for (let i = 0; i < n; i++) {
        this.frame[this.filled++] = toInt16(this.scratch[i]!);
        if (this.filled === FRAME_SAMPLES) {
          this.onFrame(this.frame);
          this.frame = new Int16Array(FRAME_SAMPLES);
          this.filled = 0;
        }
      }
    }
  }

  reset(): void {
    this.resampler.reset();
    this.filled = 0;
    this.frame = new Int16Array(FRAME_SAMPLES);
  }
}

/** Converts 8 kHz int16 audio into float samples at the output rate. */
export class Upsampler {
  private readonly resampler: Resampler;

  constructor(outputRate: number) {
    this.resampler = new Resampler(VOICE_RATE, outputRate);
  }

  /** Upper bound on the output count of one convert() call with n samples. */
  maxOutput(n: number): number {
    return this.resampler.maxOutput(n);
  }

  /**
   * Writes the converted samples to out starting at outStart and returns
   * how many it wrote. out must have room for maxOutput(samples.length).
   */
  convert(samples: Int16Array, out: Float32Array, outStart = 0): number {
    return this.resampler.process(samples, 0, samples.length, 1 / 32768, out, outStart);
  }

  reset(): void {
    this.resampler.reset();
  }
}
