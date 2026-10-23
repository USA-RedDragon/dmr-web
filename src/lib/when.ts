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
import { format, isSameDay, isYesterday } from 'date-fns';

export function listTime(at: number, now = new Date()): string {
  const d = new Date(at);
  if (isSameDay(d, now)) {
    return format(d, 'HH:mm');
  }
  if (isYesterday(d)) {
    return 'Yesterday';
  }
  return format(d, 'MMM d');
}

export function dayLabel(at: number, now = new Date()): string {
  const d = new Date(at);
  if (isSameDay(d, now)) {
    return 'Today';
  }
  if (isYesterday(d)) {
    return 'Yesterday';
  }
  return format(d, 'EEEE, MMMM d');
}
