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

import { useMutationObserver, useResizeObserver } from '@vueuse/core';
import type { Ref } from 'vue';

/**
 * Makes the children of a clipping flex-wrap box inert when they wrapped out
 * of view, so Tab cannot land on them and scroll the box.
 */
export function useInertOverflow(box: Ref<HTMLElement | null>): void {
  const sync = (): void => {
    const el = box.value;
    if (!el) {
      return;
    }
    for (const child of el.children) {
      const c = child as HTMLElement;
      c.inert = c.offsetLeft >= el.clientWidth || c.offsetTop >= el.clientHeight;
    }
  };
  useResizeObserver(box, sync);
  useMutationObserver(box, () => requestAnimationFrame(sync), { childList: true, subtree: true });
}
