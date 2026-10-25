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

import { useEventListener } from '@vueuse/core';

function isField(el: Element | null): boolean {
  return !!el && ((el as HTMLElement).isContentEditable || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'file'].includes((el as HTMLInputElement).type)) || el.tagName === 'TEXTAREA');
}

/**
 * Pins the app to the part of the screen the on-screen keyboard leaves.
 *
 * iOS Safari does not resize the layout for the keyboard. It pans the page
 * instead, which pushes headers off the top. While a text field has focus
 * this sets --app-top, --app-h and --app-bottom from the visual viewport, and
 * the shell, full-screen views and sheets position themselves with them.
 */
export function useKeyboardViewport(): void {
  const vv = window.visualViewport;
  if (!vv) {
    return;
  }
  const root = document.documentElement.style;
  const sync = (): void => {
    if (isField(document.activeElement) && Math.abs(vv.scale - 1) < 0.01) {
      root.setProperty('--app-top', `${vv.offsetTop}px`);
      root.setProperty('--app-h', `${vv.height}px`);
      root.setProperty('--app-bottom', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    } else {
      root.removeProperty('--app-top');
      root.removeProperty('--app-h');
      root.removeProperty('--app-bottom');
    }
  };
  useEventListener(vv, 'resize', sync);
  useEventListener(vv, 'scroll', sync);
  useEventListener(document, 'focusin', sync);
  useEventListener(document, 'focusout', () => requestAnimationFrame(sync));
}
