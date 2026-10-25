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

import type { Router } from 'vue-router';

/**
 * Goes back like the system back gesture when the previous entry is in this
 * app, so in-app back buttons do not pile up history. With no previous entry,
 * as after a deep link, it replaces the current entry with fallback.
 */
export function goBack(router: Router, fallback: string): void {
  if (router.options.history.state.back) {
    router.back();
  } else {
    void router.replace(fallback);
  }
}
