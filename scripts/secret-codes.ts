/**
 * Secret codes for the Vault (/vault). Codes are hashed on this machine: the database only ever
 * stores SHA-256 hashes, so a code can't be read back later. Copy it when it's printed.
 *
 *   npm run codes -- create --label "Winter letter" --coins 100 --items vault-sigil,badge-comet
 *                           [--expires 2026-12-31] [--max 50] [--custom]
 *   npm run codes -- list               # every code: rewards, expiry, uses and status (never the code)
 *   npm run codes -- disable <id>       # stops a code; rewards already granted stay
 *   npm run codes -- rewards            # item ids a code can grant
 *
 * --custom asks for your own code (hidden input) instead of generating a random one. Keep custom
 * codes long and unguessable. Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (.env.local).
 */
import { createClient } from "@supabase/supabase-js";
import { generateCode, hashCode, normalizeCode } from "../src/lib/secret-codes";

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
  label: string;
  coins: number;
  expires_at: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  disabled_at: string | null;
  created_at: string;
  secret_code_items: { item_id: string }[];
};

function status(row: CodeRow) {
  if (row.disabled_at) return "disabled";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  if (row.max_redemptions !== null && row.redemption_count >= row.max_redemptions) return "used up";
  return "active";
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const command = process.argv[2];

  if (command === "create") {
    const label = arg("label");
    if (typeof label !== "string") throw new Error('Give the code a label, for example --label "Winter letter". Never put the code in the label.');
    const coins = intArg("coins") ?? 0;
    const itemsArg = arg("items");
    const items = typeof itemsArg === "string" ? [...new Set(itemsArg.split(",").map((item) => item.trim()).filter(Boolean))] : [];
    const max = intArg("max");
    const expires = parseExpiry(arg("expires"));

    let code: string;
    if (arg("custom")) {
      const typed = normalizeCode(await promptHidden("Code (hidden): "));
      if (!typed) throw new Error("Codes are 4 to 40 letters and numbers (spaces and dashes are ignored).");
      if (normalizeCode(await promptHidden("Same code again: ")) !== typed) throw new Error("The two entries didn't match.");
      if (typed.length < 10) console.warn("Short codes are easy to guess. Prefer 12 characters or more.");
      code = typed;
    } else {
      code = generateCode();
    }

    const { data, error } = await admin.rpc("admin_create_secret_code", {
      p_code_hash: hashCode(normalizeCode(code)!),
      p_label: label,
      p_coins: coins,
      p_items: items,
      p_expires_at: expires,
      p_max_redemptions: max ?? null,
    });
    if (error) throw new Error(error.code === "23505" ? "That code already exists." : error.message);
    console.log(`Created code ${data as string} (“${label}”): ${coins} coins${items.length ? `, ${items.join(", ")}` : ""}.`);
    console.log(`Expires: ${expires ?? "never"} · Limit: ${max ?? "none"} · One per account.`);
    if (!arg("custom")) {
      console.log("\nThe code (shown once, the database only keeps its hash):\n");
      console.log(`    ${code}\n`);
    }
    return;
  }

  if (command === "list") {
    const { data, error } = await admin
      .from("secret_codes")
      .select("id, label, coins, expires_at, max_redemptions, redemption_count, disabled_at, created_at, secret_code_items(item_id)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as CodeRow[];
    if (rows.length === 0) return console.log("No codes yet.");
    for (const row of rows) {
      const items = row.secret_code_items.map((item) => item.item_id).join(", ");
      console.log(`${row.id}  [${status(row)}]  ${row.label}`);
      console.log(
        `    ${row.coins} coins${items ? ` + ${items}` : ""} · used ${row.redemption_count}${row.max_redemptions === null ? "" : `/${row.max_redemptions}`} · expires ${row.expires_at ?? "never"}`,
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

  console.log("Usage: npm run codes -- create|list|disable|rewards (see scripts/secret-codes.ts).");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
