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

import captureURL from './audio/capture.worklet.ts?worker&url';
import playbackURL from './audio/playback.worklet.ts?worker&url';
import type { FromWorker, Here, RadioConfig, ToWorker, VocoderChoice } from './protocol';

export type MicOptions = {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  deviceId?: string;
};

export class RadioClient {
  private readonly worker: Worker;
  private ctx: AudioContext | null = null;
  private capture: AudioWorkletNode | null = null;
  private playback: AudioWorkletNode | null = null;
  private mic: MediaStream | null = null;
  private opening: Promise<void> | null = null;
  private micOptions: MicOptions = { echoCancellation: true, noiseSuppression: true, autoGainControl: false };
  private gainDb = 0;
  private volume = 0.6;
  private outputId = '';

  constructor(private readonly onMessage: (msg: FromWorker) => void, private readonly onLevel?: (level: number) => void) {
    this.worker = new Worker(new URL('./radio.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onMessage(e.data);
    this.worker.onerror = (e) => this.onMessage({ type: 'fatal', error: e.message || 'the radio worker failed' });
  }

  private post(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }

  async audio(): Promise<AudioContext> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return this.ctx;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.audioWorklet.addModule(captureURL);
    await ctx.audioWorklet.addModule(playbackURL);
    const playback = new AudioWorkletNode(ctx, 'dmr-playback', { numberOfInputs: 0, outputChannelCount: [1] });
    playback.connect(ctx.destination);
    const toPlayback = new MessageChannel();
    playback.port.postMessage({ type: 'port', port: toPlayback.port1 }, [toPlayback.port1]);
    this.post({ type: 'playbackPort', port: toPlayback.port2 }, [toPlayback.port2]);
    playback.port.postMessage({ type: 'volume', value: this.volume });
    this.ctx = ctx;
    this.playback = playback;
    if (this.outputId) {
      await this.setOutput(this.outputId);
    }
    return ctx;
  }

  /** Opens the microphone once. Calls made while it opens share that attempt. */
  microphone(): Promise<void> {
    this.opening ??= this.openMicrophone().finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  private async openMicrophone(): Promise<void> {
    const ctx = await this.audio();
    if (this.mic && this.capture) {
      return;
    }
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: this.micOptions.echoCancellation,
        noiseSuppression: this.micOptions.noiseSuppression,
        autoGainControl: this.micOptions.autoGainControl,
        deviceId: this.micOptions.deviceId ? { exact: this.micOptions.deviceId } : undefined,
      },
    });
    const capture = new AudioWorkletNode(ctx, 'dmr-capture', { numberOfOutputs: 0 });
    ctx.createMediaStreamSource(mic).connect(capture);
    const toWorker = new MessageChannel();
    capture.port.postMessage({ type: 'port', port: toWorker.port1 }, [toWorker.port1]);
    this.post({ type: 'capturePort', port: toWorker.port2 }, [toWorker.port2]);
    capture.port.postMessage({ type: 'gain', db: this.gainDb });
    capture.port.onmessage = (e: MessageEvent<{ type: string; level: number }>) => {
      if (e.data.type === 'level') {
        this.onLevel?.(e.data.level);
      }
    };
    this.mic = mic;
    this.capture = capture;
  }

  connect(config: RadioConfig): void {
    this.post({ type: 'connect', config });
  }

  sendText(msg: Omit<Extract<ToWorker, { type: 'sendText' }>, 'type'>): void {
    this.post({ type: 'sendText', ...msg });
  }

  check(msg: Omit<Extract<ToWorker, { type: 'check' }>, 'type'>): void {
    this.post({ type: 'check', ...msg });
  }

  requestLocation(msg: Omit<Extract<ToWorker, { type: 'requestLocation' }>, 'type'>): void {
    this.post({ type: 'requestLocation', ...msg });
  }

  sendData(msg: Omit<Extract<ToWorker, { type: 'sendData' }>, 'type'>): void {
    this.post({ type: 'sendData', ...msg });
  }

  setLocation(here: Here | null, share: boolean): void {
    this.post({ type: 'setLocation', here, share });
  }

  setLocationServer(server: number): void {
    this.post({ type: 'setLocationServer', server });
  }

  setReporting(intervalMs: number): void {
    this.post({ type: 'setReporting', intervalMs });
  }

  reportLocation(id: number): void {
    this.post({ type: 'reportLocation', id });
  }

  disconnect(): void {
    this.post({ type: 'disconnect' });
  }

  /** Keys or unkeys the transmitter. keep is checked after the microphone opens, so a release during that wait never keys up. */
  async ptt(on: boolean, slot: number, group: boolean, target: number, keep: () => boolean = () => true): Promise<void> {
    if (on) {
      await this.microphone();
      if (!keep()) {
        return;
      }
      this.capture?.port.postMessage({ type: 'active', active: true });
    } else {
      this.capture?.port.postMessage({ type: 'active', active: false });
    }
    this.post({ type: 'ptt', on, slot, group, target });
  }

  loadAmbe(bytes: Uint8Array): void {
    const copy = bytes.slice();
    this.post({ type: 'ambe', bytes: copy }, [copy.buffer]);
  }

  removeAmbe(): void {
    this.post({ type: 'ambeRemove' });
  }

  setVocoder(value: VocoderChoice): void {
    this.post({ type: 'vocoder', value });
  }

  setVolume(value: number): void {
    this.volume = value;
    this.playback?.port.postMessage({ type: 'volume', value });
  }

  async setOutput(id: string): Promise<void> {
    this.outputId = id;
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (ctx?.setSinkId) {
      await ctx.setSinkId(id).catch(() => undefined);
    }
  }

  setMicGain(db: number): void {
    this.gainDb = db;
    this.capture?.port.postMessage({ type: 'gain', db });
  }

  async setMicOptions(options: MicOptions): Promise<void> {
    const same = JSON.stringify(options) === JSON.stringify(this.micOptions);
    this.micOptions = options;
    if (this.mic && !same) {
      this.mic.getTracks().forEach((t) => t.stop());
      this.capture?.disconnect();
      this.mic = null;
      this.capture = null;
      await this.microphone();
    }
  }
}
