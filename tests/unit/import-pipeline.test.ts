import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryCache } from "@/lib/providers/cache";
import { RateLimitedError } from "@/lib/providers/http";
import { createJikanClient } from "@/lib/providers/jikan";
import {
  IMPORT_LIMITS,
  ImportFatalError,
  initialCheckpoint,
  runImportSlice,
  type ImportCheckpoint,
  type ImportInput,
} from "@/lib/imports/pipeline";
import { FIXTURE_ROOT_ID, createFixtureFetch, type FixtureFetchOptions } from "../support/jikan-fixtures";
import { createMemorySink } from "../support/memory-sink";

const BASE = "http://jikan.test/v4";

function setup(options: FixtureFetchOptions = {}, cache = createMemoryCache()) {
  const fixture = createFixtureFetch(BASE, options);
  const sleep = vi.fn(async () => undefined);
  const jikan = createJikanClient({ baseUrl: BASE, http: { fetch: fixture.fetch, sleep }, cache, maxInlineWaitMs: 5_000 });
  return { fixture, sleep, jikan, cache };
}

async function runToEnd(
  jikan: ReturnType<typeof setup>["jikan"],
  sink: ReturnType<typeof createMemorySink>["sink"],
  input: ImportInput,
  cp: ImportCheckpoint = initialCheckpoint(input),
) {
  const saved: ImportCheckpoint[] = [];
  await runImportSlice(cp, {
    jikan,
    sink,
    input,
    shouldYield: () => false,
    onCheckpoint: async (state) => {
      saved.push(JSON.parse(JSON.stringify(state)));
    },
  });
  return { cp, saved };
}

const input: ImportInput = { mal_id: FIXTURE_ROOT_ID, traverse: true };

afterEach(() => {
  IMPORT_LIMITS.maxWorks = 80;
});

describe("franchise import pipeline", () => {
  it("imports the related franchise with categorized works", async () => {
    const { jikan } = setup();
    const memory = createMemorySink();
    await runToEnd(jikan, memory.sink, input);

    expect([...memory.works.keys()].sort()).toEqual([1001, 1002, 1003, 1004, 1005, 1007]);
    const byId = Object.fromEntries([...memory.works.values()].map((node) => [node.malId, node]));
    expect(byId[1001]).toMatchObject({ kind: "series", section: "main", relation: null, totalEpisodes: 26 });
    expect(byId[1002]).toMatchObject({ kind: "series", section: "main", relation: "Sequel", totalEpisodes: null });
    expect(byId[1003]).toMatchObject({ kind: "ova", section: "ova_special" });
    expect(byId[1004]).toMatchObject({ kind: "movie", section: "movie", needsEpisodes: false });
    expect(byId[1005]).toMatchObject({ kind: "special", section: "ova_special", needsEpisodes: false });
    expect(byId[1007]).toMatchObject({ kind: "special", section: "ova_special" });
    expect(memory.calls.finish).toBe(1);
  });

  it("follows paginated episode lists without inventing missing episodes", async () => {
    const { jikan, fixture } = setup();
    const memory = createMemorySink();
    await runToEnd(jikan, memory.sink, input);

    expect(memory.episodesOf(1001)).toHaveLength(26);
    expect(fixture.calls).toContain("/anime/1001/episodes?page=2");
    expect(memory.episodesOf(1002)).toHaveLength(3); // airing, total unknown
    expect(memory.episodesOf(1003)).toHaveLength(0); // provider has no list
    expect(memory.episodesOf(1004)).toHaveLength(0); // movies are checked directly
    const codes = memory.summary!.warnings.map((warning) => `${warning.code}:${warning.malId ?? ""}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        "no_episode_list:1003",
        "unknown_total:1002",
        "unknown_type:1007",
        "missing_work:1008",
        "not_trackable:1006",
      ]),
    );
  });

  it("visits every work once despite prequel/sequel cycles", async () => {
    const { jikan, fixture } = setup();
    await runToEnd(jikan, createMemorySink().sink, input);
    const fullCalls = fixture.calls.filter((call) => call.endsWith("/full"));
    expect(new Set(fullCalls).size).toBe(fullCalls.length);
    expect(fullCalls.filter((call) => call === "/anime/1001/full")).toHaveLength(1);
  });

  it("links crossovers and non-works as candidates without traversing them", async () => {
    const { jikan, fixture } = setup();
    const memory = createMemorySink();
    await runToEnd(jikan, memory.sink, input);
    const candidates = memory.summary!.candidates;
    expect(candidates.map((candidate) => candidate.malId).sort()).toEqual([1006, 2001, 2002]);
    expect(candidates.find((candidate) => candidate.malId === 2001)).toMatchObject({ relation: "Other", reason: "linked" });
    expect(candidates.find((candidate) => candidate.malId === 1006)).toMatchObject({ reason: "not_trackable" });
    expect(fixture.calls).not.toContain("/anime/2001/full");
    expect(fixture.calls).not.toContain("/anime/2002/full");
    expect(fixture.calls.some((call) => call.includes("/anime/5/"))).toBe(false); // manga adaptation ignored
  });

  it("stores characters and records coverage", async () => {
    const { jikan } = setup();
    const memory = createMemorySink();
    await runToEnd(jikan, memory.sink, input);
    expect(memory.characters.get(1001)).toBe(3);
    expect(memory.summary!.coverage).toMatchObject({ works: 6, episodes: 29, traversed: true, truncated: false });
    expect(memory.summary!.coverage.byKind).toEqual({ series: 2, movie: 1, ova: 1, ona: 0, special: 2 });
  });

  it("is idempotent for duplicate imports and serves repeats from cache", async () => {
    const { jikan, fixture } = setup();
    const memory = createMemorySink();
    await runToEnd(jikan, memory.sink, input);
    const firstCalls = fixture.calls.length;
    await runToEnd(jikan, memory.sink, input);

    expect(memory.entries.size).toBe(1);
    expect(memory.works.size).toBe(6);
    expect(memory.episodes.size).toBe(29);
    expect(fixture.calls.length).toBe(firstCalls); // everything cached
  });

  it("resumes from a persisted checkpoint with identical results", async () => {
    const { jikan } = setup();
    const memory = createMemorySink();
    const cp = initialCheckpoint(input);
    let steps = 0;
    let persisted: ImportCheckpoint | null = null;
    const first = await runImportSlice(cp, {
      jikan,
      sink: memory.sink,
      input,
      shouldYield: () => steps >= 4,
      onCheckpoint: async (state) => {
        steps++;
        persisted = JSON.parse(JSON.stringify(state));
      },
    });
    expect(first.done).toBe(false);
    expect(persisted).not.toBeNull();

    await runToEnd(jikan, memory.sink, input, persisted!);
    expect(memory.works.size).toBe(6);
    expect(memory.episodes.size).toBe(29);
    expect(memory.calls.finish).toBe(1);
  });

  it("waits out a short 429 using Retry-After", async () => {
    const { jikan, sleep } = setup({ failures: { "/anime/1002/full": [{ status: 429, retryAfter: "1" }] } });
    const memory = createMemorySink();
    await runToEnd(jikan, memory.sink, input);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(memory.works.has(1002)).toBe(true);
  });

  it("surfaces long rate limits so the job can be rescheduled, then resumes", async () => {
    const { jikan } = setup({ failures: { "/anime/1002/full": [{ status: 429, retryAfter: "120" }] } });
    const memory = createMemorySink();
    const cp = initialCheckpoint(input);
    let persisted: ImportCheckpoint = JSON.parse(JSON.stringify(cp));
    await expect(
      runImportSlice(cp, {
        jikan,
        sink: memory.sink,
        input,
        shouldYield: () => false,
        onCheckpoint: async (state) => {
          persisted = JSON.parse(JSON.stringify(state));
        },
      }),
    ).rejects.toBeInstanceOf(RateLimitedError);

    // The worker resumes from the last persisted checkpoint (never the half-applied one).
    expect(persisted.queue.some((queued) => queued.malId === 1002)).toBe(true);
    await runToEnd(jikan, memory.sink, input, persisted);
    expect(memory.works.size).toBe(6);
  });

  it("retries transient 5xx responses with backoff", async () => {
    const { jikan, sleep } = setup({ failures: { "/anime/1001/full": [{ status: 502 }, { status: 500 }] } });
    const memory = createMemorySink();
    await runToEnd(jikan, memory.sink, input);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
    expect(memory.works.has(1001)).toBe(true);
  });

  it("records related works the provider keeps failing on instead of aborting", async () => {
    const failures = Array.from({ length: 4 }, () => ({ status: 504 }));
    const { jikan } = setup({ failures: { "/anime/1003/full": failures, "/anime/1002/episodes": failures } });
    const memory = createMemorySink();
    await runToEnd(jikan, memory.sink, input);
    expect(memory.works.has(1003)).toBe(false);
    expect(memory.works.size).toBe(5);
    const codes = memory.summary!.warnings.map((warning) => `${warning.code}:${warning.malId}`);
    expect(codes).toEqual(expect.arrayContaining(["provider_unavailable:1003", "episodes_unavailable:1002"]));
    expect(memory.summary!.candidates.find((candidate) => candidate.malId === 1003)).toMatchObject({ reason: "unavailable", name: "Fixture Saga OVA" });
  });

  it("fails permanently when the root anime does not exist", async () => {
    const { jikan } = setup();
    await expect(runToEnd(jikan, createMemorySink().sink, { mal_id: 999999, traverse: true })).rejects.toBeInstanceOf(ImportFatalError);
  });

  it("imports a single work when traversal is disabled", async () => {
    const { jikan } = setup();
    const memory = createMemorySink();
    await runToEnd(jikan, memory.sink, { mal_id: 2002, traverse: false });
    expect([...memory.works.keys()]).toEqual([2002]);
    expect(memory.episodesOf(2002)).toHaveLength(12);
    expect(memory.summary!.coverage.traversed).toBe(false);
  });

  it("bounds traversal and reports truncation", async () => {
    IMPORT_LIMITS.maxWorks = 2;
    const { jikan } = setup();
    const memory = createMemorySink();
    await runToEnd(jikan, memory.sink, input);
    expect(memory.works.size).toBeLessThanOrEqual(2);
    expect(memory.summary!.coverage.truncated).toBe(true);
    expect(memory.summary!.warnings.some((warning) => warning.code === "work_limit")).toBe(true);
    expect(memory.summary!.candidates.some((candidate) => candidate.reason === "limit")).toBe(true);
  });
});
