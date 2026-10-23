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

import { Downsampler } from './resample';

type CaptureControl = { type: 'active'; active: boolean } | { type: 'gain'; db: number } | { type: 'port'; port: MessagePort };

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: unknown): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private out: MessagePort | null = null;
  private active = false;
  private gain = 1;
  private level = 0;
  private levelFrames = 0;
  private readonly down: Downsampler;

  constructor() {
    super();
    this.down = new Downsampler(sampleRate, (frame) => {
      this.out?.postMessage(frame, [frame.buffer]);
    });
    this.port.onmessage = (e: MessageEvent<CaptureControl>) => {
      const msg = e.data;
      if (msg.type === 'port') {
        this.out = msg.port;
      } else if (msg.type === 'active') {
        this.active = msg.active;
        if (!msg.active) {
          this.down.reset();
        }
      } else {
        this.gain = 10 ** (msg.db / 20);
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input) {
      return true;
    }
    let peak = 0;
    for (let i = 0; i < input.length; i++) {
      peak = Math.max(peak, Math.abs(input[i]! * this.gain));
    }
    this.level = Math.max(peak, this.level * 0.95);
    if (++this.levelFrames >= 8) {
      this.levelFrames = 0;
      this.port.postMessage({ type: 'level', level: this.level });
    }
    if (this.active) {
      this.down.push(input, this.gain);
    }
    return true;
  }
}

registerProcessor('dmr-capture', CaptureProcessor);
