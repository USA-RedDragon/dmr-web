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
import type { RangeResponse, Source } from 'pmtiles';
import { describe, expect, it } from 'vitest';

import { BLOCK_BYTES, BlockCachedSource, blockSpan, cacheNameOf, evictionOrder, generationOf, missingRuns } from '@/map/blockCache';

class FakeCache {
  readonly items = new Map<string, ArrayBuffer>();
  async match(key: string): Promise<Response | undefined> {
    const b = this.items.get(key);
    return b ? new Response(b.slice(0)) : undefined;
  }
  async put(key: string, res: Response): Promise<void> {
    this.items.set(key, await res.arrayBuffer());
  }
  async delete(key: string): Promise<boolean> {
    return this.items.delete(key);
  }
}

class FakeStorage {
  readonly caches = new Map<string, FakeCache>();
  async open(name: string): Promise<Cache> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new FakeCache());
    }
    return this.caches.get(name)! as unknown as Cache;
  }
  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
}

class Archive implements Source {
  readonly reads: Array<[number, number]> = [];
  constructor(readonly bytes: Uint8Array) {}
  getKey(): string {
    return 'archive';
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    this.reads.push([offset, length]);
    return { data: this.bytes.slice(offset, Math.min(offset + length, this.bytes.length)).buffer };
  }
}

function archive(size: number): Archive {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    b[i] = (i * 7 + (i >> 8)) & 0xff;
  }
  return new Archive(b);
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('block cache helpers', () => {
  it('keys a generation by the path of its archive', () => {
    expect(generationOf('https://tiles.squallar.app/basemap/omt-20260828.pmtiles')).toBe('basemap/omt-20260828.pmtiles');
    expect(cacheNameOf('a/b')).toBe('dmrweb-blk-a%2Fb');
  });

  it('finds the blocks a range touches', () => {
    expect(blockSpan(0, 1)).toEqual({ first: 0, last: 0 });
    expect(blockSpan(BLOCK_BYTES - 1, 2)).toEqual({ first: 0, last: 1 });
  });

  it('groups missing neighbors into one run each', () => {
    const have = new Set([2, 5]);
    expect(missingRuns(0, 7, (i) => have.has(i))).toEqual([
      [0, 1],
      [3, 4],
      [6, 7],
    ]);
  });

  it('drops the least recently used blocks first', () => {
    const m = { clock: 3, blocks: { a: { cache: 'c', bytes: 10, touched: 2 }, b: { cache: 'c', bytes: 10, touched: 1 }, c: { cache: 'c', bytes: 10, touched: 3 } } };
    expect(evictionOrder(m, 15)).toEqual(['b', 'a']);
    expect(evictionOrder(m, 30)).toEqual([]);
  });
});

describe('BlockCachedSource', () => {
  it('reads exactly the asked range, across blocks and past the end', async () => {
    const a = archive(3 * BLOCK_BYTES + 100);
    const s = new BlockCachedSource(a, 'gen', new FakeStorage() as unknown as CacheStorage);
    for (const [offset, length] of [
      [10, 20],
      [BLOCK_BYTES - 5, 10],
      [BLOCK_BYTES * 3 + 50, 100],
    ] as const) {
      const got = new Uint8Array((await s.getBytes(offset, length)).data);
      expect(got).toEqual(a.bytes.slice(offset, Math.min(offset + length, a.bytes.length)));
    }
  });

  it('fetches neighboring missing blocks at once, and serves them again from the cache', async () => {
    const a = archive(4 * BLOCK_BYTES);
    const s = new BlockCachedSource(a, 'gen', new FakeStorage() as unknown as CacheStorage);
    await s.getBytes(100, 2 * BLOCK_BYTES);
    expect(a.reads).toEqual([[0, 3 * BLOCK_BYTES]]);
    await settle();
    const again = new Uint8Array((await s.getBytes(200, BLOCK_BYTES)).data);
    expect(again).toEqual(a.bytes.slice(200, 200 + BLOCK_BYTES));
    expect(a.reads).toHaveLength(1);
  });

  it('shares a block that another read is fetching', async () => {
    const a = archive(2 * BLOCK_BYTES);
    const s = new BlockCachedSource(a, 'gen', new FakeStorage() as unknown as CacheStorage);
    await Promise.all([s.getBytes(0, 10), s.getBytes(20, 10)]);
    expect(a.reads.length).toBeLessThanOrEqual(2);
  });

  it('reads through when the cache fails', async () => {
    const a = archive(BLOCK_BYTES);
    const broken = { open: () => Promise.reject(new Error('blocked')) } as unknown as CacheStorage;
    const s = new BlockCachedSource(a, 'gen', broken);
    expect(new Uint8Array((await s.getBytes(5, 5)).data)).toEqual(a.bytes.slice(5, 10));
    expect(a.reads).toEqual([[5, 5]]);
  });

  it('reads through without Cache Storage', async () => {
    const a = archive(BLOCK_BYTES);
    const s = new BlockCachedSource(a, 'gen', undefined);
    await s.getBytes(5, 5);
    expect(a.reads).toEqual([[5, 5]]);
  });

  it('clears only other generations', async () => {
    const store = new FakeStorage();
    await store.open(cacheNameOf('old'));
    await store.open(cacheNameOf('new'));
    await store.open('something-else');
    await BlockCachedSource.clearOtherGenerations(['new'], store as unknown as CacheStorage);
    expect(await store.keys()).toEqual([cacheNameOf('new'), 'something-else']);
  });
});
