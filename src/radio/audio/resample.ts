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

export class Biquad {
  private b0: number;
  private b1: number;
  private b2: number;
  private a1: number;
  private a2: number;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(rate: number, cutoff: number, q = Math.SQRT1_2) {
    const w = (2 * Math.PI * Math.min(cutoff, rate * 0.45)) / rate;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    const a0 = 1 + alpha;
    this.b0 = (1 - cos) / 2 / a0;
    this.b1 = (1 - cos) / a0;
    this.b2 = (1 - cos) / 2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

export function toInt16(x: number): number {
  const s = Math.round(x * 32767);
  return s > 32767 ? 32767 : s < -32768 ? -32768 : s;
}

export class Downsampler {
  private readonly step: number;
  private readonly lowpass: Biquad;
  private readonly secondPass: Biquad;
  private pos = 0;
  private prev = 0;
  private frame = new Int16Array(FRAME_SAMPLES);
  private filled = 0;

  constructor(
    inputRate: number,
    private readonly onFrame: (frame: Int16Array) => void,
  ) {
    this.step = inputRate / VOICE_RATE;
    this.lowpass = new Biquad(inputRate, 3400);
    this.secondPass = new Biquad(inputRate, 3400);
  }

  push(input: Float32Array, gain = 1): void {
    for (let i = 0; i < input.length; i++) {
      const cur = this.secondPass.process(this.lowpass.process(input[i]! * gain));
      while (this.pos <= 1) {
        const v = this.prev + (cur - this.prev) * this.pos;
        this.frame[this.filled++] = toInt16(v);
        if (this.filled === FRAME_SAMPLES) {
          this.onFrame(this.frame);
          this.frame = new Int16Array(FRAME_SAMPLES);
          this.filled = 0;
        }
        this.pos += this.step;
      }
      this.pos -= 1;
      this.prev = cur;
    }
  }

  reset(): void {
    this.pos = 0;
    this.prev = 0;
    this.filled = 0;
    this.frame = new Int16Array(FRAME_SAMPLES);
  }
}

export class Upsampler {
  private readonly step: number;
  private pos = 0;
  private prev = 0;

  constructor(outputRate: number) {
    this.step = VOICE_RATE / outputRate;
  }

  convert(samples: Int16Array, out: number[]): void {
    for (let i = 0; i < samples.length; i++) {
      const cur = samples[i]! / 32768;
      while (this.pos <= 1) {
        out.push(this.prev + (cur - this.prev) * this.pos);
        this.pos += this.step;
      }
      this.pos -= 1;
      this.prev = cur;
    }
  }
}
