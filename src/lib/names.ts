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
import { useContacts } from '@/store/contacts';
import { useDirectory } from '@/store/directory';
import { useRadio } from '@/store/radio';
import { useSettings } from '@/store/settings';

import type { Peer } from './threads';

export function useNames() {
  const radio = useRadio();
  const settings = useSettings();
  const contacts = useContacts();
  const directory = useDirectory();

  function talkgroupName(id: number): string {
    const t = [...settings.settings.talkgroups[1], ...settings.settings.talkgroups[2]].find((x) => x.id === id);
    return t?.name ?? '';
  }

  function callsign(id: number): string {
    const h = radio.heard.find((e) => e.source === id && e.alias);
    if (h) {
      return h.alias.trim().split(/\s+/)[0]!.toUpperCase();
    }
    return contacts.get(id)?.callsign || directory.listing(id)?.callsign || '';
  }

  function name(p: Peer): string {
    if (p.group) {
      const n = talkgroupName(p.id);
      return n ? `TG ${p.id} ${n}` : `TG ${p.id}`;
    }
    return callsign(p.id) || String(p.id);
  }

  function initials(p: Peer): string {
    if (p.group) {
      return `TG${String(p.id).slice(0, 2)}`;
    }
    const c = callsign(p.id);
    return c ? c.slice(0, 2) : String(p.id).slice(-2);
  }

  function lastHeard(id: number): { at: number; target: number; group: boolean } | null {
    const h = radio.heard.find((e) => e.source === id);
    return h ? { at: h.at, target: h.target, group: h.group } : null;
  }

  return { name, initials, callsign, talkgroupName, lastHeard };
}
