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

import { hubOrigin } from '@/radio/discover';

/** SCOPES are what dmr-web asks a hub for. */
export const SCOPES = [
  'talkgroups:read',
  'lastheard:read',
  'messages:read',
  'hotspots:read',
  'hotspots:register',
  'hotspots:talkgroups',
] as const;

/** SCOPE_LABELS name each scope the way the account card lists it. */
export const SCOPE_LABELS: Record<string, string> = {
  'talkgroups:read': 'talkgroups',
  'lastheard:read': 'last heard',
  'messages:read': 'messages',
  'hotspots:read': 'hotspots',
  'hotspots:register': 'hotspots',
  'hotspots:talkgroups': 'hotspot talkgroups',
};

/** AuthMetadata is the part of a hub's discovery document dmr-web uses. */
export type AuthMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint: string;
};

/** Tokens are what a token endpoint hands out, with the time the access token ends. */
export type Tokens = { access: string; refresh: string; expiresAt: number; scope: string[] };

/** Pending is what a login keeps across the trip to the hub's consent page. */
export type Pending = { host: string; state: string; verifier: string; redirect: string; meta: AuthMetadata };

/** OAuthError is a refusal from the hub, with its OAuth error code. */
export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** EXPIRY_SLACK_MS is how long before its end an access token is refreshed. */
export const EXPIRY_SLACK_MS = 30_000;

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    s += String.fromCharCode(b);
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** randomToken returns 32 random bytes in base64url. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** challengeOf returns the S256 code challenge of verifier. */
export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** redirectURI is where the hub sends the browser back to after consent. */
export function redirectURI(origin: string): string {
  return `${origin}/oauth/callback`;
}

/** metadataOf checks a discovery document and keeps what dmr-web needs. */
export function metadataOf(host: string, doc: Partial<AuthMetadata> & { code_challenge_methods_supported?: string[] }): AuthMetadata {
  const origin = hubOrigin(host).origin;
  const { issuer, authorization_endpoint, token_endpoint, revocation_endpoint } = doc;
  if (!issuer || !authorization_endpoint || !token_endpoint || !revocation_endpoint) {
    throw new Error(`${hubOrigin(host).host} does not let apps log in`);
  }
  if (!doc.code_challenge_methods_supported?.includes('S256')) {
    throw new Error(`${hubOrigin(host).host} does not support PKCE with S256`);
  }
  for (const u of [token_endpoint, revocation_endpoint]) {
    if (new URL(u).origin !== origin) {
      throw new Error(`${hubOrigin(host).host} sent token endpoints on another origin`);
    }
  }
  return { issuer, authorization_endpoint, token_endpoint, revocation_endpoint };
}

/** discoverAuth reads the OAuth discovery document of a hub. */
export async function discoverAuth(host: string): Promise<AuthMetadata> {
  const url = new URL('/.well-known/oauth-authorization-server', hubOrigin(host));
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  } catch {
    throw new Error(`Could not reach ${url.host}`);
  }
  if (res.status === 404) {
    throw new Error(`${url.host} does not let apps log in`);
  }
  if (!res.ok) {
    throw new Error(`${url.host} answered ${res.status}`);
  }
  return metadataOf(host, (await res.json()) as Partial<AuthMetadata>);
}

/** authorizeURL is the consent page for p, with the PKCE challenge of its verifier. */
export async function authorizeURL(p: Pending, clientId: string): Promise<string> {
  const u = new URL(p.meta.authorization_endpoint);
  u.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: p.redirect,
    scope: SCOPES.join(' '),
    state: p.state,
    code_challenge: await challengeOf(p.verifier),
    code_challenge_method: 'S256',
  }).toString();
  return u.toString();
}

/** callbackCode checks the query the hub came back with and returns the code. */
export function callbackCode(p: Pending, query: URLSearchParams): string {
  if (query.get('state') !== p.state) {
    throw new OAuthError('invalid_state', 'The login answer does not match this login. Log in again.');
  }
  const iss = query.get('iss');
  if (iss !== null && iss !== p.meta.issuer) {
    throw new OAuthError('invalid_issuer', 'The login answer came from another hub. Log in again.');
  }
  const err = query.get('error');
  if (err === 'access_denied') {
    throw new OAuthError(err, 'You did not allow dmr-web to use your account.');
  }
  if (err) {
    throw new OAuthError(err, `The hub refused the login (${err}).`);
  }
  const code = query.get('code');
  if (!code) {
    throw new OAuthError('invalid_request', 'The hub sent no login code.');
  }
  return code;
}

type TokenAnswer = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };

async function tokenRequest(endpoint: string, form: Record<string, string>, now: () => number): Promise<Tokens> {
  let res: Response;
  try {
    res = await fetch(endpoint, { method: 'POST', body: new URLSearchParams(form), credentials: 'omit', cache: 'no-store' });
  } catch {
    throw new Error(`Could not reach ${new URL(endpoint).host}`);
  }
  const body = (await res.json().catch(() => ({}))) as TokenAnswer;
  if (!res.ok || !body.access_token || !body.refresh_token) {
    if (res.status >= 500) {
      throw new Error(`${new URL(endpoint).host} answered ${res.status}`);
    }
    throw new OAuthError(body.error ?? 'invalid_grant');
  }
  return {
    access: body.access_token,
    refresh: body.refresh_token,
    expiresAt: now() + (body.expires_in ?? 900) * 1000,
    scope: (body.scope ?? '').split(' ').filter(Boolean),
  };
}

/** exchange trades the code of a login for tokens. */
export function exchange(p: Pending, clientId: string, code: string, now = Date.now): Promise<Tokens> {
  return tokenRequest(
    p.meta.token_endpoint,
    { grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: p.redirect, code_verifier: p.verifier },
    now,
  );
}

/** refresh spends a refresh token for new tokens. */
export function refresh(meta: AuthMetadata, clientId: string, token: string, now = Date.now): Promise<Tokens> {
  return tokenRequest(meta.token_endpoint, { grant_type: 'refresh_token', refresh_token: token, client_id: clientId }, now);
}

/** revoke ends the grant behind token. */
export async function revoke(meta: AuthMetadata, clientId: string, token: string): Promise<void> {
  const res = await fetch(meta.revocation_endpoint, {
    method: 'POST',
    body: new URLSearchParams({ token, client_id: clientId, token_type_hint: 'refresh_token' }),
    credentials: 'omit',
  });
  if (!res.ok) {
    throw new Error(`${new URL(meta.revocation_endpoint).host} answered ${res.status}`);
  }
}

/** fresh reports whether an access token still has time left at now. */
export function fresh(t: Tokens, now = Date.now()): boolean {
  return t.expiresAt - EXPIRY_SLACK_MS > now;
}

/** allowedSummary lists scope the way the account card shows them. */
export function allowedSummary(scope: string[]): string {
  const out: string[] = [];
  for (const s of scope) {
    const label = SCOPE_LABELS[s];
    if (label && !out.includes(label)) {
      out.push(label);
    }
  }
  return out.join(', ');
}
