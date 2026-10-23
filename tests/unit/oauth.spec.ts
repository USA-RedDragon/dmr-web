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

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  allowedSummary,
  authorizeURL,
  callbackCode,
  challengeOf,
  exchange,
  fresh,
  metadataOf,
  OAuthError,
  type Pending,
  redirectURI,
  refresh,
  SCOPES,
} from '@/lib/oauth';

const doc = {
  issuer: 'https://dmrhub.net',
  authorization_endpoint: 'https://dmrhub.net/oauth/authorize',
  token_endpoint: 'https://dmrhub.net/api/v1/oauth/token',
  revocation_endpoint: 'https://dmrhub.net/api/v1/oauth/revoke',
  code_challenge_methods_supported: ['S256'],
};

const pending: Pending = {
  host: 'dmrhub.net',
  state: 'st',
  verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  redirect: 'https://radio.dmrhub.net/oauth/callback',
  meta: metadataOf('dmrhub.net', doc),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('challengeOf', () => {
  it('matches the S256 example of RFC 7636', async () => {
    expect(await challengeOf(pending.verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('metadataOf', () => {
  it('needs S256 and token endpoints on the hub', () => {
    expect(() => metadataOf('dmrhub.net', { ...doc, code_challenge_methods_supported: ['plain'] })).toThrow(/S256/);
    expect(() => metadataOf('dmrhub.net', { ...doc, token_endpoint: 'https://evil.example/token' })).toThrow(/another origin/);
    expect(() => metadataOf('dmrhub.net', { issuer: 'https://dmrhub.net' })).toThrow(/does not let apps log in/);
  });
});

describe('authorizeURL', () => {
  it('asks for every scope with a PKCE challenge', async () => {
    const u = new URL(await authorizeURL(pending, 'https://radio.dmrhub.net'));
    expect(u.origin + u.pathname).toBe('https://dmrhub.net/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe('https://radio.dmrhub.net');
    expect(u.searchParams.get('redirect_uri')).toBe(redirectURI('https://radio.dmrhub.net'));
    expect(u.searchParams.get('scope')).toBe(SCOPES.join(' '));
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('code_challenge')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(u.searchParams.get('state')).toBe('st');
  });
});

describe('callbackCode', () => {
  const q = (s: string) => new URLSearchParams(s);
  it('returns the code of a matching answer', () => {
    expect(callbackCode(pending, q('code=abc&state=st&iss=https%3A%2F%2Fdmrhub.net'))).toBe('abc');
  });
  it('refuses another state, another issuer and a denial', () => {
    expect(() => callbackCode(pending, q('code=abc&state=xx'))).toThrow(OAuthError);
    expect(() => callbackCode(pending, q('code=abc&state=st&iss=https%3A%2F%2Fevil.example'))).toThrow(/another hub/);
    expect(() => callbackCode(pending, q('error=access_denied&state=st'))).toThrow(/did not allow/);
    expect(() => callbackCode(pending, q('state=st'))).toThrow(/no login code/);
  });
});

describe('token requests', () => {
  it('posts the code with its verifier and reads the tokens', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 900, scope: 'messages:read hotspots:read' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetch);
    const t = await exchange(pending, 'https://radio.dmrhub.net', 'abc', () => 1000);
    expect(t).toEqual({ access: 'a', refresh: 'r', expiresAt: 901_000, scope: ['messages:read', 'hotspots:read'] });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(doc.token_endpoint);
    const body = init.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe(pending.verifier);
    expect(body.get('redirect_uri')).toBe(pending.redirect);
    expect(init.credentials).toBe('omit');
  });

  it('turns a refused refresh into an OAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })));
    await expect(refresh(pending.meta, 'https://radio.dmrhub.net', 'r')).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('keeps a server failure apart from a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    await expect(refresh(pending.meta, 'https://radio.dmrhub.net', 'r')).rejects.not.toBeInstanceOf(OAuthError);
  });
});

describe('fresh', () => {
  it('counts a token as spent 30 s before its end', () => {
    const t = { access: 'a', refresh: 'r', expiresAt: 100_000, scope: [] };
    expect(fresh(t, 60_000)).toBe(true);
    expect(fresh(t, 75_000)).toBe(false);
  });
});

describe('allowedSummary', () => {
  it('names each kind of access once', () => {
    expect(allowedSummary([...SCOPES])).toBe('talkgroups, last heard, messages, hotspots, hotspot talkgroups');
  });
});
