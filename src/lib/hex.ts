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

/** parseHex reads octets written as hex, with or without spaces, commas or 0x prefixes; it returns null for anything else. */
export function parseHex(text: string): Uint8Array | null {
  const clean = text.replace(/0x/gi, '').replace(/[\s,:]+/g, '');
  if (clean === '' || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) {
    return null;
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  }
  return out;
}

/** octetCount counts the octets in text, or returns 0 when it is not hex. */
export function octetCount(text: string): number {
  return parseHex(text)?.length ?? 0;
}
