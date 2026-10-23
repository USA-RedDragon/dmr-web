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
import { describe, expect, it } from 'vitest';

import { datagramWriter, endpointURL } from '@/radio/transport';

describe('endpointURL', () => {
  it('leaves out the default port', () => {
    expect(endpointURL('dmrhub.net', 443, '/mmdvm')).toBe('https://dmrhub.net/mmdvm');
    expect(endpointURL('dmrhub.net', 62032, '/mmdvm')).toBe('https://dmrhub.net:62032/mmdvm');
  });

  it('cleans up what people paste', () => {
    expect(endpointURL(' https://hub.example.org/ ', 4433, 'mmdvm')).toBe('https://hub.example.org:4433/mmdvm');
  });
});

describe('datagramWriter', () => {
  const sink = () => {
    const got: Uint8Array[] = [];
    return { got, stream: new WritableStream<Uint8Array>({ write: (c) => void got.push(c) }) };
  };

  it('prefers createWritable', async () => {
    const a = sink();
    const b = sink();
    const w = datagramWriter({ readable: new ReadableStream(), writable: b.stream, createWritable: () => a.stream });
    await w.write(new Uint8Array([1, 2]));
    expect(a.got).toHaveLength(1);
    expect(b.got).toHaveLength(0);
  });

  it('falls back to writable', async () => {
    const b = sink();
    const w = datagramWriter({ readable: new ReadableStream(), writable: b.stream });
    await w.write(new Uint8Array([3]));
    expect(b.got).toEqual([new Uint8Array([3])]);
  });

  it('fails without a writable side', () => {
    expect(() => datagramWriter({ readable: new ReadableStream() })).toThrow();
  });
});
