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

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve(__dirname, '../../scripts/carry-assets.sh');
const day = 86400;
const roots: string[] = [];

const image = () => {
  const root = mkdtempSync(join(tmpdir(), 'carry-'));
  roots.push(root);
  return { root, ledger: join(root, 'carry-builds'), dir: join(root, 'assets') };
};

type Image = ReturnType<typeof image>;

const build = (prev: Image, now: number, names: string[], env: Record<string, string> = {}): Image => {
  const next = image();
  mkdirSync(next.dir);
  for (const n of names) {
    writeFileSync(join(next.dir, n), n);
  }
  execFileSync('sh', [script, prev.ledger, next.ledger, prev.dir, next.dir], {
    env: { ...process.env, ...env, CARRY_NOW: String(now) },
    stdio: 'pipe',
  });
  return next;
};

afterEach(() => {
  for (const r of roots.splice(0)) {
    rmSync(r, { recursive: true, force: true });
  }
});

describe('carry-assets.sh', () => {
  it('serves the assets of the build before and drops them after 3 rare builds', () => {
    let img = build(image(), 0, ['radio-a.wasm', 'index-a.js'], { CARRY_FIRST_BUILD: '1' });
    img = build(img, 30 * day, ['radio-b.wasm', 'index-a.js']);
    expect(readdirSync(img.dir).sort()).toEqual(['index-a.js', 'radio-a.wasm', 'radio-b.wasm']);
    expect(statSync(join(img.dir, 'index-a.js')).mtimeMs).toBe(30 * day * 1000);
    for (let i = 2; i <= 4; i++) {
      img = build(img, i * 30 * day, [`radio-${i}.wasm`]);
    }
    expect(readdirSync(img.dir)).not.toContain('radio-a.wasm');
    expect(readdirSync(img.dir)).toContain('radio-b.wasm');
  });

  it('fails when the previous image has no assets and this is not the first build', () => {
    expect(() => build(image(), day, ['a.js'])).toThrow();
  });
});
