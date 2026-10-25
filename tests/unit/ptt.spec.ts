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

import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RadioClient } from '@/radio/client';
import type { FromWorker } from '@/radio/protocol';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

class FakeWorker {
  static last: FakeWorker | null = null;
  posted: unknown[] = [];
  constructor() {
    FakeWorker.last = this;
  }
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
  terminate(): void {}
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function pttPosts(w: FakeWorker): boolean[] {
  return w.posted.filter((m): m is { type: 'ptt'; on: boolean } => (m as { type: string }).type === 'ptt').map((m) => m.on);
}

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('navigator', { ...navigator, permissions: { query: () => Promise.resolve({ state: 'granted' }) } });
  setActivePinia(createPinia());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RadioClient.ptt', () => {
  it('does not key up when released while the microphone opens', async () => {
    const mic = deferred();
    vi.spyOn(RadioClient.prototype, 'microphone').mockReturnValue(mic.promise);
    const client = new RadioClient(() => {});
    const worker = (client as unknown as { worker: FakeWorker }).worker;
    let held = true;
    const down = client.ptt(true, 2, true, 9990, () => held);
    held = false;
    await client.ptt(false, 2, true, 9990);
    mic.resolve();
    await down;
    expect(pttPosts(worker)).toEqual([false]);
  });
});

describe('RadioClient.microphone', () => {
  it('shares one open between overlapping calls', async () => {
    const mic = deferred();
    const open = vi.spyOn(RadioClient.prototype as unknown as { openMicrophone: () => Promise<void> }, 'openMicrophone').mockReturnValue(mic.promise);
    const client = new RadioClient(() => {});
    const a = client.microphone();
    const b = client.microphone();
    mic.resolve();
    await Promise.all([a, b]);
    expect(open).toHaveBeenCalledTimes(1);
    await client.microphone();
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe('radio store PTT', () => {
  function connected(): { radio: ReturnType<typeof useRadio>; worker: () => FakeWorker; emit: (m: FromWorker) => void } {
    const settings = useSettings();
    settings.settings.hotspot.id = 3191868;
    settings.settings.hotspot.password = 'x';
    const radio = useRadio();
    radio.init();
    const worker = FakeWorker.last!;
    const emit = (m: FromWorker) => worker.onmessage!({ data: m } as MessageEvent);
    emit({ type: 'link', state: 'up', detail: '', attempt: 0, retryInMs: 0 } as FromWorker);
    return { radio, worker: () => worker, emit };
  }

  it('a quick tap in hold mode never leaves the transmitter keyed', async () => {
    const mic = deferred();
    vi.spyOn(RadioClient.prototype, 'microphone').mockReturnValue(mic.promise);
    const { radio, worker } = connected();
    const down = radio.pttDown();
    expect(radio.keyed).toBe(true);
    radio.pttUp();
    expect(radio.keyed).toBe(false);
    mic.resolve();
    await down;
    expect(pttPosts(worker())).toEqual([false]);
  });

  it('clears the keyed state when the transmission ends on its own', async () => {
    vi.spyOn(RadioClient.prototype, 'microphone').mockResolvedValue();
    const { radio, worker, emit } = connected();
    await radio.pttDown();
    expect(pttPosts(worker())).toEqual([true]);
    emit({ type: 'event', event: { kind: 'transmitStart', slot: 2, target: 9990, group: true, vocoder: 'codec2' } } as unknown as FromWorker);
    expect(radio.tx.active).toBe(true);
    emit({ type: 'event', event: { kind: 'transmitEnd', slot: 2, reason: 'time-out' } } as unknown as FromWorker);
    expect(radio.tx.active).toBe(false);
    expect(radio.keyed).toBe(false);
  });

  it('keys once when a second press lands while the microphone opens', async () => {
    const mic = deferred();
    vi.spyOn(RadioClient.prototype, 'microphone').mockReturnValue(mic.promise);
    const { radio, worker } = connected();
    const first = radio.pttDown();
    radio.pttUp();
    const second = radio.pttDown();
    mic.resolve();
    await Promise.all([first, second]);
    expect(pttPosts(worker())).toEqual([false, true]);
  });

  it('clears the keyed state when the radio refuses to key up', async () => {
    vi.spyOn(RadioClient.prototype, 'microphone').mockResolvedValue();
    const { radio, emit } = connected();
    await radio.pttDown();
    expect(radio.keyed).toBe(true);
    emit({ type: 'ptt', ok: false, error: 'no AMBE module' } as FromWorker);
    expect(radio.keyed).toBe(false);
  });
});
