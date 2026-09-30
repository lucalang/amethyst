import { describe, expect, it, vi } from "vitest";
import { ProviderError, parseRetryAfter } from "@/lib/providers/http";
import { categorizeType, isFollowRelation, needsEpisodeList, sectionFor } from "@/lib/imports/categorize";
import { parseImportInput } from "@/lib/imports/input";
import { decryptSecret, encryptSecret, importEncryptionKey, sha256Hex, timingSafeEqualString } from "@/lib/sync/crypto";
import {
  OAuthGrantError,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  generateCodeVerifier,
  generateState,
  isWellFormedState,
} from "@/lib/sync/mal-oauth";
import { buildSyncPreview, decidePull, decidePush, normalizeState } from "@/lib/sync/reconcile";

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, index) => index)));

describe("import input", () => {
  it.each([
    ["21", { type: "id", malId: 21 }],
    ["https://myanimelist.net/anime/21/One_Piece", { type: "id", malId: 21 }],
    ["myanimelist.net/anime/5114", { type: "id", malId: 5114 }],
    ["Fullmetal Alchemist", { type: "title", query: "Fullmetal Alchemist" }],
  ])("parses %s", (raw, expected) => {
    expect(parseImportInput(raw)).toEqual(expected);
  });

  it.each(["", "https://myanimelist.net/manga/2", "https://myanimelist.net.evil.test/anime/1", "0"])("rejects %s", (raw) => {
    const parsed = parseImportInput(raw);
    expect(parsed.type === "invalid" || (parsed.type === "title" && raw.includes("evil"))).toBe(true);
  });
});

describe("categorization uses provider metadata", () => {
  it("maps provider types to kinds", () => {
    expect(categorizeType("TV")).toEqual({ trackable: true, kind: "series", typeKnown: true });
    expect(categorizeType("TV Special")).toEqual({ trackable: true, kind: "special", typeKnown: true });
    expect(categorizeType("Music")).toEqual({ trackable: false, reason: "non_work_type" });
    expect(categorizeType(null)).toEqual({ trackable: true, kind: "special", typeKnown: false });
  });

  it("places works in sections", () => {
    expect(sectionFor("ona", null)).toBe("main");
    expect(sectionFor("ona", "Side Story")).toBe("ova_special");
    expect(sectionFor("ona", "Sequel")).toBe("main");
    expect(isFollowRelation("Side Story")).toBe(true);
    expect(isFollowRelation("side story")).toBe(true);
    expect(isFollowRelation("Alternative Setting")).toBe(false);
    expect(sectionFor("movie", "Sequel")).toBe("movie");
    expect(needsEpisodeList("movie", 3)).toBe(false);
    expect(needsEpisodeList("series", null)).toBe(true);
    expect(needsEpisodeList("special", 1)).toBe(false);
  });
});

describe("Retry-After parsing", () => {
  it("handles seconds and HTTP dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:10 GMT", now)).toBe(10_000);
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("token encryption", () => {
  it("round-trips and binds ciphertext to its purpose", async () => {
    const key = await importEncryptionKey(KEY);
    const sealed = await encryptSecret(key, "access-token", "mal_access:user-a");
    expect(sealed).not.toContain("access-token");
    await expect(decryptSecret(key, sealed, "mal_access:user-a")).resolves.toBe("access-token");
    await expect(decryptSecret(key, sealed, "mal_access:user-b")).rejects.toThrow();
  });

  it("detects tampering", async () => {
    const key = await importEncryptionKey(KEY);
    const sealed = await encryptSecret(key, "secret", "aad");
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    await expect(decryptSecret(key, tampered, "aad")).rejects.toThrow();
  });

  it("rejects keys of the wrong size", async () => {
    await expect(importEncryptionKey(btoa("short"))).rejects.toThrow();
  });

  it("hashes and compares in constant time", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(timingSafeEqualString("Bearer x", "Bearer x")).toBe(true);
    expect(timingSafeEqualString("Bearer x", "Bearer y")).toBe(false);
    expect(timingSafeEqualString("a", "ab")).toBe(false);
  });
});

describe("MAL OAuth (PKCE plain)", () => {
  it("builds the documented authorize URL", () => {
    const verifier = generateCodeVerifier();
    const state = generateState();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(isWellFormedState(state)).toBe(true);
    const url = new URL(
      buildAuthorizeUrl({ authorizeUrl: "https://myanimelist.net/v1/oauth2/authorize", clientId: "cid", redirectUri: "http://localhost:3000/api/mal/callback", state, codeVerifier: verifier }),
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("plain");
    expect(url.searchParams.get("code_challenge")).toBe(verifier);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe(state);
  });

  it("exchanges the code server-side with the verifier", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code_verifier")).toBe("v".repeat(64));
      expect(body.get("client_secret")).toBe("shh");
      return Response.json({ token_type: "Bearer", expires_in: 3600, access_token: "at", refresh_token: "rt" });
    });
    const tokens = await exchangeAuthorizationCode(
      { clientId: "cid", clientSecret: "shh", tokenUrl: "https://mal.test/token" },
      { code: "c", redirectUri: "http://localhost/cb", codeVerifier: "v".repeat(64) },
      fetchMock as unknown as typeof fetch,
    );
    expect(tokens).toMatchObject({ accessToken: "at", refreshToken: "rt" });
  });

  it("distinguishes rejected grants from outages", async () => {
    const client = { clientId: "cid", tokenUrl: "https://mal.test/token" };
    const rejected = vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })) as unknown as typeof fetch;
    const outage = vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    await expect(exchangeAuthorizationCode(client, { code: "c", redirectUri: "r", codeVerifier: "v" }, rejected)).rejects.toBeInstanceOf(OAuthGrantError);
    await expect(exchangeAuthorizationCode(client, { code: "c", redirectUri: "r", codeVerifier: "v" }, outage)).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("reconciliation", () => {
  const s = (status: string, score: number, watched: number) => normalizeState({ status, score, watched });

  it("applies remote changes when only MAL changed", () => {
    expect(decidePull({ local: s("watching", 0, 3), remote: s("watching", 0, 5), baseline: s("watching", 0, 3), pendingPush: false })).toBe("apply_remote");
  });

  it("does nothing when MAL did not change", () => {
    expect(decidePull({ local: s("watching", 0, 9), remote: s("watching", 0, 3), baseline: s("watching", 0, 3), pendingPush: true })).toBe("none");
  });

  it("flags simultaneous edits as conflicts", () => {
    expect(decidePull({ local: s("watching", 0, 4), remote: s("watching", 0, 6), baseline: s("watching", 0, 3), pendingPush: false })).toBe("conflict");
    expect(decidePull({ local: s("watching", 0, 3), remote: s("watching", 0, 6), baseline: s("watching", 0, 3), pendingPush: true })).toBe("conflict");
  });

  it("adopts agreement without writes", () => {
    expect(decidePull({ local: s("completed", 8, 12), remote: s("completed", 8, 12), baseline: s("watching", 0, 3), pendingPush: false })).toBe("adopt_baseline");
  });

  it("applies MAL for untouched local items without a baseline", () => {
    expect(decidePull({ local: null, remote: s("completed", 9, 24), baseline: null, pendingPush: false })).toBe("apply_remote");
    expect(decidePull({ local: s("dropped", 0, 2), remote: s("completed", 9, 24), baseline: null, pendingPush: false })).toBe("conflict");
  });

  it("only pushes when MAL still matches the baseline", () => {
    expect(decidePush({ desired: s("watching", 0, 5), remote: s("watching", 0, 4), baseline: s("watching", 0, 4) })).toBe("push");
    expect(decidePush({ desired: s("watching", 0, 5), remote: s("watching", 0, 7), baseline: s("watching", 0, 4) })).toBe("conflict");
    expect(decidePush({ desired: s("watching", 0, 5), remote: null, baseline: null })).toBe("push");
    expect(decidePush({ desired: s("watching", 0, 5), remote: null, baseline: s("watching", 0, 4) })).toBe("conflict");
    expect(decidePush({ desired: s("watching", 0, 5), remote: s("watching", 0, 5), baseline: null })).toBe("noop");
    expect(decidePush({ desired: s("watching", 0, 5), remote: s("completed", 0, 12), baseline: null })).toBe("conflict");
  });

  it("classifies the initial preview", () => {
    const rows = buildSyncPreview(
      [
        { malId: 1, title: "A", imageUrl: null, state: s("completed", 8, 12) },
        { malId: 2, title: "B", imageUrl: null, state: s("watching", 0, 3) },
        { malId: 3, title: "C", imageUrl: null, state: s("watching", 0, 3) },
        { malId: 4, title: "D", imageUrl: null, state: s("watching", 0, 3) },
      ],
      new Map([
        [1, { mediaItemId: "m1", state: s("completed", 8, 12) }],
        [2, { mediaItemId: "m2", state: null }],
        [3, { mediaItemId: "m3", state: s("dropped", 0, 1) }],
      ]),
    );
    expect(rows.map((row) => row.kind)).toEqual(["same", "remote_only", "differs", "unmatched"]);
  });
});
