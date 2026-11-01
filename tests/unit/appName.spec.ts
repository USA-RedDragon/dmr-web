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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

vi.mock('@/store/radio', () => ({
  useRadio: () => ({ link: 'idle', tx: { active: false }, calls: { 1: { active: false }, 2: { active: false } } }),
}));

vi.mock('virtual:pwa-register/vue', async () => {
  const { ref } = await import('vue');
  return { useRegisterSW: () => ({ needRefresh: ref(true), updateServiceWorker: vi.fn() }) };
});

import AppHeader from '@/components/AppHeader.vue';
import UpdateNotice from '@/components/UpdateNotice.vue';
import { APP_NAME } from '@/lib/appName';
import { readBackup } from '@/lib/backup';
import { BROWSER_RADIO, isBrowserRadio } from '@/store/account';

describe('app name', () => {
  it('is DMRHub Radio', () => {
    expect(APP_NAME).toBe('DMRHub Radio');
  });

  it('titles the page', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain(`<title>${APP_NAME}</title>`);
  });

  it('shows in the header and the update notice', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
    await router.push('/');
    const header = mount(AppHeader, { global: { plugins: [pinia, router] } });
    expect(header.text()).toContain(APP_NAME);
    expect(header.text()).not.toContain('dmr-web');
    const notice = mount(UpdateNotice, { global: { plugins: [pinia] } });
    expect(notice.text()).toContain(`A new version of ${APP_NAME} is ready`);
  });

  it('names settings files after the app', () => {
    expect(() => readBackup('nope')).toThrow(`This is not a ${APP_NAME} settings file`);
    expect(() => readBackup('{"format":"dmr-web-settings","version":2}')).toThrow(`another version of ${APP_NAME}`);
  });

  it('sends the app name as the hotspot description and knows the old one', () => {
    expect(BROWSER_RADIO).toBe(APP_NAME);
    expect(isBrowserRadio(APP_NAME)).toBe(true);
    expect(isBrowserRadio('dmr-web radio')).toBe(true);
    expect(isBrowserRadio('Pi-Star')).toBe(false);
  });
});
