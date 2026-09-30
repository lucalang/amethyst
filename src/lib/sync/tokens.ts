// Server-only MAL credential storage (service-role client required).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types.ts";
import { decryptSecret, encryptSecret, secretPurpose } from "./crypto.ts";
import { OAuthGrantError, refreshAccessToken, type OAuthClient, type TokenSet } from "./mal-oauth.ts";

type Admin = SupabaseClient<Database>;

export class ReconnectRequiredError extends Error {
  constructor(message = "MyAnimeList connection must be re-authorized") {
    super(message);
    this.name = "ReconnectRequiredError";
  }
}

const REFRESH_MARGIN_MS = 5 * 60_000;

export async function storeTokens(db: Admin, key: CryptoKey, userId: string, tokens: TokenSet): Promise<void> {
  const [access, refresh] = await Promise.all([
    encryptSecret(key, tokens.accessToken, secretPurpose.malAccess(userId)),
    encryptSecret(key, tokens.refreshToken, secretPurpose.malRefresh(userId)),
  ]);
  const { error } = await db.from("mal_credentials").upsert(
    {
      user_id: userId,
      access_token_ciphertext: access,
      refresh_token_ciphertext: refresh,
      access_expires_at: tokens.expiresAt.toISOString(),
      // MAL refresh tokens live for one month.
      refresh_expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Could not store MAL credentials: ${error.code ?? "unknown"}`);
}

export async function markReconnectRequired(db: Admin, userId: string, reason: string): Promise<void> {
  await db
    .from("mal_accounts")
    .update({ status: "reconnect_required", last_error: reason.slice(0, 300) })
    .eq("user_id", userId)
    .neq("status", "disconnected");
}

/** Returns a usable access token, refreshing (and persisting) it when close to expiry. */
export async function getValidAccessToken(
  db: Admin,
  key: CryptoKey,
  client: OAuthClient,
  userId: string,
  options: { forceRefresh?: boolean; fetch?: typeof fetch; now?: number } = {},
): Promise<string> {
  const { data: row, error } = await db
    .from("mal_credentials")
    .select("access_token_ciphertext, refresh_token_ciphertext, access_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load MAL credentials: ${error.code ?? "unknown"}`);
  if (!row) throw new ReconnectRequiredError("No MyAnimeList credentials stored");

  const now = options.now ?? Date.now();
  if (!options.forceRefresh && Date.parse(row.access_expires_at) - now > REFRESH_MARGIN_MS) {
    return decryptSecret(key, row.access_token_ciphertext, secretPurpose.malAccess(userId));
  }

  const refreshToken = await decryptSecret(key, row.refresh_token_ciphertext, secretPurpose.malRefresh(userId));
  let tokens: TokenSet;
  try {
    tokens = await refreshAccessToken(client, refreshToken, options.fetch);
  } catch (refreshError) {
    if (refreshError instanceof OAuthGrantError) {
      await markReconnectRequired(db, userId, "MyAnimeList refresh token was rejected; reconnect required.");
      throw new ReconnectRequiredError();
    }
    throw refreshError;
  }
  await storeTokens(db, key, userId, tokens);
  return tokens.accessToken;
}
