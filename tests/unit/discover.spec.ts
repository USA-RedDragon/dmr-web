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
import { afterEach, describe, expect, it, vi } from 'vitest';

import { certificateHashes, discover, endpointOf, HubRefusedError, hubOrigin } from '@/radio/discover';

const hash = 'SQa5dlun5X5Z8EI5W2T1F4fm7Tb50POkWYstxwpAGEQ=';

describe('hubOrigin', () => {
  it('takes a bare host or a URL', () => {
    expect(hubOrigin('dmrhub.net').href).toBe('https://dmrhub.net/');
    expect(hubOrigin(' https://hub.example.org/ ').href).toBe('https://hub.example.org/');
    expect(hubOrigin('http://localhost:3005').href).toBe('http://localhost:3005/');
  });
});

describe('certificateHashes', () => {
  it('keeps 32-byte SHA-256 hashes only', () => {
    const got = certificateHashes([
      { algorithm: 'sha-256', value: hash },
      { algorithm: 'sha-1', value: hash },
      { algorithm: 'sha-256', value: 'AAAA' },
      { algorithm: 'sha-256', value: '!!' },
    ]);
    expect(got).toHaveLength(1);
    expect(got[0]!.value[0]).toBe(0x49);
    expect(got[0]!.value[31]).toBe(0x44);
  });
});

describe('endpointOf', () => {
  it('points at the listener on the host of the hub', () => {
    const ep = endpointOf('http://localhost:3005', {
      enabled: true,
      port: 62032,
      path: '/mmdvm',
      certificate_hashes: [{ algorithm: 'sha-256', value: hash }],
    });
    expect(ep.url).toBe('https://localhost:62032/mmdvm');
    expect(ep.hashes).toHaveLength(1);
  });

  it('refuses a hub without the listener', () => {
    expect(() => endpointOf('dmrhub.net', { enabled: false })).toThrow(HubRefusedError);
  });

  it('needs a port', () => {
    expect(() => endpointOf('dmrhub.net', { enabled: true, path: '/mmdvm' })).toThrow('no WebTransport port');
  });
});

describe('discover', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the hub', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ enabled: true, port: 62032, path: '/mmdvm', certificate_hashes: [] })));
    vi.stubGlobal('fetch', fetch);
    const ep = await discover('dmrhub.net');
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe('https://dmrhub.net/api/v1/network/webtransport');
    expect(ep).toEqual({ url: 'https://dmrhub.net:62032/mmdvm', hashes: [] });
  });

  it('refuses something that is not a DMRHub', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(discover('example.org')).rejects.toBeInstanceOf(HubRefusedError);
  });
});
