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
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';

import { archiveSource, latestKey, PartsSource, partName, spans } from '@/map/archive';
import { BlockCachedSource } from '@/map/blockCache';
import { basemapStyle, circleImage, FONTS, SOURCE, strictExpression, strictFilter } from '@/map/style';
import dark from '@/map/styles/dark.json';
import light from '@/map/styles/light.json';
import { compass, degrees, describe as describePosition, fromFix, KEEP_MS, prune, upsert, type Position } from '@/store/positions';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('archive parts', () => {
  it('names parts with three digits', () => {
    expect(partName(0)).toBe('.part000');
    expect(partName(167)).toBe('.part167');
  });

  it('maps a range onto the parts it covers', () => {
    expect(spans(0, 127, 1000)).toEqual([{ part: 0, start: 0, end: 126 }]);
    expect(spans(990, 20, 1000)).toEqual([
      { part: 0, start: 990, end: 999 },
      { part: 1, start: 0, end: 9 },
    ]);
    expect(spans(2500, 10, 1000)).toEqual([{ part: 2, start: 500, end: 509 }]);
  });

  it('reads a range across a part boundary in order', async () => {
    const fetch = vi.fn((url: string, init: RequestInit) => {
      const range = (init.headers as Record<string, string>).Range!;
      const [a, b] = range.replace('bytes=', '').split('-').map(Number) as [number, number];
      const part = Number(url.slice(-3));
      const bytes = Uint8Array.from({ length: b - a + 1 }, (_, i) => (part * 10 + a + i) % 256);
      return Promise.resolve(new Response(bytes, { status: 206 }));
    });
    vi.stubGlobal('fetch', fetch);
    const src = new PartsSource('https://tiles.example/basemap/x.pmtiles', 10);
    const got = new Uint8Array((await src.getBytes(8, 4)).data);
    expect([...got]).toEqual([8, 9, 10, 11]);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['https://tiles.example/basemap/x.pmtiles.part000', 'https://tiles.example/basemap/x.pmtiles.part001']);
  });

  it('probes part000 for the PMTiles magic', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new TextEncoder().encode('PMTiles'), { status: 206 })));
    const parts = await archiveSource('https://tiles.example/a.pmtiles', 10);
    expect(parts).toBeInstanceOf(BlockCachedSource);
    expect((parts as BlockCachedSource).inner).toBeInstanceOf(PartsSource);
    expect((parts as BlockCachedSource).generation).toBe('a.pmtiles');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
    expect(((await archiveSource('https://tiles.example/a.pmtiles', 10)) as BlockCachedSource).inner).not.toBeInstanceOf(PartsSource);
  });

  it('reads the newest key from the status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ key: 'basemap/omt-1.pmtiles', part_bytes: 42 }))));
    expect(await latestKey('https://tiles.example')).toEqual({ key: 'basemap/omt-1.pmtiles', partBytes: 42 });
  });
});

describe('basemap style', () => {
  for (const [name, raw] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`points ${name} at the archive and the served fonts`, () => {
      const s = basemapStyle(raw as unknown as StyleSpecification, 'https://tiles.example/a.pmtiles', '/glyphs/{fontstack}/{range}.pbf');
      expect(s.sources[SOURCE]).toEqual({ type: 'vector', url: 'pmtiles://https://tiles.example/a.pmtiles' });
      expect(s.glyphs).toBe('/glyphs/{fontstack}/{range}.pbf');
      expect(s.layers.length).toBe((raw as unknown as StyleSpecification).layers.length);
      const fonts = new Set(s.layers.flatMap((l) => (l.type === 'symbol' && Array.isArray(l.layout?.['text-font']) ? (l.layout['text-font'] as string[]) : [])));
      expect([...fonts].every((f) => Object.values(FONTS).includes(f))).toBe(true);
      expect((raw as unknown as StyleSpecification).sources[SOURCE]).not.toHaveProperty('url', 'pmtiles://https://tiles.example/a.pmtiles');
      expect(validateStyleMin(s).map((e) => e.message)).toEqual([]);
    });
  }

  it('makes the loose expressions strict', () => {
    expect(strictExpression(['step', ['zoom'], [1], 7, [2, 2]])).toEqual(['step', ['zoom'], ['literal', [1]], 7, ['literal', [2, 2]]]);
    expect(strictExpression([0.2, 0.2])).toEqual([0.2, 0.2]);
    expect(strictExpression(['match', ['get', 'rank'], [1, 2], 'a', 3, 'b', 'c'])).toEqual(['match', ['get', 'rank'], [1, 2], 'a', 3, 'b', 'c']);
  });

  it('makes legacy and mixed filters expressions', () => {
    expect(strictFilter(['all', ['!has', 'capital'], ['==', ['get', 'class'], 'city']])).toEqual(['all', ['!', ['has', 'capital']], ['==', ['get', 'class'], 'city']]);
    expect(strictFilter(['==', ['get', 'class'], 'city'])).toEqual(['==', ['get', 'class'], 'city']);
    const legacy = strictFilter(['all', ['==', 'class', 'service'], ['in', 'brunnel', 'bridge', 'tunnel']]);
    expect(expressionLike(legacy)).toBe(true);
  });

  it('draws a round dot for circle-11', () => {
    const img = circleImage('#ff0000');
    const at = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];
    expect(at(11, 11)).toBe(255);
    expect(at(0, 0)).toBe(0);
    expect(img.data[(11 * img.width + 11) * 4]).toBe(255);
  });
});

describe('positions', () => {
  const p: Position = { id: 1, latitude: 41.8853, longitude: -87.6213, format: 'lrrp', accuracy: 10, speed: 9.5, heading: 45, at: 1000, slot: 2 };

  it('reads a fix and skips one without a position', () => {
    expect(fromFix(3100002, 2, 41.8853, -87.6213, { format: 'lrrp', valid: true, accuracy: 10 }, 5)).toMatchObject({ id: 3100002, format: 'lrrp', accuracy: 10, speed: null, at: 5 });
    expect(fromFix(3100002, 2, 0, 0, { format: 'lrrp', valid: false }, 5)).toBeNull();
    expect(fromFix(3100002, 2, 95, 0, { format: 'nmea', valid: true }, 5)).toBeNull();
  });

  it('keeps one position per station for a day', () => {
    const list = upsert(upsert([], p), { ...p, at: 2000 });
    expect(list).toHaveLength(1);
    expect(list[0]!.at).toBe(2000);
    expect(prune(list, 2000 + KEEP_MS)).toHaveLength(0);
  });

  it('words a position', () => {
    expect(describePosition(p)).toBe('LRRP · 34 km/h heading NE · ±10 m');
    expect(describePosition({ ...p, format: 'nmea', speed: 0, accuracy: null })).toBe('NMEA RMC · stationary');
    expect(compass(359)).toBe('N');
    expect(degrees(41.8853, -87.6213)).toBe('41.8853 N, 87.6213 W');
  });
});

function expressionLike(f: unknown): boolean {
  return Array.isArray(f) && JSON.stringify(f).includes('["get","class"]');
}
