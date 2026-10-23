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

import { defineStore } from 'pinia';
import { useDebounceFn } from '@vueuse/core';
import { computed, ref, watch } from 'vue';

import { mergeStatics } from '@/lib/hotspots';
import { kvDelete, kvGet, kvSet } from '@/lib/kv';
import {
  type AuthMetadata,
  authorizeURL,
  callbackCode,
  discoverAuth,
  exchange,
  fresh,
  OAuthError,
  type Pending,
  randomToken,
  redirectURI,
  refresh,
  revoke,
  type Tokens,
} from '@/lib/oauth';
import { hubOrigin } from '@/radio/discover';
import { useSettings } from '@/store/settings';

/** HubUser is the account behind a login. */
export type HubUser = { id: number; callsign: string; username: string; smsStorage?: boolean };

type Me = { id: number; callsign: string; username: string; sms_storage?: boolean };

function userOf(me: Me): HubUser {
  return { id: me.id, callsign: me.callsign, username: me.username, smsStorage: me.sms_storage };
}

/** HubHotspot is a hotspot that the account owns on its hub. */
export type HubHotspot = {
  id: number;
  callsign: string;
  description: string;
  location: string;
  ts1: number[];
  ts2: number[];
};

/** SavedHotspot is what this device keeps of a hotspot it can log in as. */
export type SavedHotspot = { password: string; name: string };

type Account = { host: string; meta: AuthMetadata; tokens: Tokens; user: HubUser };

type RepeaterAnswer = {
  id: number;
  callsign?: string;
  description?: string;
  location?: string;
  city?: string;
  state?: string;
  ts1_static_talkgroups?: { id: number }[] | null;
  ts2_static_talkgroups?: { id: number }[] | null;
};

const ACCOUNT_KEY = 'account';
const SAVED_KEY = 'hotspot-passwords';
const PENDING_KEY = 'oauth-pending';

/** BROWSER_RADIO is the description dmr-web sends in its hotspot login. */
export const BROWSER_RADIO = 'dmr-web radio';

/** LoginEndedError means the hub no longer accepts this app's tokens. */
export class LoginEndedError extends Error {}

/** HubError is an answer of the hub other than a success, with its HTTP status. */
export class HubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** placeOf tidies a place such as "Dallas, Texas", and gives "" for one that only has separators. */
export function placeOf(s: string | undefined): string {
  return (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .join(', ');
}

/** hotspotOf reads a hotspot from the hub's repeater JSON. */
export function hotspotOf(r: RepeaterAnswer): HubHotspot {
  return {
    id: r.id,
    callsign: r.callsign ?? '',
    description: r.description ?? '',
    location: placeOf(r.location) || placeOf([r.city, r.state].join(',')),
    ts1: (r.ts1_static_talkgroups ?? []).map((t) => t.id),
    ts2: (r.ts2_static_talkgroups ?? []).map((t) => t.id),
  };
}

function clientId(): string {
  return location.origin;
}

async function locked<T>(fn: () => Promise<T>): Promise<T> {
  if (navigator.locks) {
    return navigator.locks.request('dmrhub-refresh', fn);
  }
  return fn();
}

export const useAccount = defineStore('account', () => {
  const account = ref<Account | null>(null);
  const saved = ref<Record<string, SavedHotspot>>({});
  const hotspots = ref<HubHotspot[]>([]);
  const hotspotsLoaded = ref(false);
  const loaded = ref(false);
  const error = ref('');

  const loggedIn = computed(() => account.value !== null);
  const user = computed(() => account.value?.user ?? null);
  const host = computed(() => account.value?.host ?? '');
  const scope = computed(() => account.value?.tokens.scope ?? []);

  async function load(): Promise<void> {
    account.value = (await kvGet<Account>(ACCOUNT_KEY)) ?? null;
    saved.value = (await kvGet<Record<string, SavedHotspot>>(SAVED_KEY)) ?? {};
    loaded.value = true;
  }

  async function storeAccount(a: Account | null): Promise<void> {
    account.value = a;
    if (a) {
      await kvSet(ACCOUNT_KEY, JSON.parse(JSON.stringify(a)) as Account);
    } else {
      await kvDelete(ACCOUNT_KEY);
    }
  }

  async function login(hubHost: string): Promise<void> {
    error.value = '';
    const meta = await discoverAuth(hubHost);
    const p: Pending = { host: hubHost.trim(), state: randomToken(), verifier: randomToken(), redirect: redirectURI(clientId()), meta };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    location.assign(await authorizeURL(p, clientId()));
  }

  function pending(): Pending | null {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as Pending;
    } catch {
      return null;
    }
  }

  async function complete(query: URLSearchParams): Promise<string> {
    const p = pending();
    if (!p) {
      throw new OAuthError('invalid_state', 'This login was not started here. Log in again.');
    }
    const code = callbackCode(p, query);
    const tokens = await exchange(p, clientId(), code);
    const me = await fetchJSON<Me>(p.host, '/api/v1/users/me', tokens.access);
    await storeAccount({ host: p.host, meta: p.meta, tokens, user: userOf(me) });
    hotspotsLoaded.value = false;
    return p.host;
  }

  async function logout(): Promise<void> {
    const a = account.value;
    await storeAccount(null);
    hotspots.value = [];
    hotspotsLoaded.value = false;
    if (a) {
      await revoke(a.meta, clientId(), a.tokens.refresh).catch(() => undefined);
    }
  }

  async function ended(): Promise<never> {
    await storeAccount(null);
    hotspots.value = [];
    hotspotsLoaded.value = false;
    error.value = 'Your DMRHub login ended. Log in again.';
    throw new LoginEndedError(error.value);
  }

  async function accessToken(force = false): Promise<string> {
    const a = account.value;
    if (!a) {
      throw new LoginEndedError('Not logged in');
    }
    if (!force && fresh(a.tokens)) {
      return a.tokens.access;
    }
    return locked(async () => {
      const current = (await kvGet<Account>(ACCOUNT_KEY)) ?? null;
      if (!current) {
        account.value = null;
        throw new LoginEndedError('Not logged in');
      }
      if (current.tokens.refresh !== a.tokens.refresh || (!force && fresh(current.tokens))) {
        account.value = current;
        return current.tokens.access;
      }
      let tokens: Tokens;
      try {
        tokens = await refresh(current.meta, clientId(), current.tokens.refresh);
      } catch (err) {
        if (err instanceof OAuthError) {
          return ended();
        }
        throw err;
      }
      await storeAccount({ ...current, tokens });
      return tokens.access;
    });
  }

  async function fetchJSON<T>(hubHost: string, path: string, token: string, init: RequestInit = {}): Promise<T> {
    const url = new URL(path, hubOrigin(hubHost));
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        credentials: 'omit',
        cache: 'no-store',
        headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new Error(`Could not reach ${url.host}`);
    }
    if (res.status === 401) {
      throw new OAuthError('invalid_token');
    }
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      throw new HubError(body.error ?? `${url.host} answered ${res.status}`, res.status);
    }
    return body;
  }

  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const a = account.value;
    if (!a) {
      throw new LoginEndedError('Not logged in');
    }
    try {
      return await fetchJSON<T>(a.host, path, await accessToken(), init);
    } catch (err) {
      if (!(err instanceof OAuthError)) {
        throw err;
      }
    }
    try {
      return await fetchJSON<T>(a.host, path, await accessToken(true), init);
    } catch (err) {
      if (err instanceof OAuthError) {
        return ended();
      }
      throw err;
    }
  }

  /** refreshUser reads the account again, to learn of changes made on the hub, such as to SMS Storage. */
  async function refreshUser(): Promise<void> {
    const before = account.value;
    if (!before) {
      return;
    }
    const me = await api<Me>('/api/v1/users/me').catch(() => null);
    const now = account.value;
    if (me && now && now.host === before.host) {
      await storeAccount({ ...now, user: userOf(me) });
    }
  }

  async function loadHotspots(): Promise<void> {
    const got = await api<{ repeaters?: RepeaterAnswer[] }>('/api/v1/repeaters/my?limit=none');
    hotspots.value = (got.repeaters ?? []).map(hotspotOf).sort((x, y) => x.id - y.id);
    hotspotsLoaded.value = true;
  }

  async function saveHotspot(id: number, h: SavedHotspot): Promise<void> {
    saved.value = { ...saved.value, [String(id)]: h };
    await kvSet(SAVED_KEY, JSON.parse(JSON.stringify(saved.value)) as Record<string, SavedHotspot>);
  }

  async function register(id: number, name: string): Promise<string> {
    const got = await api<{ password?: string }>('/api/v1/repeaters', { method: 'POST', body: JSON.stringify({ id, type: 'mmdvm' }) });
    if (!got.password) {
      throw new Error('The hub sent no password for the hotspot');
    }
    await saveHotspot(id, { password: got.password, name });
    await loadHotspots().catch(() => undefined);
    return got.password;
  }

  async function setStatics(id: number, ts1: number[], ts2: number[]): Promise<void> {
    await api('/api/v1/repeaters/' + id + '/talkgroups', {
      method: 'POST',
      body: JSON.stringify({ ts1_static_talkgroups: ts1.map((t) => ({ id: t })), ts2_static_talkgroups: ts2.map((t) => ({ id: t })) }),
    });
    hotspots.value = hotspots.value.map((h) => (h.id === id ? { ...h, ts1, ts2 } : h));
  }

  async function talkgroupNames(): Promise<Map<number, string>> {
    const names = new Map<number, string>();
    if (!can('talkgroups:read')) {
      return names;
    }
    const got = await api<{ talkgroups?: { id: number; name: string }[] }>('/api/v1/talkgroups?limit=none').catch(() => ({ talkgroups: [] }));
    for (const t of got.talkgroups ?? []) {
      names.set(t.id, t.name);
    }
    return names;
  }

  async function choose(id: number, password: string, callsign: string): Promise<void> {
    const settings = useSettings().settings;
    const h = hotspots.value.find((x) => x.id === id);
    settings.hotspot = { id, password, callsign: callsign.trim().toUpperCase(), location: h?.location ?? settings.hotspot.location };
    if (h && (h.ts1.length || h.ts2.length)) {
      const names = await talkgroupNames();
      settings.talkgroups = { 1: mergeStatics(settings.talkgroups[1], h.ts1, names), 2: mergeStatics(settings.talkgroups[2], h.ts2, names) };
    }
  }

  function can(s: string): boolean {
    return scope.value.includes(s);
  }

  const staticsError = ref('');

  function staticIds(slot: 1 | 2): number[] {
    return useSettings()
      .settings.talkgroups[slot].filter((t) => t.static)
      .map((t) => t.id)
      .sort((x, y) => x - y);
  }

  const pushStatics = useDebounceFn(async () => {
    const id = useSettings().settings.hotspot.id;
    const h = hotspots.value.find((x) => x.id === id);
    if (!h || !can('hotspots:talkgroups')) {
      return;
    }
    const ts1 = staticIds(1);
    const ts2 = staticIds(2);
    const same = (a: number[], b: number[]) => a.length === b.length && [...b].sort((x, y) => x - y).every((v, i) => v === a[i]);
    if (same(ts1, h.ts1) && same(ts2, h.ts2)) {
      staticsError.value = '';
      return;
    }
    try {
      await setStatics(id, ts1, ts2);
      staticsError.value = '';
    } catch (err) {
      staticsError.value = err instanceof Error ? err.message : String(err);
    }
  }, 800);

  watch(
    () => [loggedIn.value, hotspotsLoaded.value, useSettings().settings.hotspot.id, staticIds(1).join(','), staticIds(2).join(',')].join('|'),
    () => {
      if (loggedIn.value && hotspotsLoaded.value) {
        void pushStatics();
      }
    },
  );

  return {
    account,
    saved,
    hotspots,
    hotspotsLoaded,
    loaded,
    error,
    loggedIn,
    user,
    host,
    scope,
    load,
    login,
    complete,
    logout,
    accessToken,
    api,
    refreshUser,
    loadHotspots,
    saveHotspot,
    register,
    setStatics,
    choose,
    can,
    staticsError,
  };
});
