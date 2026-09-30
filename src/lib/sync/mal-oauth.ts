// MyAnimeList OAuth 2.0 authorization-code flow with PKCE.
// MAL documents only the `plain` code_challenge_method, so the challenge
// equals the verifier; the verifier never leaves the server except in the
// server-to-server token exchange.
import { z } from "zod";
import { ProviderError } from "../providers/http.ts";
import { randomBase64Url } from "./crypto.ts";

export class OAuthGrantError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "OAuthGrantError";
  }
}

export type OAuthClient = {
  clientId: string;
  clientSecret?: string;
  tokenUrl: string;
};

export type TokenSet = { accessToken: string; refreshToken: string; expiresAt: Date };

/** RFC 7636 verifier: 43-128 chars from the unreserved set. 48 bytes → 64 chars. */
export function generateCodeVerifier(): string {
  return randomBase64Url(48);
}

export function generateState(): string {
  return randomBase64Url(32);
}

export function isWellFormedState(value: string | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function buildAuthorizeUrl(options: {
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
}): string {
  const url = new URL(options.authorizeUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    state: options.state,
    code_challenge: options.codeVerifier,
    code_challenge_method: "plain",
  }).toString();
  return url.toString();
}

const tokenResponse = z.object({
  token_type: z.string(),
  expires_in: z.number().int().positive(),
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});

async function tokenRequest(client: OAuthClient, params: Record<string, string>, fetchImpl: typeof fetch): Promise<TokenSet> {
  const body = new URLSearchParams({ client_id: client.clientId, ...params });
  if (client.clientSecret) body.set("client_secret", client.clientSecret);
  const response = await fetchImpl(client.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await response.json().catch(() => null)) as unknown;
  if (response.status >= 500 || response.status === 429) {
    throw new ProviderError(`MyAnimeList token endpoint responded ${response.status}`, "mal", response.status, true);
  }
  if (!response.ok) {
    const code = (json as { error?: string } | null)?.error ?? `http_${response.status}`;
    throw new OAuthGrantError(`MyAnimeList token request failed (${code})`, code);
  }
  const parsed = tokenResponse.safeParse(json);
  if (!parsed.success) throw new OAuthGrantError("MyAnimeList returned an unexpected token response", "invalid_response");
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    expiresAt: new Date(Date.now() + parsed.data.expires_in * 1000),
  };
}

export function exchangeAuthorizationCode(
  client: OAuthClient,
  options: { code: string; redirectUri: string; codeVerifier: string },
  fetchImpl: typeof fetch = fetch,
): Promise<TokenSet> {
  return tokenRequest(
    client,
    { grant_type: "authorization_code", code: options.code, redirect_uri: options.redirectUri, code_verifier: options.codeVerifier },
    fetchImpl,
  );
}

export function refreshAccessToken(client: OAuthClient, refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<TokenSet> {
  return tokenRequest(client, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}
