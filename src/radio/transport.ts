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

import type { CertificateHash } from './discover';
import { drainToken, resumeRequest, resumed } from './handoff';

export type DatagramWriter = {
  write: (data: Uint8Array) => Promise<void>;
  release: () => void;
};

type DatagramDuplex = {
  readable: ReadableStream<Uint8Array>;
  writable?: WritableStream<Uint8Array>;
  createWritable?: () => WritableStream<Uint8Array>;
  incomingMaxBufferedDatagrams?: number;
  incomingHighWaterMark?: number;
};

/**
 * INCOMING_DATAGRAMS is how many datagrams a session keeps until the
 * radio reads them. Browsers keep only a few by default (Chromium one,
 * Firefox five) and drop the oldest, but a hub replica sends the bursts of
 * a handover 2 ms apart.
 */
const INCOMING_DATAGRAMS = 1024;

function keepIncoming(datagrams: DatagramDuplex): void {
  if ('incomingMaxBufferedDatagrams' in datagrams) {
    datagrams.incomingMaxBufferedDatagrams = INCOMING_DATAGRAMS;
  } else if ('incomingHighWaterMark' in datagrams) {
    datagrams.incomingHighWaterMark = INCOMING_DATAGRAMS;
  }
}

export function datagramWriter(datagrams: DatagramDuplex): DatagramWriter {
  const stream =
    typeof datagrams.createWritable === 'function'
      ? datagrams.createWritable()
      : datagrams.writable;
  if (!stream) {
    throw new Error('This browser cannot send WebTransport datagrams');
  }
  const writer = stream.getWriter();
  return {
    write: (data) => writer.write(data),
    release: () => writer.releaseLock(),
  };
}

export function webTransportSupported(): boolean {
  return typeof (globalThis as { WebTransport?: unknown }).WebTransport === 'function';
}

export type TransportHandlers = {
  onDatagram: (data: Uint8Array) => void;
  onClosed: (reason: string) => void;
  /** onDrain gets the resume token of a hub replica that stops. */
  onDrain?: (token: string) => void;
};

type BidirectionalStream = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

type WebTransportLike = {
  ready: Promise<void>;
  closed: Promise<unknown>;
  datagrams: DatagramDuplex;
  close: (info?: { closeCode?: number; reason?: string }) => void;
  incomingUnidirectionalStreams?: ReadableStream<ReadableStream<Uint8Array>>;
  createBidirectionalStream?: () => Promise<BidirectionalStream>;
};

/** MAX_CONTROL is the longest control message, in octets. */
const MAX_CONTROL = 4096;

async function readText(readable: ReadableStream<Uint8Array>): Promise<string> {
  const reader = readable.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done || !value) {
        break;
      }
      parts.push(value);
      size += value.length;
      if (size >= MAX_CONTROL || value.includes(0x0a)) {
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(Math.min(size, MAX_CONTROL));
  let at = 0;
  for (const p of parts) {
    const n = Math.min(p.length, all.length - at);
    all.set(p.subarray(0, n), at);
    at += n;
  }
  return new TextDecoder().decode(all);
}

type WebTransportConstructor = new (
  url: string,
  options?: { serverCertificateHashes?: CertificateHash[] },
) => WebTransportLike;

export class Transport {
  private wt: WebTransportLike | null = null;
  private writer: DatagramWriter | null = null;
  private closing = false;

  constructor(private readonly handlers: TransportHandlers) {}

  async connect(url: string, hashes: CertificateHash[] = []): Promise<void> {
    const ctor = (globalThis as unknown as { WebTransport?: WebTransportConstructor }).WebTransport;
    if (!ctor) {
      throw new Error('This browser does not support WebTransport');
    }
    this.closing = false;
    const wt = new ctor(url, hashes.length ? { serverCertificateHashes: hashes } : undefined);
    this.wt = wt;
    keepIncoming(wt.datagrams);
    wt.closed.then(
      () => this.closed('closed by the hub'),
      (err: unknown) => this.closed(err instanceof Error ? err.message : String(err)),
    );
    await wt.ready;
    this.writer = datagramWriter(wt.datagrams);
    void this.read(wt.datagrams.readable);
    if (wt.incomingUnidirectionalStreams) {
      void this.control(wt.incomingUnidirectionalStreams);
    }
  }

  /**
   * resume asks the hub replica of this session to take over the login
   * that token names, and reports whether it did.
   */
  async resume(token: string): Promise<boolean> {
    const wt = this.wt;
    if (!wt?.createBidirectionalStream) {
      return false;
    }
    const stream = await wt.createBidirectionalStream();
    const writer = stream.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(resumeRequest(token)));
      await writer.close();
    } finally {
      writer.releaseLock();
    }
    return resumed(await readText(stream.readable));
  }

  send(data: Uint8Array): void {
    if (!this.writer) {
      return;
    }
    this.writer.write(data).catch(() => undefined);
  }

  close(): void {
    this.closing = true;
    this.writer?.release();
    this.writer = null;
    this.wt?.close({ closeCode: 0, reason: 'closed by the radio' });
    this.wt = null;
  }

  private async read(readable: ReadableStream<Uint8Array>): Promise<void> {
    const reader = readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          return;
        }
        if (value) {
          this.handlers.onDatagram(value);
        }
      }
    } catch {
      return;
    } finally {
      reader.releaseLock();
    }
  }

  private async control(streams: ReadableStream<ReadableStream<Uint8Array>>): Promise<void> {
    const reader = streams.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          return;
        }
        if (value) {
          void readText(value).then((text) => {
            const token = drainToken(text);
            if (token) {
              this.handlers.onDrain?.(token);
            }
          });
        }
      }
    } catch {
      return;
    } finally {
      reader.releaseLock();
    }
  }

  private closed(reason: string): void {
    this.writer = null;
    this.wt = null;
    if (!this.closing) {
      this.handlers.onClosed(reason);
    }
  }
}
