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

import { FRAME_SAMPLES, Upsampler } from './resample';

/** Audio to queue before a slot starts or restarts playing. */
export const PREBUFFER_SECONDS = 0.12;
/** Queued audio above which a slot drops its queue. */
export const MAX_BUFFERED_SECONDS = 2;

/**
 * Playback queue of one slot. It upsamples 8 kHz frames into a ring at the
 * output rate and holds them until PREBUFFER_SECONDS are queued, so that
 * bursts that arrive late do not cut the audio. When the queue runs dry it
 * waits for the prebuffer again. When no audio arrives for the prebuffer
 * time, it plays what is left, so short transmissions and call tails play.
 */
export class JitterBuffer {
  private readonly up: Upsampler;
  private readonly ring: Float32Array;
  private readonly scratch: Float32Array;
  private readonly silence = new Int16Array(FRAME_SAMPLES);
  private readonly prebuffer: number;
  private readonly cap: number;
  private read = 0;
  private level = 0;
  private active = false;
  private idle = 0;
  private flushed = true;

  constructor(rate: number) {
    this.up = new Upsampler(rate);
    this.prebuffer = Math.round(rate * PREBUFFER_SECONDS);
    this.cap = Math.round(rate * MAX_BUFFERED_SECONDS);
    this.scratch = new Float32Array(this.up.maxOutput(FRAME_SAMPLES));
    this.ring = new Float32Array(this.cap + this.scratch.length);
  }

  /** Samples queued at the output rate. */
  get buffered(): number {
    return this.level;
  }

  /** Whether the slot plays, as opposed to waiting for the prebuffer. */
  get playing(): boolean {
    return this.active;
  }

  push(samples: Int16Array): void {
    this.idle = 0;
    this.flushed = false;
    this.write(samples);
  }

  /** Adds the next out.length samples, scaled by gain, to out. */
  mix(out: Float32Array, gain: number): void {
    if (!this.active) {
      if (this.level > 0 && this.idle >= this.prebuffer && !this.flushed) {
        this.flushed = true;
        this.write(this.silence);
      }
      if (this.level < this.prebuffer && !(this.flushed && this.level > 0)) {
        this.idle += out.length;
        return;
      }
      this.active = true;
    }
    const n = Math.min(out.length, this.level);
    const ring = this.ring;
    let r = this.read;
    for (let i = 0; i < n; i++) {
      out[i] = out[i]! + ring[r]! * gain;
      r = r + 1 === ring.length ? 0 : r + 1;
    }
    this.read = r;
    this.level -= n;
    if (n < out.length) {
      this.active = false;
      this.idle = out.length - n;
    }
  }

  private write(samples: Int16Array): void {
    for (let start = 0; start < samples.length; start += FRAME_SAMPLES) {
      if (this.level > this.cap) {
        this.level = 0;
        this.active = false;
      }
      const chunk = samples.length <= FRAME_SAMPLES ? samples : samples.subarray(start, start + FRAME_SAMPLES);
      const n = this.up.convert(chunk, this.scratch);
      const ring = this.ring;
      let w = this.read + this.level;
      if (w >= ring.length) {
        w -= ring.length;
      }
      for (let i = 0; i < n; i++) {
        ring[w] = this.scratch[i]!;
        w = w + 1 === ring.length ? 0 : w + 1;
      }
      this.level += n;
    }
  }
}
