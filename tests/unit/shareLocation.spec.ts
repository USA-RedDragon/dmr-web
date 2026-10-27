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
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/store/radio', () => ({
  useRadio: () => ({ reportPosition: vi.fn(), lastReport: null }),
}));

import ShareLocation from '@/components/map/ShareLocation.vue';
import { useAccount } from '@/store/account';

describe('ShareLocation', () => {
  it('links to the Positions page of the hub when tracking is off', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const account = useAccount();
    account.account = {
      host: 'hub.example.org',
      meta: { issuer: '', authorization_endpoint: '', token_endpoint: '', revocation_endpoint: '' },
      tokens: { access: '', refresh: '', expiresAt: 0, scope: [] },
      user: { id: 3100001, callsign: 'N0CALL', username: 'n0call', positionTracking: false },
    } as never;
    const wrapper = mount(ShareLocation, { global: { plugins: [pinia] } });
    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('https://hub.example.org/positions');
    expect(link.text()).toBe('the Positions page of DMRHub');
  });
});
