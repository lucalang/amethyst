import { createHmac, createPrivateKey, randomUUID, sign as cryptoSign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

type DemoGatewayConfig = {
  sha: string;
  shortSha: string;
  milestone: string;
  eraSummary: string;
  commitDate: string;
  releaseDate: string | null;
  port: number;
  nextPort: number;
  postgrestPort: number;
  dbName: string;
  retentionHours: number;
  defaultPath: string;
  mainAppOrigin: string;
  demoRoot: string;
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey & { kid: string; alg: string; use: string };
  cookieSecret: string;
  anonToken: string;
  serviceRoleToken: string;
};

type VisitorRecord = {
  visitorId: string;
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  lastActiveAt: number;
  signedOut?: boolean;
};

const MAX_UPLOAD_FILES_PER_VISITOR = 5;
const MAX_UPLOAD_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per file in demo
const MAX_UPLOAD_TOTAL_BYTES = 5 * 1024 * 1024; // 5 MB total per visitor workspace
const MAX_REST_BODY_BYTES = 256 * 1024; // 256 KB max JSON write payload
const MAX_ENTRIES_PER_VISITOR = 50;
const MAX_NODES_PER_VISITOR = 250;
const MAX_TASKS_PER_VISITOR = 500;
const MAX_ACTIVE_WORKSPACES_PER_COMMIT = 200;
const PROVISION_WINDOW_MS = 10 * 60 * 1000;
const MAX_PROVISIONS_PER_IP_WINDOW = 25;

const ALLOWED_IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
]);

const configPath = process.argv[2];
if (!configPath) {
  console.error("Usage: tsx scripts/version-demo-gateway.ts <config.json>");
  process.exit(1);
}

const config: DemoGatewayConfig = JSON.parse(readFileSync(configPath, "utf8"));
const privateKey = createPrivateKey({ key: config.privateJwk as never, format: "jwk" });

const VISITOR_COOKIE = `amethyst_demo_vid_${config.shortSha}`;
const AUTH_COOKIE = `sb-demo-${config.shortSha}-auth-token`;
const STARTUP_COOKIE = `archive-started-demo-${config.shortSha}`;

const stateDir = path.join(config.demoRoot, "state");
const storageRoot = path.join(config.demoRoot, "storage", config.shortSha);
mkdirSync(stateDir, { recursive: true });
mkdirSync(storageRoot, { recursive: true });

const visitorsFile = path.join(stateDir, `${config.shortSha}-visitors.json`);
const visitors = new Map<string, VisitorRecord>();
const provisionBuckets = new Map<string, { count: number; resetAt: number }>();

function loadVisitors() {
  if (!existsSync(visitorsFile)) return;
  try {
    const raw = JSON.parse(readFileSync(visitorsFile, "utf8")) as VisitorRecord[];
    for (const item of raw) {
      if (item && typeof item.visitorId === "string" && typeof item.userId === "string") {
        visitors.set(item.visitorId, item);
      }
    }
  } catch {
    // Ignore malformed state file
  }
}

function saveVisitors() {
  try {
    writeFileSync(visitorsFile, JSON.stringify([...visitors.values()], null, 2), "utf8");
  } catch {
    // Best-effort persistence
  }
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToString(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signEs256Jwt(payload: Record<string, unknown>): string {
  const header = { alg: "ES256", typ: "JWT", kid: config.publicJwk.kid };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = cryptoSign("SHA256", Buffer.from(signingInput, "utf8"), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function signVisitorCookieValue(visitorId: string): string {
  const mac = createHmac("sha256", config.cookieSecret).update(`${config.shortSha}:${visitorId}`).digest("hex").slice(0, 32);
  return `${visitorId}.${mac}`;
}

function verifyVisitorCookieValue(raw: string | undefined): string | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const visitorId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/.test(visitorId)) return null;
  const expected = createHmac("sha256", config.cookieSecret).update(`${config.shortSha}:${visitorId}`).digest("hex").slice(0, 32);
  return sig === expected ? visitorId : null;
}

function buildSupabaseUser(record: VisitorRecord) {
  const isoCreated = new Date(record.createdAt).toISOString();
  return {
    id: record.userId,
    aud: "authenticated",
    role: "authenticated",
    email: record.email,
    email_confirmed_at: isoCreated,
    phone: "",
    confirmed_at: isoCreated,
    last_sign_in_at: new Date(record.lastActiveAt).toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {
      demo: true,
      commit_sha: config.sha,
      short_sha: config.shortSha,
    },
    identities: [],
    created_at: isoCreated,
    updated_at: new Date(record.lastActiveAt).toISOString(),
    is_anonymous: false,
  };
}

function buildSupabaseSession(record: VisitorRecord) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = Math.min(nowSec + 3600 * 12, Math.floor(record.expiresAt / 1000));
  const accessToken = signEs256Jwt({
    aud: "authenticated",
    exp: expSec,
    iat: nowSec,
    iss: `http://localhost:${config.port}/__demo/supabase/auth/v1`,
    sub: record.userId,
    email: record.email,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { demo: true, short_sha: config.shortSha },
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "password", timestamp: nowSec }],
    session_id: record.visitorId,
    is_anonymous: false,
  });
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: Math.max(60, expSec - nowSec),
    expires_at: expSec,
    refresh_token: `demo-refresh-${record.visitorId}`,
    user: buildSupabaseUser(record),
  };
}

function encodeSsrSessionCookie(record: VisitorRecord): string {
  const session = buildSupabaseSession(record);
  return `base64-${base64UrlEncode(JSON.stringify(session))}`;
}

async function callDemoRpc<T = unknown>(fnName: string, args: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(args), "utf8");
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: config.postgrestPort,
        path: `/rpc/${fnName}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(body.length),
          Authorization: `Bearer ${config.serviceRoleToken}`,
          apikey: config.serviceRoleToken,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`PostgREST RPC ${fnName} failed (${res.statusCode}): ${text}`));
            return;
          }
          try {
            resolve((text ? JSON.parse(text) : null) as T);
          } catch {
            resolve(null as T);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function deleteVisitorWorkspace(record: VisitorRecord) {
  try {
    await callDemoRpc("_demo_delete_user", { p_user_id: record.userId });
  } catch {
    // Best-effort DB cleanup
  }
  try {
    const userStorageDir = path.join(storageRoot, record.userId);
    if (existsSync(userStorageDir)) {
      rmSync(userStorageDir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort storage cleanup
  }
}

async function pruneExpiredWorkspaces() {
  const now = Date.now();
  let changed = false;
  for (const [vid, record] of visitors.entries()) {
    if (record.expiresAt <= now) {
      visitors.delete(vid);
      changed = true;
      await deleteVisitorWorkspace(record);
    }
  }
  if (visitors.size > MAX_ACTIVE_WORKSPACES_PER_COMMIT) {
    const oldest = [...visitors.values()].sort((a, b) => a.lastActiveAt - b.lastActiveAt);
    while (visitors.size > MAX_ACTIVE_WORKSPACES_PER_COMMIT && oldest.length > 0) {
      const victim = oldest.shift()!;
      visitors.delete(victim.visitorId);
      changed = true;
      await deleteVisitorWorkspace(victim);
    }
  }
  if (changed) saveVisitors();
}

function checkProvisionRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = provisionBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    provisionBuckets.set(ip, { count: 1, resetAt: now + PROVISION_WINDOW_MS });
    return true;
  }
  if (bucket.count >= MAX_PROVISIONS_PER_IP_WINDOW) return false;
  bucket.count += 1;
  return true;
}

async function provisionFreshVisitor(existingVisitorId?: string): Promise<VisitorRecord> {
  await pruneExpiredWorkspaces();
  const visitorId = existingVisitorId ?? randomUUID();
  const userId = randomUUID();
  const email = `demo-${config.shortSha}-${userId.slice(0, 8)}@demo.amethyst.local`;
  const now = Date.now();
  const expiresAt = now + config.retentionHours * 3600 * 1000;

  await callDemoRpc("_demo_provision_user", {
    p_user_id: userId,
    p_email: email,
  });

  const record: VisitorRecord = {
    visitorId,
    userId,
    email,
    createdAt: now,
    expiresAt,
    lastActiveAt: now,
    signedOut: false,
  };
  visitors.set(visitorId, record);
  saveVisitors();
  return record;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

function serializeCookie(name: string, value: string, opts: { httpOnly?: boolean; maxAge?: number; path?: string } = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? "/"}`, "SameSite=Lax"];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (typeof opts.maxAge === "number") parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}

function decodeSubFromBearer(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(base64UrlDecodeToString(parts[1])) as { sub?: string; exp?: number };
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function generateSafeReplacementSvg(rawUrl: string): Buffer {
  let label = "Amethyst Demo Artwork";
  let sub = config.shortSha;
  try {
    const parsed = new URL(rawUrl);
    const seg = parsed.pathname.split("/").filter(Boolean).pop() ?? parsed.hostname;
    label = decodeURIComponent(seg).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").slice(0, 36) || parsed.hostname;
    sub = `${parsed.hostname} · Demo ${config.shortSha}`;
  } catch {
    // Use fallback label
  }
  const safeLabel = label.replace(/[<>&"']/g, "");
  const safeSub = sub.replace(/[<>&"']/g, "");
  let hash = 0;
  for (let i = 0; i < rawUrl.length; i++) hash = (hash * 31 + rawUrl.charCodeAt(i)) | 0;
  const hueA = Math.abs(hash) % 360;
  const hueB = (hueA + 48) % 360;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 840" width="600" height="840">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hueA}, 52%, 16%)" />
      <stop offset="55%" stop-color="hsl(${hueB}, 46%, 10%)" />
      <stop offset="100%" stop-color="#09070d" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="32%" r="48%">
      <stop offset="0%" stop-color="hsl(${hueA}, 80%, 64%)" stop-opacity="0.32" />
      <stop offset="100%" stop-color="hsl(${hueA}, 80%, 64%)" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="600" height="840" fill="url(#bg)" />
  <rect width="600" height="840" fill="url(#glow)" />
  <rect x="28" y="28" width="544" height="784" rx="22" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2" />
  <polygon points="300,190 368,265 340,365 260,365 232,265" fill="rgba(168,85,247,0.18)" stroke="rgba(192,132,252,0.55)" stroke-width="3" />
  <text x="300" y="480" text-anchor="middle" fill="#f5f3ff" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="700">${safeLabel}</text>
  <text x="300" y="522" text-anchor="middle" fill="rgba(226,232,240,0.68)" font-family="ui-monospace, monospace" font-size="16">${safeSub}</text>
  <text x="300" y="768" text-anchor="middle" fill="rgba(192,132,252,0.65)" font-family="system-ui, sans-serif" font-size="13" letter-spacing="2">ISOLATED DEMO ARTWORK</text>
</svg>`;
  return Buffer.from(svg, "utf8");
}

function isPrivateOrInvalidRemoteUrl(rawUrl: string): { ok: false; code: string; message: string } | { ok: true; url: URL } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, code: "invalid_url", message: "Enter a valid https:// image URL." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, code: "invalid_url", message: "Only http(s) image URLs are supported." };
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return { ok: false, code: "private_address", message: "Private or loopback addresses are not allowed." };
  }
  return { ok: true, url: parsed };
}

function isAllowedControlOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  const allowed = new Set([
    `http://localhost:${config.port}`,
    `http://127.0.0.1:${config.port}`,
    config.mainAppOrigin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3100",
    "http://127.0.0.1:3100",
  ]);
  return allowed.has(origin) ? origin : null;
}

function readRequestBody(req: http.IncomingMessage, maxBytes = MAX_REST_BODY_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown, extraHeaders: Record<string, string | string[]> = {}) {
  const body = Buffer.from(JSON.stringify(data), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
    "Cache-Control": "private, no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function buildDemoClientScript(userId: string | null): string {
  const meta = {
    sha: config.sha,
    shortSha: config.shortSha,
    milestone: config.milestone,
    commitDate: config.commitDate,
    releaseDate: config.releaseDate,
    retentionHours: config.retentionHours,
    defaultPath: config.defaultPath,
    mainAppUrl: `${config.mainAppOrigin}/version-history`,
    userId,
  };
  return `(function(){
  if (typeof window === "undefined" || document.getElementById("amethyst-demo-bar-host")) return;
  const META = ${JSON.stringify(meta)};
  try {
    if (META.userId) {
      const prev = window.localStorage.getItem("__amethyst_demo_uid");
      if (prev && prev !== META.userId) {
        window.localStorage.clear();
        window.sessionStorage.clear();
      }
      window.localStorage.setItem("__amethyst_demo_uid", META.userId);
    }
  } catch {}
  function mount() {
    if (document.getElementById("amethyst-demo-bar-host")) return;
    const host = document.createElement("div");
    host.id = "amethyst-demo-bar-host";
    const shadow = host.attachShadow({ mode: "open" });
    const onAuthPage = /^\\/(login|register|forgot-password)(\\/|$)/.test(window.location.pathname);
    shadow.innerHTML = \`
      <style>
        :host { all: initial; }
        .bar {
          position: fixed;
          right: 14px;
          bottom: 14px;
          z-index: 2147483000;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 12px;
          line-height: 1.35;
          color: #f5f3ff;
          background: rgba(12, 10, 18, 0.92);
          border: 1px solid rgba(168, 85, 247, 0.38);
          border-radius: 10px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255,255,255,0.04) inset;
          backdrop-filter: blur(10px);
          padding: 8px 11px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          max-width: calc(100vw - 28px);
        }
        @media (max-width: 767px) {
          .bar { bottom: 74px; right: 10px; left: 10px; justify-content: space-between; }
        }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
          color: #e9d5ff;
        }
        .dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #a855f7;
          box-shadow: 0 0 8px #a855f7;
        }
        .sha {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          padding: 1px 5px;
          border-radius: 4px;
          background: rgba(168, 85, 247, 0.18);
          color: #d8b4fe;
        }
        .meta {
          color: rgba(226, 232, 240, 0.72);
          font-size: 11px;
        }
        .actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        button, a.btn {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          color: #f8fafc;
          font: inherit;
          font-size: 11px;
          font-weight: 500;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
          text-decoration: none;
          transition: background 0.15s, border-color 0.15s;
        }
        button:hover, a.btn:hover {
          background: rgba(168, 85, 247, 0.22);
          border-color: rgba(168, 85, 247, 0.5);
        }
        button.danger {
          border-color: rgba(244, 63, 94, 0.4);
          color: #fda4af;
        }
        button.danger:hover {
          background: rgba(244, 63, 94, 0.22);
          border-color: rgba(244, 63, 94, 0.65);
        }
        button.primary, a.btn.primary {
          background: rgba(168, 85, 247, 0.25);
          border-color: rgba(168, 85, 247, 0.55);
          color: #f3e8ff;
        }
        .confirm-panel {
          display: none;
          width: 100%;
          padding-top: 7px;
          margin-top: 4px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }
        .confirm-panel.open {
          display: flex;
        }
        .confirm-text {
          font-size: 11px;
          color: #fecdd3;
        }
      </style>
      <div class="bar" role="region" aria-label="Historical version demo controls">
        <span class="badge">
          <span class="dot" aria-hidden="true"></span>
          <span>Demo</span>
          <span class="sha">\${META.shortSha}</span>
        </span>
        <span class="meta">\${META.milestone} · Fresh account (\${META.retentionHours}h retention)</span>
        <div class="actions">
          \${onAuthPage ? '<button type="button" class="primary" id="demo-resume-btn">Resume Demo Workspace</button>' : ''}
          <button type="button" id="demo-reset-trigger" class="danger">Reset Demo</button>
          <a class="btn primary" href="\${META.mainAppUrl}">← Current Amethyst</a>
        </div>
        <div class="confirm-panel" id="demo-confirm-panel">
          <span class="confirm-text">Reset only your workspace for \${META.shortSha} back to fresh-account defaults?</span>
          <div class="actions">
            <button type="button" id="demo-reset-cancel">Cancel</button>
            <button type="button" id="demo-reset-confirm" class="danger">Confirm Reset</button>
          </div>
        </div>
      </div>
    \`;
    document.documentElement.appendChild(host);

    const trigger = shadow.getElementById("demo-reset-trigger");
    const panel = shadow.getElementById("demo-confirm-panel");
    const cancel = shadow.getElementById("demo-reset-cancel");
    const confirmBtn = shadow.getElementById("demo-reset-confirm");
    const resumeBtn = shadow.getElementById("demo-resume-btn");

    if (trigger && panel) {
      trigger.addEventListener("click", () => panel.classList.toggle("open"));
    }
    if (cancel && panel) {
      cancel.addEventListener("click", () => panel.classList.remove("open"));
    }
    if (confirmBtn) {
      confirmBtn.addEventListener("click", async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Resetting…";
        try {
          const res = await fetch("/__demo/reset", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" }
          });
          const data = await res.json().catch(() => ({}));
          try { window.localStorage.clear(); } catch {}
          try { window.sessionStorage.clear(); } catch {}
          window.location.href = data.redirectTo || META.defaultPath || "/";
        } catch {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Confirm Reset";
        }
      });
    }
    if (resumeBtn) {
      resumeBtn.addEventListener("click", async () => {
        resumeBtn.disabled = true;
        await fetch("/__demo/resume", { method: "POST", credentials: "same-origin" }).catch(() => {});
        window.location.href = META.defaultPath || "/";
      });
    }
  }
  if (document.readyState === "complete") {
    setTimeout(mount, 40);
  } else {
    window.addEventListener("load", () => setTimeout(mount, 40), { once: true });
  }
})();`;
}

async function handleSupabaseAuth(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, cookies: Record<string, string>) {
  const subPath = pathname.slice("/__demo/supabase/auth/v1".length) || "/";
  if (req.method === "GET" && subPath === "/.well-known/jwks.json") {
    return sendJson(res, 200, { keys: [config.publicJwk] });
  }

  const vid = verifyVisitorCookieValue(cookies[VISITOR_COOKIE]);
  let record = vid ? (visitors.get(vid) ?? null) : null;

  if (!record) {
    const sub = decodeSubFromBearer(req.headers.authorization);
    if (sub) {
      record = [...visitors.values()].find((v) => v.userId === sub) ?? null;
    }
  }

  if (subPath === "/user" && req.method === "GET") {
    if (!record) return sendJson(res, 401, { message: "Invalid JWT" });
    return sendJson(res, 200, buildSupabaseUser(record));
  }

  if (subPath === "/user" && (req.method === "PUT" || req.method === "PATCH")) {
    if (!record) return sendJson(res, 401, { message: "Invalid JWT" });
    record.lastActiveAt = Date.now();
    saveVisitors();
    return sendJson(res, 200, { user: buildSupabaseUser(record), ...buildSupabaseUser(record) });
  }

  if (subPath === "/token" && req.method === "POST") {
    await readRequestBody(req).catch(() => Buffer.alloc(0));
    if (!record) {
      const ip = req.socket.remoteAddress ?? "127.0.0.1";
      if (!checkProvisionRateLimit(ip)) {
        return sendJson(res, 429, { error: "rate_limit", error_description: "Too many demo sessions created recently." });
      }
      record = await provisionFreshVisitor();
    }
    record.signedOut = false;
    record.lastActiveAt = Date.now();
    saveVisitors();
    return sendJson(res, 200, buildSupabaseSession(record));
  }

  if (subPath === "/signup" && req.method === "POST") {
    await readRequestBody(req).catch(() => Buffer.alloc(0));
    if (!record) {
      const ip = req.socket.remoteAddress ?? "127.0.0.1";
      if (!checkProvisionRateLimit(ip)) {
        return sendJson(res, 429, { error: "rate_limit", error_description: "Too many demo sessions created recently." });
      }
      record = await provisionFreshVisitor();
    }
    record.signedOut = false;
    record.lastActiveAt = Date.now();
    saveVisitors();
    return sendJson(res, 200, buildSupabaseSession(record));
  }

  if (subPath === "/logout" && req.method === "POST") {
    if (record) {
      record.signedOut = true;
      saveVisitors();
    }
    res.writeHead(204);
    res.end();
    return;
  }

  if (
    subPath === "/recover" ||
    subPath === "/otp" ||
    subPath === "/resend" ||
    subPath === "/verify"
  ) {
    // Real emails are strictly disabled in historical demos
    await readRequestBody(req).catch(() => Buffer.alloc(0));
    return sendJson(res, 200, {});
  }

  return sendJson(res, 404, { message: "Auth endpoint not found in demo gateway" });
}

function getVisitorStorageUsage(userId: string): { files: number; bytes: number } {
  const dir = path.join(storageRoot, userId);
  if (!existsSync(dir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir)) {
    try {
      const st = statSync(path.join(dir, entry));
      if (st.isFile()) {
        files++;
        bytes += st.size;
      }
    } catch {
      // Ignore
    }
  }
  return { files, bytes };
}

function signStorageUrlToken(userId: string, name: string, expSec: number): string {
  const payload = `${config.shortSha}:${userId}:${name}:${expSec}`;
  const sig = createHmac("sha256", config.cookieSecret).update(payload).digest("hex").slice(0, 32);
  return `${expSec}.${sig}`;
}

function verifyStorageUrlToken(userId: string, name: string, token: string | null): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expSec = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(expSec) || expSec * 1000 < Date.now()) return false;
  const expected = createHmac("sha256", config.cookieSecret)
    .update(`${config.shortSha}:${userId}:${name}:${expSec}`)
    .digest("hex")
    .slice(0, 32);
  return sig === expected;
}

async function handleSupabaseStorage(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const subPath = url.pathname.slice("/__demo/supabase/storage/v1".length) || "/";

  // POST /object/sign/note-attachments/<userId>/<name>
  const signMatch = subPath.match(/^\/object\/sign\/([^/]+)\/([^/]+)\/(.+)$/);
  if (signMatch && req.method === "POST") {
    const [, bucket, userId, rawName] = signMatch;
    const callerSub = decodeSubFromBearer(req.headers.authorization);
    if (!callerSub || callerSub !== userId) {
      return sendJson(res, 403, { statusCode: "403", error: "Unauthorized", message: "Access denied" });
    }
    await readRequestBody(req).catch(() => Buffer.alloc(0));
    const name = decodeURIComponent(rawName);
    const expSec = Math.floor(Date.now() / 1000) + 3600;
    const token = signStorageUrlToken(userId, name, expSec);
    return sendJson(res, 200, {
      signedURL: `/object/sign/${bucket}/${userId}/${encodeURIComponent(name)}?token=${token}`,
    });
  }

  // GET /object/sign/note-attachments/<userId>/<name>?token=...
  if (signMatch && req.method === "GET") {
    const [, , userId, rawName] = signMatch;
    const name = path.basename(decodeURIComponent(rawName));
    const token = url.searchParams.get("token");
    if (!verifyStorageUrlToken(userId, name, token)) {
      return sendJson(res, 403, { statusCode: "403", error: "Invalid token", message: "Signed URL expired or invalid." });
    }
    const filePath = path.join(storageRoot, userId, name);
    const metaPath = `${filePath}.meta.json`;
    if (existsSync(filePath)) {
      const bytes = readFileSync(filePath);
      let contentType = "image/png";
      if (existsSync(metaPath)) {
        try {
          contentType = JSON.parse(readFileSync(metaPath, "utf8")).contentType || contentType;
        } catch {}
      }
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=1800",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(bytes);
      return;
    }
    // Safe replacement artwork when original upload is not present
    const svg = generateSafeReplacementSvg(`https://demo.amethyst.local/${name}`);
    res.writeHead(200, {
      "Content-Type": "image/svg+xml",
      "Content-Length": String(svg.length),
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(svg);
    return;
  }

  // POST or PUT /object/note-attachments/<userId>/<name>
  const objMatch = subPath.match(/^\/object\/([^/]+)\/([^/]+)\/(.+)$/);
  if (objMatch && (req.method === "POST" || req.method === "PUT")) {
    const [, bucket, userId, rawName] = objMatch;
    const callerSub = decodeSubFromBearer(req.headers.authorization);
    if (!callerSub || callerSub !== userId) {
      return sendJson(res, 403, { statusCode: "403", error: "Unauthorized", message: "Owner mismatch" });
    }
    const contentType = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIMES.has(contentType)) {
      return sendJson(res, 415, { statusCode: "415", error: "InvalidMimeType", message: "Only raster images are allowed in demos." });
    }
    let body: Buffer;
    try {
      body = await readRequestBody(req, MAX_UPLOAD_FILE_BYTES);
    } catch {
      return sendJson(res, 413, { statusCode: "413", error: "PayloadTooLarge", message: "Demo uploads are limited to 2 MB per image." });
    }
    const usage = getVisitorStorageUsage(userId);
    if (usage.files >= MAX_UPLOAD_FILES_PER_VISITOR || usage.bytes + body.length > MAX_UPLOAD_TOTAL_BYTES) {
      return sendJson(res, 413, {
        statusCode: "413",
        error: "QuotaExceeded",
        message: "Demo upload quota reached (max 5 images / 5 MB per workspace). Reset Demo to clear space.",
      });
    }
    const safeName = path.basename(decodeURIComponent(rawName));
    const userDir = path.join(storageRoot, userId);
    mkdirSync(userDir, { recursive: true });
    writeFileSync(path.join(userDir, safeName), body);
    writeFileSync(path.join(userDir, `${safeName}.meta.json`), JSON.stringify({ contentType, size: body.length }), "utf8");

    await callDemoRpc("_demo_record_storage_object", {
      p_user_id: userId,
      p_bucket: bucket,
      p_name: `${userId}/${safeName}`,
      p_mime: contentType,
      p_size: body.length,
    }).catch(() => {});

    return sendJson(res, 200, { Id: randomUUID(), Key: `${bucket}/${userId}/${safeName}` });
  }

  return sendJson(res, 404, { statusCode: "404", error: "NotFound", message: "Storage route not found" });
}

async function handleSupabaseRest(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const subPath = url.pathname.slice("/__demo/supabase/rest/v1".length) || "/";
  // Block external access to internal _demo_* management RPCs
  if (subPath.startsWith("/rpc/_demo_")) {
    return sendJson(res, 403, { code: "42501", message: "Internal demo RPC is not accessible." });
  }

  let bodyBuf: Buffer = Buffer.alloc(0);
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      bodyBuf = await readRequestBody(req, MAX_REST_BODY_BYTES);
    } catch {
      return sendJson(res, 413, { code: "22023", message: "Demo write payload exceeds the 256 KB limit." });
    }

    // Enforce per-visitor row quotas on creation calls
    if (req.method === "POST") {
      const sub = decodeSubFromBearer(req.headers.authorization);
      if (sub) {
        try {
          const counts = await callDemoRpc<{ entries: number; nodes: number; tasks: number }>("_demo_user_counts", {
            p_user_id: sub,
          });
          if (counts) {
            if ((subPath === "/entries" || subPath === "/rpc/create_entry") && counts.entries >= MAX_ENTRIES_PER_VISITOR) {
              return sendJson(res, 422, {
                code: "22023",
                message: `Demo workspace limit reached (${MAX_ENTRIES_PER_VISITOR} entries). Use Reset Demo to start fresh.`,
              });
            }
            if (subPath === "/workspace_nodes" && counts.nodes >= MAX_NODES_PER_VISITOR) {
              return sendJson(res, 422, {
                code: "22023",
                message: `Demo workspace limit reached (${MAX_NODES_PER_VISITOR} files/folders). Use Reset Demo to start fresh.`,
              });
            }
            if ((subPath === "/tasks" || subPath.startsWith("/rpc/add_")) && counts.tasks >= MAX_TASKS_PER_VISITOR) {
              return sendJson(res, 422, {
                code: "22023",
                message: `Demo workspace limit reached (${MAX_TASKS_PER_VISITOR} tasks). Use Reset Demo to start fresh.`,
              });
            }
          }
        } catch {
          // Proceed if quota check fails
        }
      }
    }
  }

  const forwardHeaders: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (k === "host" || k === "connection" || k === "content-length") continue;
    forwardHeaders[k] = v;
  }
  if (bodyBuf.length > 0) {
    forwardHeaders["content-length"] = String(bodyBuf.length);
  }

  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: config.postgrestPort,
      path: `${subPath}${url.search}`,
      method: req.method,
      headers: forwardHeaders,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", () => {
    if (!res.headersSent) sendJson(res, 502, { code: "502", message: "Demo database service unavailable." });
  });
  if (bodyBuf.length > 0) proxyReq.write(bodyBuf);
  proxyReq.end();
}

const server = http.createServer(async (req, res) => {
  try {
    const hostHeader = req.headers.host ?? `localhost:${config.port}`;
    const url = new URL(req.url ?? "/", `http://${hostHeader}`);
    const pathname = url.pathname;

    // Canonicalize 127.0.0.1 -> localhost on document navigations so origin & cookies stay consistent
    if (
      hostHeader.startsWith("127.0.0.1:") &&
      (req.method === "GET" || req.method === "HEAD") &&
      !pathname.startsWith("/__demo/")
    ) {
      res.writeHead(307, { Location: `http://localhost:${config.port}${url.pathname}${url.search}` });
      res.end();
      return;
    }

    const cookies = parseCookies(req.headers.cookie);

    // CORS preflight for /__demo/status and /__demo/reset from main app
    if (req.method === "OPTIONS" && (pathname === "/__demo/status" || pathname === "/__demo/reset")) {
      const allowedOrigin = isAllowedControlOrigin(req.headers.origin);
      res.writeHead(204, {
        ...(allowedOrigin
          ? {
              "Access-Control-Allow-Origin": allowedOrigin,
              "Access-Control-Allow-Credentials": "true",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            }
          : {}),
      });
      res.end();
      return;
    }

    if (pathname === "/__demo/status" && req.method === "GET") {
      const allowedOrigin = isAllowedControlOrigin(req.headers.origin);
      const vid = verifyVisitorCookieValue(cookies[VISITOR_COOKIE]);
      const record = vid ? (visitors.get(vid) ?? null) : null;
      return sendJson(
        res,
        200,
        {
          ok: true,
          sha: config.sha,
          shortSha: config.shortSha,
          milestone: config.milestone,
          commitDate: config.commitDate,
          releaseDate: config.releaseDate,
          port: config.port,
          retentionHours: config.retentionHours,
          defaultPath: config.defaultPath,
          hasWorkspace: Boolean(record && record.expiresAt > Date.now()),
          expiresAt: record ? new Date(record.expiresAt).toISOString() : null,
        },
        allowedOrigin
          ? {
              "Access-Control-Allow-Origin": allowedOrigin,
              "Access-Control-Allow-Credentials": "true",
            }
          : {},
      );
    }

    if (pathname === "/__demo/reset" && req.method === "POST") {
      const allowedOrigin = isAllowedControlOrigin(req.headers.origin);
      if (!allowedOrigin) {
        return sendJson(res, 403, { error: "Forbidden origin" });
      }
      await readRequestBody(req).catch(() => Buffer.alloc(0));
      const vid = verifyVisitorCookieValue(cookies[VISITOR_COOKIE]);
      const existing = vid ? (visitors.get(vid) ?? null) : null;
      if (existing) {
        visitors.delete(existing.visitorId);
        await deleteVisitorWorkspace(existing);
      }
      const fresh = await provisionFreshVisitor();
      const maxAge = config.retentionHours * 3600;
      const setCookies = [
        serializeCookie(VISITOR_COOKIE, signVisitorCookieValue(fresh.visitorId), { httpOnly: true, maxAge }),
        serializeCookie(AUTH_COOKIE, encodeSsrSessionCookie(fresh), { httpOnly: false, maxAge }),
        serializeCookie(STARTUP_COOKIE, "", { httpOnly: true, maxAge: 0 }),
      ];
      return sendJson(
        res,
        200,
        {
          ok: true,
          reset: true,
          shortSha: config.shortSha,
          redirectTo: config.defaultPath,
          expiresAt: new Date(fresh.expiresAt).toISOString(),
        },
        {
          "Set-Cookie": setCookies,
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Credentials": "true",
        },
      );
    }

    if (pathname === "/__demo/resume" && req.method === "POST") {
      const vid = verifyVisitorCookieValue(cookies[VISITOR_COOKIE]);
      let record = vid ? (visitors.get(vid) ?? null) : null;
      if (!record || record.expiresAt <= Date.now()) {
        record = await provisionFreshVisitor();
      } else {
        record.signedOut = false;
        record.lastActiveAt = Date.now();
        saveVisitors();
      }
      const maxAge = config.retentionHours * 3600;
      return sendJson(
        res,
        200,
        { ok: true, redirectTo: config.defaultPath },
        {
          "Set-Cookie": [
            serializeCookie(VISITOR_COOKIE, signVisitorCookieValue(record.visitorId), { httpOnly: true, maxAge }),
            serializeCookie(AUTH_COOKIE, encodeSsrSessionCookie(record), { httpOnly: false, maxAge }),
          ],
        },
      );
    }

    if (pathname === "/__demo/client.js" && req.method === "GET") {
      const vid = verifyVisitorCookieValue(cookies[VISITOR_COOKIE]);
      const record = vid ? (visitors.get(vid) ?? null) : null;
      const body = Buffer.from(buildDemoClientScript(record?.userId ?? null), "utf8");
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
      });
      res.end(body);
      return;
    }

    if (pathname.startsWith("/__demo/supabase/auth/v1")) {
      return await handleSupabaseAuth(req, res, pathname, cookies);
    }
    if (pathname.startsWith("/__demo/supabase/storage/v1")) {
      return await handleSupabaseStorage(req, res, url);
    }
    if (pathname.startsWith("/__demo/supabase/rest/v1")) {
      return await handleSupabaseRest(req, res, url);
    }

    // Ensure visitor has a provisioned demo account before forwarding to Next.js
    const vid = verifyVisitorCookieValue(cookies[VISITOR_COOKIE]);
    let record = vid ? (visitors.get(vid) ?? null) : null;
    let newlyProvisioned = false;

    if (!record || record.expiresAt <= Date.now()) {
      if (record) {
        visitors.delete(record.visitorId);
        await deleteVisitorWorkspace(record);
      }
      const ip = req.socket.remoteAddress ?? "127.0.0.1";
      if (!checkProvisionRateLimit(ip)) {
        res.writeHead(429, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Too many demo workspaces provisioned from this address. Please wait a few minutes.");
        return;
      }
      record = await provisionFreshVisitor();
      newlyProvisioned = true;
    } else {
      record.lastActiveAt = Date.now();
    }

    // Intercept /api/image so demos never make outbound network calls
    if (pathname === "/api/image" && req.method === "GET") {
      const target = url.searchParams.get("url");
      const check = url.searchParams.get("mode") === "check";
      if (!target) {
        return sendJson(res, 400, { error: { code: "invalid_input", message: "Missing url parameter." } });
      }
      const validated = isPrivateOrInvalidRemoteUrl(target);
      if (!validated.ok) {
        if (check) {
          return sendJson(res, 200, { ok: false, code: validated.code, message: validated.message, upstreamStatus: null });
        }
        return sendJson(res, 400, { error: { code: validated.code, message: validated.message } });
      }
      const svg = generateSafeReplacementSvg(target);
      if (check) {
        return sendJson(res, 200, { ok: true, contentType: "image/svg+xml", bytes: svg.length });
      }
      res.writeHead(200, {
        "Content-Type": "image/svg+xml",
        "Content-Length": String(svg.length),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
      });
      res.end(svg);
      return;
    }

    // If visitor signs out via /auth/signout, mark signedOut so they can see /login if they wish
    if (pathname === "/auth/signout" && req.method === "POST") {
      record.signedOut = true;
      saveVisitors();
    }

    // Build scoped Cookie header for the historical Next.js server (strip all unrelated cookies!)
    const scopedCookies: string[] = [];
    const ssrSessionEncoded = encodeSsrSessionCookie(record);
    if (!record.signedOut) {
      scopedCookies.push(`${AUTH_COOKIE}=${encodeURIComponent(ssrSessionEncoded)}`);
    }
    if (cookies[STARTUP_COOKIE]) {
      scopedCookies.push(`${STARTUP_COOKIE}=${encodeURIComponent(cookies[STARTUP_COOKIE])}`);
    }

    const forwardHeaders: http.OutgoingHttpHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === "cookie" || k === "accept-encoding" || k === "host") continue;
      forwardHeaders[k] = v;
    }
    forwardHeaders.host = `localhost:${config.port}`;
    if (req.headers.origin) {
      forwardHeaders.origin = `http://localhost:${config.port}`;
    }
    forwardHeaders["accept-encoding"] = "identity";
    if (scopedCookies.length > 0) {
      forwardHeaders.cookie = scopedCookies.join("; ");
    }

    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: config.nextPort,
        path: `${url.pathname}${url.search}`,
        method: req.method,
        headers: forwardHeaders,
      },
      (proxyRes) => {
        const resHeaders: http.OutgoingHttpHeaders = { ...proxyRes.headers };
        const maxAge = config.retentionHours * 3600;
        const outgoingCookies: string[] = [];

        if (Array.isArray(resHeaders["set-cookie"])) {
          outgoingCookies.push(...resHeaders["set-cookie"]);
        } else if (typeof resHeaders["set-cookie"] === "string") {
          outgoingCookies.push(resHeaders["set-cookie"]);
        }

        if (newlyProvisioned || !cookies[VISITOR_COOKIE]) {
          outgoingCookies.push(serializeCookie(VISITOR_COOKIE, signVisitorCookieValue(record.visitorId), { httpOnly: true, maxAge }));
        }
        if (!record.signedOut && (newlyProvisioned || !cookies[AUTH_COOKIE])) {
          outgoingCookies.push(serializeCookie(AUTH_COOKIE, ssrSessionEncoded, { httpOnly: false, maxAge }));
        }
        if (outgoingCookies.length > 0) {
          resHeaders["set-cookie"] = outgoingCookies;
        }

        const contentType = String(resHeaders["content-type"] ?? "");
        if (contentType.includes("text/html") && req.method === "GET") {
          const chunks: Buffer[] = [];
          proxyRes.on("data", (c) => chunks.push(c));
          proxyRes.on("end", () => {
            let html = Buffer.concat(chunks).toString("utf8");
            const scriptTag = `<script src="/__demo/client.js" defer></script>`;
            if (html.includes("</head>")) {
              html = html.replace("</head>", `${scriptTag}</head>`);
            } else {
              html = `${html}${scriptTag}`;
            }
            const outBuf = Buffer.from(html, "utf8");
            resHeaders["content-length"] = String(outBuf.length);
            delete resHeaders["transfer-encoding"];
            res.writeHead(proxyRes.statusCode ?? 200, resHeaders);
            res.end(outBuf);
          });
          return;
        }

        res.writeHead(proxyRes.statusCode ?? 200, resHeaders);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Historical demo server is starting or unavailable.");
      }
    });

    req.pipe(proxyReq);
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal demo gateway error", detail: err instanceof Error ? err.message : String(err) });
    }
  }
});

loadVisitors();
void pruneExpiredWorkspaces();
setInterval(() => {
  void pruneExpiredWorkspaces();
}, 10 * 60 * 1000).unref();

server.listen(config.port, "0.0.0.0", () => {
  console.log(
    `[demo-gateway] ${config.shortSha} (${config.milestone}) listening on http://localhost:${config.port} -> next:${config.nextPort}, postgrest:${config.postgrestPort} (${config.dbName})`,
  );
});
