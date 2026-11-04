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

import type { ListenCall, ListenTalkgroup } from '@/radio/listen';
import type { LinkState } from '@/radio/protocol';

/** ListenLcd is what the display of listen mode shows. */
export type ListenLcd = {
  band: string;
  status: string;
  badge: string;
  timer: string;
  headline: string;
  sub: string;
  subRight: string;
  details: string[];
};

/** ListenInput is the state that the display of listen mode shows. */
export type ListenInput = {
  link: LinkState;
  linkDetail: string;
  host: string;
  tuned: number;
  error: string;
  talkgroups: ListenTalkgroup[];
  /** call is the call that plays, if any. */
  call: { source: number; vocoder: string; timer: string; alias: string } | null;
  calls: Record<number, ListenCall>;
};

/** talkgroupLabel names the talkgroup tg, such as "TG 91  WORLDWIDE". */
export function talkgroupLabel(tg: number, list: ListenTalkgroup[]): string {
  if (!tg) {
    return 'NO TALKGROUP';
  }
  const name = list.find((t) => t.id === tg)?.name ?? '';
  return `TG ${tg}${name ? `  ${name.toUpperCase()}` : ''}`;
}

function badgeOf(vocoder: string): string {
  if (vocoder === 'ambe') {
    return 'AMBE';
  }
  return vocoder === 'codec2' ? 'CODEC2' : '';
}

/** listenLcd returns the display of listen mode for in. */
export function listenLcd(input: ListenInput): ListenLcd {
  const band = talkgroupLabel(input.tuned, input.talkgroups);
  const hub = `HUB  ${input.host.replace(/^https?:\/\//, '').toUpperCase()}`;
  if (input.link !== 'up') {
    const failed = input.link === 'failed';
    return {
      band,
      status: input.link === 'idle' ? '' : input.link.toUpperCase(),
      badge: '',
      timer: '',
      headline: failed ? 'NO LINK' : 'CONNECTING',
      sub: failed ? input.linkDetail.toUpperCase() : 'LISTEN ONLY',
      subRight: '',
      details: [hub],
    };
  }
  const c = input.call;
  if (c) {
    const meta = input.calls[c.source];
    const callsign = meta?.callsign || c.alias.trim().split(/\s+/)[0] || String(c.source);
    const details = [`ALIAS  ${c.alias.trim() || meta?.alias || '-'}`];
    if (meta?.repeater.id) {
      details.push(`VIA  ${meta.repeater.callsign} ${meta.repeater.id}`.trimEnd());
    }
    return {
      band,
      status: 'RECEIVING',
      badge: badgeOf(c.vocoder),
      timer: c.timer,
      headline: callsign.toUpperCase(),
      sub: `ID ${c.source}`,
      subRight: input.tuned ? `TG ${input.tuned}` : '',
      details,
    };
  }
  return {
    band,
    status: 'LISTENING',
    badge: '',
    timer: '',
    headline: input.tuned ? `TG ${input.tuned}` : 'NO TALKGROUP',
    sub: input.error ? input.error.toUpperCase() : input.tuned ? 'QUIET' : 'PICK A TALKGROUP',
    subRight: '',
    details: ['LISTEN ONLY, NO ACCOUNT', hub],
  };
}
