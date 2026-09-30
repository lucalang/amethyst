import "server-only";
import { malConfig, serverEnv, type MalConfig } from "@/lib/env";
import { createMalApi } from "@/lib/providers/mal";
import { realSleep } from "@/lib/providers/http";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/supabase/auth";
import { decryptSecret, encryptSecret, importEncryptionKey, secretPurpose, sha256Hex } from "./crypto";
import { buildAuthorizeUrl, exchangeAuthorizationCode, generateCodeVerifier, generateState, isWellFormedState } from "./mal-oauth";
import { storeTokens } from "./tokens";

const STATE_TTL_MS = 10 * 60_000;

export type ConnectOutcome = "connected" | "not_configured" | "invalid_state" | "denied" | "exchange_failed";

function requireConfig(): MalConfig {
  const config = malConfig();
  if (!config) throw new Error("MyAnimeList is not configured");
  return config;
}

/** Create a single-use, user-bound OAuth state + PKCE verifier and return the MAL authorize URL. */
export async function startMalAuthorization(userId: string): Promise<string> {
  const config = requireConfig();
  const key = await importEncryptionKey(serverEnv().TOKEN_ENCRYPTION_KEY);
  const state = generateState();
  const verifier = generateCodeVerifier();
  const stateHash = await sha256Hex(state);
  const admin = createAdminClient();

  // Keep at most a handful of outstanding attempts per user.
  await admin.from("oauth_states").delete().eq("user_id", userId).lt("expires_at", new Date().toISOString());

  const { error } = await admin.from("oauth_states").insert({
    state_hash: stateHash,
    user_id: userId,
    code_verifier_ciphertext: await encryptSecret(key, verifier, secretPurpose.pkce(userId, stateHash)),
    redirect_path: "/sync",
    expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`Could not store OAuth state (${error.code ?? "unknown"})`);

  return buildAuthorizeUrl({ authorizeUrl: config.authorizeUrl, clientId: config.clientId, redirectUri: config.redirectUri, state, codeVerifier: verifier });
}

/** Validate state (user-bound, unexpired, single use), exchange the code server-side and store encrypted tokens. */
export async function completeMalAuthorization(ctx: AuthContext, params: URLSearchParams): Promise<ConnectOutcome> {
  const config = malConfig();
  if (!config) return "not_configured";
  if (params.get("error")) return "denied";

  const state = params.get("state");
  const code = params.get("code");
  if (!isWellFormedState(state) || !code || code.length > 4096) return "invalid_state";

  const admin = createAdminClient();
  const stateHash = await sha256Hex(state);
  // Atomic single-use consumption bound to the signed-in user.
  const { data: consumed } = await admin
    .from("oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state_hash", stateHash)
    .eq("user_id", ctx.userId)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("code_verifier_ciphertext")
    .maybeSingle();
  if (!consumed) return "invalid_state";

  const key = await importEncryptionKey(serverEnv().TOKEN_ENCRYPTION_KEY);
  const verifier = await decryptSecret(key, consumed.code_verifier_ciphertext, secretPurpose.pkce(ctx.userId, stateHash));

  let tokens;
  let me;
  try {
    tokens = await exchangeAuthorizationCode(
      { clientId: config.clientId, clientSecret: config.clientSecret, tokenUrl: config.tokenUrl },
      { code, redirectUri: config.redirectUri, codeVerifier: verifier },
    );
    me = await createMalApi({ apiBaseUrl: config.apiBaseUrl, http: { fetch: globalThis.fetch.bind(globalThis), sleep: realSleep } }).getMe(
      tokens.accessToken,
    );
  } catch (error) {
    console.error("MAL authorization failed:", error instanceof Error ? error.name : "unknown");
    return "exchange_failed";
  }

  await storeTokens(admin, key, ctx.userId, tokens);

  const { data: existing } = await admin.from("mal_accounts").select("mal_user_id, initial_sync, outbound_enabled").eq("user_id", ctx.userId).maybeSingle();
  const sameAccount = existing?.mal_user_id === me.id;
  if (existing && !sameAccount) {
    // A different MAL account invalidates previous baselines and the cached list.
    await Promise.all([
      admin.from("sync_baselines").delete().eq("user_id", ctx.userId),
      admin.from("mal_list_entries").delete().eq("user_id", ctx.userId),
      admin.from("sync_outbox").update({ state: "superseded", completed_at: new Date().toISOString() }).eq("user_id", ctx.userId).in("state", ["pending", "in_flight"]),
    ]);
  }
  const keepApproval = sameAccount && existing?.initial_sync === "approved";
  const { error } = await admin.from("mal_accounts").upsert(
    {
      user_id: ctx.userId,
      mal_user_id: me.id,
      mal_username: me.name,
      status: "connected",
      initial_sync: keepApproval ? "approved" : "pending",
      outbound_enabled: keepApproval ? Boolean(existing?.outbound_enabled) : false,
      last_error: null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Could not save the MAL connection (${error.code ?? "unknown"})`);

  // Full paginated pull (as the user, so RLS applies to the enqueue).
  await ctx.supabase.from("jobs").insert({ kind: "mal_pull", input: { reason: "connect" }, dedupe_key: "mal_pull" });
  return "connected";
}

/** Remove tokens, pending OAuth state and cached remote data. Local progress is untouched. */
export async function disconnectMal(userId: string): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  await Promise.all([
    admin.from("mal_credentials").delete().eq("user_id", userId),
    admin.from("oauth_states").delete().eq("user_id", userId),
    admin.from("mal_list_entries").delete().eq("user_id", userId),
    admin.from("sync_baselines").delete().eq("user_id", userId),
    admin.from("sync_conflicts").delete().eq("user_id", userId).eq("state", "open"),
    admin.from("sync_outbox").update({ state: "superseded", completed_at: now }).eq("user_id", userId).in("state", ["pending", "in_flight"]),
    admin.from("jobs").update({ status: "cancelled", finished_at: now }).eq("user_id", userId).eq("kind", "mal_pull").in("status", ["queued", "running"]),
  ]);
  await admin
    .from("mal_accounts")
    .update({ status: "disconnected", outbound_enabled: false, initial_sync: "pending", last_error: null })
    .eq("user_id", userId);
}
