import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

process.loadEnvFile(".env.local");
const BASE = process.env.BASE ?? "http://localhost:3001";
const RUNS = Number(process.env.RUNS ?? 2);
const LH = "/home/luca/.nvm/versions/node/v24.14.0/lib/node_modules/@lhci/cli/node_modules/lighthouse/cli/index.js";
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
for (const u of list.users.filter((u) => /^(perf|lh)-check-\d+@example\.com$/.test(u.email ?? ""))) {
  await admin.auth.admin.deleteUser(u.id);
  console.log("deleted leftover", u.email);
}
if (process.env.CLEAN_ONLY) process.exit(0);

const email = `lh-check-${Date.now()}@example.com`;
const password = randomBytes(18).toString("base64url");
const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (ce) throw ce;
try {
  const user = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await user.auth.signInWithPassword({ email, password });
  await user.rpc("ensure_profile");
  await user.rpc("update_user_settings", { patch: { homeStyle: "flashy", motion: "full" } });
  const cols = [];
  for (const name of ["Anime", "Games", "Films", "Books", "Manga", "Series", "Music"]) cols.push((await user.from("collections").insert({ name }).select("id").single()).data.id);
  const rows = Array.from({ length: 341 }, (_, i) => ({ collection_id: cols[i % 7], title: `Perf entry ${i}`, cover_url: `https://picsum.photos/seed/amx${i}/400/600` }));
  const { data: entries } = await user.from("entries").insert(rows).select("id");
  await user.from("entry_pins").insert(entries.slice(0, 5).map((e) => ({ entry_id: e.id })));
  await user.from("entry_visits").insert(entries.slice(5, 25).map((e) => ({ entry_id: e.id })));

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 90000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("form button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90000 });
  // Warm server caches (artwork derivatives) like a returning user.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 120000 });
  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  await browser.close();

  const { spawn } = await import("node:child_process");
  const chrome = spawn(CHROME, ["--headless=new", "--no-sandbox", "--remote-debugging-port=9333", "--user-data-dir=/tmp/lh-profile", "about:blank"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 3000));
  try {
  for (let r = 0; r < RUNS; r++) {
    const out = `/tmp/lh-home-${r}.json`;
    execFileSync("node", [LH, `${BASE}/`, "--only-categories=performance", "--output=json", `--output-path=${out}`, "--quiet", "--save-assets",
      "--port=9333", `--extra-headers=${JSON.stringify({ Cookie: cookie })}`], { stdio: "inherit" });
    const lhr = JSON.parse(readFileSync(out, "utf8"));
    const a = lhr.audits;
    console.log(`\n== run ${r + 1}: score ${Math.round(lhr.categories.performance.score * 100)} final=${lhr.finalDisplayedUrl}`);
    for (const k of ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "speed-index", "server-response-time", "total-byte-weight", "dom-size", "bootup-time", "mainthread-work-breakdown"]) console.log(k, a[k]?.displayValue);
    if (r === 0) {
      console.log("LCP element", JSON.stringify(a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet ?? a["largest-contentful-paint-element"]?.details?.items?.[0]));
      console.log("LCP phases", JSON.stringify(a["largest-contentful-paint-element"]?.details?.items?.[1]?.items));
      console.log("bootup", JSON.stringify(a["bootup-time"]?.details?.items?.slice(0, 8).map((i) => [i.url.slice(-60), Math.round(i.total), Math.round(i.scripting)])));
      console.log("mainthread", JSON.stringify(a["mainthread-work-breakdown"]?.details?.items?.map((i) => [i.group, Math.round(i.duration)])));
      console.log("long tasks", JSON.stringify(a["long-tasks"]?.details?.items?.slice(0, 10).map((i) => [i.url.slice(-50), Math.round(i.startTime), Math.round(i.duration)])));
      console.log("unused js", a["unused-javascript"]?.displayValue, JSON.stringify(a["unused-javascript"]?.details?.items?.slice(0, 5).map((i) => [i.url.slice(-50), Math.round(i.totalBytes / 1024), Math.round(i.wastedBytes / 1024)])));
      const reqs = a["network-requests"]?.details?.items ?? [];
      const byType = {};
      for (const q of reqs) byType[q.resourceType] = [(byType[q.resourceType]?.[0] ?? 0) + 1, (byType[q.resourceType]?.[1] ?? 0) + Math.round(q.transferSize / 1024)];
      console.log("requests", reqs.length, JSON.stringify(byType));
      console.log("document", JSON.stringify(reqs.filter((q) => q.resourceType === "Document").map((q) => [q.url, Math.round(q.transferSize / 1024), Math.round(q.networkEndTime - q.networkRequestTime)])));
    }
  }
  } finally { chrome.kill(); }
} finally {
  await admin.auth.admin.deleteUser(created.user.id);
  console.log("test account deleted");
}
