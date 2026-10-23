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

import { watch } from 'vue';

import type { HubMessage } from '@/lib/threads';
import { hubOrigin } from '@/radio/discover';
import { LoginEndedError, useAccount } from '@/store/account';
import { useMessages } from '@/store/messages';

type Push = { boxes?: string[]; message?: HubMessage };

/** BACKFILL is how many of the latest messages of each box are read when the socket opens. */
export const BACKFILL = 50;

/** messagesSocketURL is the hub's live messages websocket. */
export function messagesSocketURL(host: string): string {
  const u = hubOrigin(host);
  u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
  u.pathname = '/ws/messages';
  return u.toString();
}

/** retryDelay is how long to wait before the attempt-th reconnect. */
export function retryDelay(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6));
}

/** syncHubMessages keeps the threads in step with the hub's inbox and outbox while the account may read them. */
export function syncHubMessages(): void {
  const account = useAccount();
  const store = useMessages();
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let generation = 0;

  async function backfill(gen: number): Promise<void> {
    for (const box of ['outbox', 'inbox'] as const) {
      const got = await account.api<{ messages?: HubMessage[] }>(`/api/v1/messages/${box}?limit=${BACKFILL}&page=1`);
      if (gen !== generation) {
        return;
      }
      for (const m of [...(got.messages ?? [])].reverse()) {
        store.fromHubBox(m, box, false);
      }
    }
  }

  function stop(): void {
    generation++;
    clearTimeout(timer);
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
  }

  function retry(gen: number): void {
    if (gen !== generation) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void open(gen), retryDelay(attempt++));
  }

  async function open(gen: number): Promise<void> {
    let token: string;
    try {
      token = await account.accessToken();
    } catch (err) {
      if (!(err instanceof LoginEndedError)) {
        retry(gen);
      }
      return;
    }
    if (gen !== generation) {
      return;
    }
    const socket = new WebSocket(messagesSocketURL(account.host), ['dmrhub', `dmrhub.bearer.${token}`]);
    ws = socket;
    socket.onopen = () => {
      attempt = 0;
      backfill(gen).catch(() => undefined);
      void account.refreshUser();
    };
    socket.onmessage = (e: MessageEvent<string>) => {
      let push: Push;
      try {
        push = JSON.parse(e.data) as Push;
      } catch {
        return;
      }
      if (!push.message) {
        return;
      }
      for (const box of push.boxes ?? []) {
        if (box === 'inbox' || box === 'outbox') {
          store.fromHubBox(push.message, box, true);
        }
      }
    };
    socket.onclose = () => {
      if (ws === socket) {
        ws = null;
        retry(gen);
      }
    };
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ws) {
      void account.refreshUser();
    }
  });

  watch(
    () => account.loggedIn && account.can('messages:read') && store.loaded,
    (on) => {
      stop();
      if (on) {
        attempt = 0;
        void open(generation);
      }
    },
    { immediate: true },
  );
}
