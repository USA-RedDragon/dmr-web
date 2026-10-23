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

import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'radio', component: () => import('../views/RadioView.vue') },
    { path: '/map', name: 'map', component: () => import('../views/MapView.vue') },
    { path: '/oauth/callback', name: 'oauth', component: () => import('../views/OAuthCallbackView.vue') },
    { path: '/messages/contacts/:id?', name: 'messages-contacts', component: () => import('../views/MessagesView.vue') },
    { path: '/messages/:thread?', name: 'messages', component: () => import('../views/MessagesView.vue') },
    { path: '/settings/diagnostics/data', name: 'settings-data', component: () => import('../views/DataConsoleView.vue') },
    {
      path: '/settings/:section?',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

export default router;
