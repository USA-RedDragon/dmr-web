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

import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmDir = join(root, 'wasm');

const goenv = (key: string) => execFileSync('go', ['env', key], { cwd: wasmDir }).toString().trim();
const goroot = goenv('GOROOT');

const env: Record<string, string> = {
  PATH: `${join(goroot, 'bin')}:${dirname(process.execPath)}:/usr/bin:/bin`,
  HOME: process.env.HOME ?? '/tmp',
  GOCACHE: goenv('GOCACHE'),
  GOMODCACHE: goenv('GOMODCACHE'),
  GOTOOLCHAIN: 'local',
  GOOS: 'js',
  GOARCH: 'wasm',
};
for (const key of ['AMBE_WASM', 'AMBE_VECTORS', 'GOPROXY', 'GOFLAGS']) {
  const v = process.env[key];
  if (v) {
    env[key] = v;
  }
}

const res = spawnSync(
  join(goroot, 'bin', 'go'),
  ['test', '-count=1', '-exec', join(goroot, 'lib', 'wasm', 'go_js_wasm_exec'), ...(process.argv.length > 2 ? process.argv.slice(2) : ['./...'])],
  { cwd: wasmDir, env, stdio: 'inherit' },
);
process.exit(res.status ?? 1);
