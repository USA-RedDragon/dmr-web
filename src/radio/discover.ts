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
export type CertificateHash = { algorithm: 'sha-256'; value: Uint8Array };

export type HubEndpoint = { url: string; hashes: CertificateHash[] };

type Answer = {
  enabled?: boolean;
  port?: number;
  path?: string;
  certificate_hashes?: { algorithm?: string; value?: string }[];
};

export class HubRefusedError extends Error {}

export function hubOrigin(host: string): URL {
  const h = host.trim().replace(/\/+$/, '');
  return new URL(/^https?:\/\//.test(h) ? h : `https://${h}`);
}

export function certificateHashes(list: Answer['certificate_hashes']): CertificateHash[] {
  const out: CertificateHash[] = [];
  for (const h of list ?? []) {
    if (h.algorithm !== 'sha-256' || !h.value) {
      continue;
    }
    let value: Uint8Array;
    try {
      value = Uint8Array.from(atob(h.value), (c) => c.charCodeAt(0));
    } catch {
      continue;
    }
    if (value.length === 32) {
      out.push({ algorithm: 'sha-256', value });
    }
  }
  return out;
}

export function endpointOf(host: string, answer: Answer): HubEndpoint {
  if (!answer.enabled) {
    throw new HubRefusedError(`${hubOrigin(host).hostname} does not accept browser radios`);
  }
  const port = answer.port;
  if (!Number.isInteger(port) || port! <= 0 || port! > 65535) {
    throw new Error('The hub sent no WebTransport port');
  }
  const path = answer.path?.startsWith('/') ? answer.path : `/${answer.path ?? ''}`;
  return { url: `https://${hubOrigin(host).hostname}:${port}${path}`, hashes: certificateHashes(answer.certificate_hashes) };
}

export async function discover(host: string, signal?: AbortSignal): Promise<HubEndpoint> {
  const url = new URL('/api/v1/network/webtransport', hubOrigin(host));
  let res: Response;
  try {
    res = await fetch(url, { signal, cache: 'no-store', credentials: 'omit' });
  } catch {
    throw new Error(`Could not reach ${url.host}`);
  }
  if (res.status === 404) {
    throw new HubRefusedError(`${url.host} is not a DMRHub that accepts browser radios`);
  }
  if (!res.ok) {
    throw new Error(`${url.host} answered ${res.status}`);
  }
  return endpointOf(host, (await res.json()) as Answer);
}
