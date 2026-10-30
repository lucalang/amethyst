/**
 * Secret codes for the Vault (/vault). Codes are hashed on this machine: the database only ever
 * stores SHA-256 hashes, so a code can't be read back later.
 *
 *   npm run codes -- create --code "OPEN THE VAULT" --label "Shadow reward" --coins 500
 *   npm run codes -- create --label "Winter letter" --coins 100 --items vault-sigil,badge-comet
 *                           [--expires 2026-12-31] [--max 50] [--code "WORDS" | --custom]
 *   npm run codes -- list               # every code: rewards, expiry, uses and status (never the code)
 *   npm run codes -- disable <id>       # stops a code; rewards already granted stay
 *   npm run codes -- rewards            # item ids a code can grant
 *   npm run codes -- admins             # who can use the in-app admin panel (/admin)
 *   npm run codes -- admin-grant <email> [--owner]   # the account must have signed in once
 *   npm run codes -- admin-revoke <email>
 *
 * --code sets your own words; --custom asks for them with hidden input (kept out of shell history).
 * Without either, a random code is generated and printed once. Chosen codes ignore letter case,
 * surrounding spaces and repeated spaces ("open  the vault" = "OPEN THE VAULT"); random codes also
 * ignore dashes. Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (.env.local).
 */
import { createClient } from "@supabase/supabase-js";
import { CODE_RULES, compactCode, generateCode, hashCode, normalizePhrase } from "../src/lib/secret-codes";

function arg(name: string): string | true | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

function intArg(name: string): number | undefined {
  const value = arg(name);
  if (value === undefined) return undefined;
  const number = typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(number) || number < 0) throw new Error(`--${name} needs a whole number.`);
  return number;
}

/** Reads a line without echoing it, so custom codes don't end up on screen or in terminal scrollback. */
function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) return Promise.reject(new Error("--custom needs an interactive terminal."));
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u0003") return finish(new Error("Cancelled."));
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

function parseExpiry(value: string | true | undefined): string | null {
  if (value === undefined) return null;
  if (value === true) throw new Error("--expires needs a date such as 2026-12-31 or 2026-12-31T18:00:00Z.");
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59Z` : value);
  if (Number.isNaN(date.getTime())) throw new Error("--expires needs a date such as 2026-12-31 or 2026-12-31T18:00:00Z.");
  if (date.getTime() <= Date.now()) throw new Error("--expires is in the past.");
  return date.toISOString();
}

type CodeRow = {
  id: string;
  format: "compact" | "phrase";
  label: string;
  coins: number;
  starts_at: string | null;
  expires_at: string | null;
  per_account_limit: number;
  audience: "everyone" | "allowlist";
  max_redemptions: number | null;
  redemption_count: number;
  disabled_at: string | null;
  created_at: string;
  secret_code_items: { item_id: string }[];
  secret_code_achievements: { achievement_id: string }[];
};

function status(row: CodeRow) {
  if (row.disabled_at) return "disabled";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  if (row.max_redemptions !== null && row.redemption_count >= row.max_redemptions) return "used up";
  if (row.starts_at && new Date(row.starts_at).getTime() > Date.now()) return "scheduled";
  return "active";
}

const connect = (url: string, secret: string) => createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

/** The account id for an email (the account must have signed in once so its profile exists). */
async function accountId(admin: ReturnType<typeof connect>, email: string | undefined): Promise<string> {
  const wanted = email?.trim().toLowerCase();
  if (!wanted || !wanted.includes("@")) throw new Error("Give the account's email, for example: npm run codes -- admin-grant you@example.com");
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === wanted);
    if (user) {
      const { data: profile } = await admin.from("users").select("id").eq("id", user.id).maybeSingle();
      if (!profile) throw new Error("That account hasn't opened the app yet. Sign in once, then run this again.");
      return user.id;
    }
    if (data.users.length < 1000) break;
  }
  throw new Error("No account with that email. Sign in once, then run this again.");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  const admin = connect(url, secret);
  const command = process.argv[2];

  if (command === "create") {
    const label = arg("label");
    if (typeof label !== "string") throw new Error('Give the code a label, for example --label "Winter letter". Never put the code in the label.');
    const coins = intArg("coins") ?? 0;
    const itemsArg = arg("items");
    const items = typeof itemsArg === "string" ? [...new Set(itemsArg.split(",").map((item) => item.trim()).filter(Boolean))] : [];
    const max = intArg("max");
    const expires = parseExpiry(arg("expires"));

    const given = arg("code");
    const hidden = Boolean(arg("custom"));
    if (given === true) throw new Error('--code needs the words in quotes, for example --code "OPEN THE VAULT".');
    if (given !== undefined && hidden) throw new Error("Use either --code or --custom, not both.");

    let hashes: { code: string; loose: string; format: "compact" | "phrase" };
    let shown: string | null = null;
    if (given !== undefined || hidden) {
      const phrase = normalizePhrase(hidden ? await promptHidden("Code (hidden): ") : given!);
      if (!phrase) throw new Error(`${CODE_RULES} Example: --code "OPEN THE VAULT".`);
      if (hidden && normalizePhrase(await promptHidden("Same code again: ")) !== phrase) throw new Error("The two entries didn't match.");
      const letters = compactCode(phrase)!;
      if (letters.length < 8) console.warn("Note: short or common words are easier to guess. Wrong tries are limited per account.");
      hashes = { code: hashCode(phrase), loose: hashCode(letters), format: "phrase" };
      if (!hidden) shown = phrase;
    } else {
      const code = generateCode();
      const hash = hashCode(compactCode(code)!);
      hashes = { code: hash, loose: hash, format: "compact" };
      shown = code;
    }

    const { data, error } = await admin.rpc("admin_create_secret_code", {
      p_code_hash: hashes.code,
      p_loose_hash: hashes.loose,
      p_format: hashes.format,
      p_label: label,
      p_coins: coins,
      p_items: items,
      p_expires_at: expires,
      p_max_redemptions: max ?? null,
    });
    if (error) {
      throw new Error(
        error.code === "23505"
          ? "That code already exists, or one that differs only in case, spacing or punctuation. Codes can't be reused, even after they expire or are disabled."
          : error.message,
      );
    }
    console.log(`Created code ${data as string} (“${label}”): ${coins} coins${items.length ? `, ${items.join(", ")}` : ""}.`);
    console.log(`Expires: ${expires ?? "never"} · Limit: ${max ?? "none"} · One per account.`);
    if (hashes.format === "compact" && shown) {
      console.log("\nThe code (shown once, the database only keeps its hash):\n");
      console.log(`    ${shown}\n`);
    } else if (shown) {
      console.log(`\nPlayers type: ${shown}  (letter case and extra spaces don't matter)\n`);
    }
    return;
  }

  if (command === "list") {
    const { data, error } = await admin
      .from("secret_codes")
      .select(
        "id, format, label, coins, starts_at, expires_at, per_account_limit, audience, max_redemptions, redemption_count, disabled_at, created_at, secret_code_items(item_id), secret_code_achievements(achievement_id)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as CodeRow[];
    if (rows.length === 0) return console.log("No codes yet.");
    for (const row of rows) {
      const items = row.secret_code_items.map((item) => item.item_id).join(", ");
      const achievements = row.secret_code_achievements.map((item) => `achievement:${item.achievement_id}`).join(", ");
      console.log(`${row.id}  [${status(row)}]  ${row.label}  (${row.format === "phrase" ? "chosen words" : "compact"})`);
      console.log(
        `    ${row.coins} coins${items ? ` + ${items}` : ""}${achievements ? ` + ${achievements}` : ""} · used ${row.redemption_count}${row.max_redemptions === null ? "" : `/${row.max_redemptions}`} · ${row.per_account_limit} per account${row.audience === "allowlist" ? " · allowlist" : ""} · ${row.starts_at ? `starts ${row.starts_at} · ` : ""}expires ${row.expires_at ?? "never"}`,
      );
    }
    return;
  }

  if (command === "disable") {
    const id = process.argv[3];
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Usage: npm run codes -- disable <id> (ids are shown by `list`).");
    const { data, error } = await admin.rpc("admin_disable_secret_code", { p_id: id });
    if (error) throw new Error(error.message);
    console.log(data ? "Disabled. Rewards already granted stay with their owners." : "No active code with that id (already disabled?).");
    return;
  }

  if (command === "rewards") {
    const { data, error } = await admin.from("cosmetic_items").select("id, kind, secret, game").order("secret", { ascending: false }).order("kind").order("id");
    if (error) throw new Error(error.message);
    console.log("Secret items stay hidden from the shop until someone owns them. Any item id below can be granted.\n");
    for (const item of (data ?? []) as { id: string; kind: string; secret: boolean; game: string | null }[]) {
      console.log(`${item.secret ? "secret " : "       "} ${item.kind.padEnd(17)} ${item.id}${item.game ? ` (${item.game})` : ""}`);
    }
    return;
  }

  if (command === "admins") {
    const { data, error } = await admin.from("app_admins").select("user_id, role, granted_at").order("granted_at");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { user_id: string; role: string; granted_at: string }[];
    if (rows.length === 0) return console.log("No administrators yet. Run: npm run codes -- admin-grant <email> --owner");
    for (const row of rows) {
      const { data: found } = await admin.auth.admin.getUserById(row.user_id);
      console.log(`${row.role.padEnd(6)} ${found.user?.email ?? row.user_id}  (since ${row.granted_at})`);
    }
    return;
  }

  if (command === "admin-grant") {
    const id = await accountId(admin, process.argv[3]);
    const role = arg("owner") ? "owner" : "admin";
    const { error } = await admin.from("app_admins").upsert({ user_id: id, role }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    console.log(`${process.argv[3]} is now ${role === "owner" ? "the owner" : "an administrator"}. Reload the app to see Admin in the account menu.`);
    return;
  }

  if (command === "admin-revoke") {
    const id = await accountId(admin, process.argv[3]);
    const { data, error } = await admin.from("app_admins").delete().eq("user_id", id).select("user_id");
    if (error) throw new Error(error.message);
    console.log(data?.length ? "Removed. The admin panel is closed to that account from its next request." : "That account wasn't an administrator.");
    return;
  }

  console.log("Usage: npm run codes -- create|list|disable|rewards|admins|admin-grant|admin-revoke (see scripts/secret-codes.ts).");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
