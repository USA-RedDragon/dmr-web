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
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmDir = join(root, 'wasm');

const env = { ...process.env, GOOS: 'js', GOARCH: 'wasm', CGO_ENABLED: '0' };
mkdirSync(join(root, 'public'), { recursive: true });
execFileSync('go', ['build', '-trimpath', '-ldflags=-s -w', '-o', join(root, 'public', 'radio.wasm'), './cmd/radio'], {
  cwd: wasmDir,
  env,
  stdio: 'inherit',
});

const goroot = execFileSync('go', ['env', 'GOROOT'], { cwd: wasmDir, env }).toString().trim();
const candidates = [join(goroot, 'lib', 'wasm', 'wasm_exec.js'), join(goroot, 'misc', 'wasm', 'wasm_exec.js')];
const execJS = candidates.find((p) => existsSync(p));
if (!execJS) {
  throw new Error(`wasm_exec.js not found under ${goroot}`);
}
// The Go root may be read-only, and copyFileSync keeps the mode, so a second
// build could not overwrite the copy.
const execDst = join(root, 'src', 'radio', 'wasm_exec.js');
rmSync(execDst, { force: true });
copyFileSync(execJS, execDst);
