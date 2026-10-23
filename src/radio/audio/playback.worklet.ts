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

import type { PlaybackMessage } from '../protocol';
import { Upsampler } from './resample';

type PlaybackControl = { type: 'volume'; value: number } | { type: 'port'; port: MessagePort };

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: unknown): void;

const MAX_BUFFERED_SECONDS = 2;

class PlaybackProcessor extends AudioWorkletProcessor {
  private readonly queues = new Map<number, { up: Upsampler; samples: number[]; read: number }>();
  private volume = 0.6;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<PlaybackControl>) => {
      const msg = e.data;
      if (msg.type === 'volume') {
        this.volume = Math.max(0, Math.min(1, msg.value));
      } else {
        msg.port.onmessage = (m: MessageEvent<PlaybackMessage>) => this.enqueue(m.data);
      }
    };
  }

  private enqueue(msg: PlaybackMessage): void {
    let q = this.queues.get(msg.slot);
    if (!q) {
      q = { up: new Upsampler(sampleRate), samples: [], read: 0 };
      this.queues.set(msg.slot, q);
    }
    if (q.read > 0) {
      q.samples = q.samples.slice(q.read);
      q.read = 0;
    }
    if (q.samples.length > sampleRate * MAX_BUFFERED_SECONDS) {
      q.samples = [];
    }
    q.up.convert(msg.samples, q.samples);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) {
      return true;
    }
    const ch = out[0]!;
    ch.fill(0);
    for (const q of this.queues.values()) {
      for (let i = 0; i < ch.length && q.read < q.samples.length; i++) {
        ch[i] = ch[i]! + q.samples[q.read++]! * this.volume;
      }
    }
    for (let i = 0; i < ch.length; i++) {
      ch[i] = Math.max(-1, Math.min(1, ch[i]!));
    }
    for (let c = 1; c < out.length; c++) {
      out[c]!.set(ch);
    }
    return true;
  }
}

registerProcessor('dmr-playback', PlaybackProcessor);
