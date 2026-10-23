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

export type DatagramWriter = {
  write: (data: Uint8Array) => Promise<void>;
  release: () => void;
};

type DatagramDuplex = {
  readable: ReadableStream<Uint8Array>;
  writable?: WritableStream<Uint8Array>;
  createWritable?: () => WritableStream<Uint8Array>;
};

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

export function endpointURL(host: string, port: number, path: string): string {
  const cleanHost = host.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const portPart = port === 443 ? '' : `:${port}`;
  return `https://${cleanHost}${portPart}${cleanPath}`;
}

export type TransportHandlers = {
  onDatagram: (data: Uint8Array) => void;
  onClosed: (reason: string) => void;
};

type WebTransportLike = {
  ready: Promise<void>;
  closed: Promise<unknown>;
  datagrams: DatagramDuplex;
  close: (info?: { closeCode?: number; reason?: string }) => void;
};

type CertificateHash = { algorithm: 'sha-256'; value: Uint8Array };

type WebTransportConstructor = new (
  url: string,
  options?: { serverCertificateHashes?: CertificateHash[] },
) => WebTransportLike;

export function certificateHashes(hex: string[]): CertificateHash[] {
  return hex
    .filter((h) => /^[0-9a-f]{64}$/i.test(h))
    .map((h) => ({ algorithm: 'sha-256', value: Uint8Array.from(h.match(/../g)!, (b) => parseInt(b, 16)) }));
}

export class Transport {
  private wt: WebTransportLike | null = null;
  private writer: DatagramWriter | null = null;
  private closing = false;

  constructor(private readonly handlers: TransportHandlers) {}

  async connect(url: string, hashes: string[] = []): Promise<void> {
    const ctor = (globalThis as unknown as { WebTransport?: WebTransportConstructor }).WebTransport;
    if (!ctor) {
      throw new Error('This browser does not support WebTransport');
    }
    this.closing = false;
    const serverCertificateHashes = certificateHashes(hashes);
    const wt = new ctor(url, serverCertificateHashes.length ? { serverCertificateHashes } : undefined);
    this.wt = wt;
    wt.closed.then(
      () => this.closed('closed by the hub'),
      (err: unknown) => this.closed(err instanceof Error ? err.message : String(err)),
    );
    await wt.ready;
    this.writer = datagramWriter(wt.datagrams);
    void this.read(wt.datagrams.readable);
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

  private closed(reason: string): void {
    this.writer = null;
    this.wt = null;
    if (!this.closing) {
      this.handlers.onClosed(reason);
    }
  }
}
