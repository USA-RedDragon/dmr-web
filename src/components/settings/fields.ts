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

export const inputClass =
  'h-11 w-full rounded-[10px] border border-radio-line bg-radio-page px-3 text-[15px] text-radio-text outline-none focus-visible:border-radio-amber';

export const labelClass = 'flex flex-col gap-1.5 text-xs text-radio-muted';

export const primaryButton =
  'h-11 rounded-[10px] bg-radio-amber px-4 text-sm font-bold text-radio-amber-ink disabled:opacity-50';

export const secondaryButton = 'h-11 rounded-[10px] border border-radio-line px-4 text-sm text-radio-text disabled:opacity-50';

export const dangerButton = 'h-11 rounded-[10px] border border-radio-red/60 px-4 text-sm text-radio-red';
