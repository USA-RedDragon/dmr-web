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
import { describe, expect, it } from 'vitest';

import { applyParts, describeChanges, exportBackup, openBackup, pickParts, readBackup } from '@/lib/backup';
import { defaultSettings } from '@/store/settings';

describe('backup', () => {
  const content = () => {
    const settings = defaultSettings();
    settings.hotspot.id = 310000101;
    settings.hotspot.password = 'secret';
    return { settings, theme: 'dark' };
  };

  it('round-trips a plain file', async () => {
    const c = content();
    const f = readBackup(await exportBackup(c, null));
    expect(f.encrypted).toBe(false);
    expect(await openBackup(f, '')).toEqual(c);
  });

  it('seals the file with a passphrase', async () => {
    const c = content();
    const text = await exportBackup(c, 'correct horse');
    expect(text).not.toContain('secret');
    const f = readBackup(text);
    expect(f.encrypted).toBe(true);
    expect(await openBackup(f, 'correct horse')).toEqual(c);
    await expect(openBackup(f, 'wrong horse')).rejects.toThrow('The passphrase is wrong');
  }, 30_000);

  it('refuses other files', () => {
    expect(() => readBackup('nope')).toThrow('not a dmr-web settings file');
    expect(() => readBackup('{"format":"other"}')).toThrow('not a dmr-web settings file');
    expect(() => readBackup('{"format":"dmr-web-settings","version":2}')).toThrow('another version');
  });

  it('lists what an import changes', () => {
    const cur = defaultSettings();
    const next = content().settings;
    next.hub.host = 'example.org';
    const changes = describeChanges(cur, next, { from: 'system', to: 'dark' });
    expect(changes.map((c) => c.label)).toEqual(['Hub', 'Hotspot', 'Theme']);
  });

  it('exports only the parts asked for', () => {
    const c = content();
    const only = pickParts(c.settings, 'dark', ['talkgroups']);
    expect(only.settings.talkgroups).toEqual(c.settings.talkgroups);
    expect(only.settings.hub).toBeUndefined();
    expect(only.settings.hotspot).toBeUndefined();
    expect(only.theme).toBeUndefined();
    expect(JSON.stringify(only)).not.toContain('secret');
  });

  it('imports a part without touching the rest', () => {
    const cur = defaultSettings();
    cur.hotspot.id = 310000101;
    cur.hotspot.password = 'mine';
    cur.hotspot.callsign = 'N0CALL';
    const from = content().settings;
    from.hotspot.callsign = 'N1CALL';
    const next = applyParts(cur, pickParts(from, 'dark', ['identity']).settings);
    expect(next.hotspot).toEqual({ id: 310000101, password: 'mine', callsign: 'N1CALL', location: '' });
    const both = applyParts(cur, pickParts(from, 'dark', ['hotspot']).settings);
    expect(both.hotspot.password).toBe('secret');
    expect(both.hotspot.callsign).toBe('N0CALL');
  });
});
