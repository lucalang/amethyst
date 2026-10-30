"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Database,
  GitBranch,
  GitCommitHorizontal,
  History,
  Info,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { LiveDemoRuntimeState } from "@/app/api/version-history/route";
import { CatalogEmpty, CatalogSearch, FilterChip } from "@/components/catalog/catalog-search";
import { Button } from "@/components/ui/button";
import { catalogMatcher } from "@/lib/catalog-search";
import { formatChangeDate, releasePath } from "@/lib/changelog";
import { cn } from "@/lib/utils";
import {
  DEMO_RETENTION_HOURS,
  ENABLED_DEMO_SPECS,
  VERSION_HISTORY_CATALOG,
  getCatalogSummary,
  type DemoAvailabilityState,
  type VersionCommitEntry,
} from "@/lib/version-history";

type StateFilter = "all" | DemoAvailabilityState;

const STATE_LABELS: Readonly<Record<DemoAvailabilityState, string>> = {
  available: "Available Demo",
  not_prepared: "Not Prepared",
  unavailable: "Unavailable",
};

const PAGE_SIZES = [15, 30, 60] as const;

function StateBadge({ state }: { state: DemoAvailabilityState }) {
  if (state === "available") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
        <span aria-hidden className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
        {STATE_LABELS.available}
      </span>
    );
  }
  if (state === "unavailable") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-warning">
        <AlertTriangle aria-hidden className="size-3" />
        {STATE_LABELS.unavailable}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <Clock aria-hidden className="size-3" />
      {STATE_LABELS.not_prepared}
    </span>
  );
}

export function VersionHistoryBrowser({
  initialDemos,
}: {
  initialDemos: Record<string, LiveDemoRuntimeState>;
}) {
  const summary = useMemo(() => getCatalogSummary(), []);
  const [demos, setDemos] = useState<Record<string, LiveDemoRuntimeState>>(initialDemos);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [milestonesOnly, setMilestonesOnly] = useState(false);
  const [pageSize, setPageSize] = useState<number>(15);
  const [page, setPage] = useState(1);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);
  const [confirmingResetSha, setConfirmingResetSha] = useState<string | null>(null);
  const [resettingSha, setResettingSha] = useState<string | null>(null);

  const refreshDemoStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/version-history", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { demos?: Record<string, LiveDemoRuntimeState> };
      if (data.demos) setDemos(data.demos);
    } catch {
      // Keep existing state on transient error
    }
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshDemoStatuses();
      }
    };
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshDemoStatuses]);

  const handleCopySha = useCallback(async (sha: string) => {
    try {
      await navigator.clipboard.writeText(sha);
      setCopiedSha(sha);
      setTimeout(() => setCopiedSha((curr) => (curr === sha ? null : curr)), 1800);
    } catch {
      toast.error("Could not copy commit SHA.");
    }
  }, []);

  const handleResetDemo = useCallback(
    async (commit: VersionCommitEntry) => {
      setResettingSha(commit.sha);
      try {
        const res = await fetch("/api/version-history/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sha: commit.sha }),
        });
        const payload = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: { message?: string } }
          | null;
        if (!res.ok || !payload?.ok) {
          toast.error(payload?.error?.message ?? `Could not reset demo for ${commit.shortSha}.`);
          return;
        }
        toast.success(`Reset your demo workspace for ${commit.shortSha} to fresh-account defaults.`);
        setConfirmingResetSha(null);
        await refreshDemoStatuses();
      } catch {
        toast.error(`Could not reach demo service for ${commit.shortSha}.`);
      } finally {
        setResettingSha(null);
      }
    },
    [refreshDemoStatuses],
  );

  const availableMilestoneCommits = useMemo(
    () =>
      ENABLED_DEMO_SPECS.map((spec) => VERSION_HISTORY_CATALOG.find((c) => c.sha === spec.sha)).filter(
        (c): c is VersionCommitEntry => Boolean(c),
      ),
    [],
  );

  const matcher = useMemo(() => catalogMatcher(query), [query]);

  const filteredCommits = useMemo(() => {
    return VERSION_HISTORY_CATALOG.filter((commit) => {
      if (stateFilter !== "all" && commit.state !== stateFilter) return false;
      if (milestonesOnly && !commit.milestone) return false;
      if (!matcher) return true;
      return matcher(
        commit.sha,
        commit.shortSha,
        commit.title,
        commit.summary,
        commit.milestone,
        commit.releaseTitle,
        commit.releaseDescription,
        commit.commitDate,
        commit.releaseDate,
        commit.schemaVersion,
        STATE_LABELS[commit.state],
        ...commit.refs,
      );
    });
  }, [matcher, stateFilter, milestonesOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredCommits.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const visibleCommits = filteredCommits.slice(startIndex, startIndex + pageSize);

  const resetFilters = () => {
    setQuery("");
    setStateFilter("all");
    setMilestonesOnly(false);
    setPage(1);
  };

  return (
    <div className="space-y-10">
      {/* Summary & Honest Disclosure Banner */}
      <section aria-label="Version history overview" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card/70 p-4">
            <p className="text-xs font-medium text-muted-foreground">Cataloged commits</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.total}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Reachable across <code className="text-foreground/85">main</code> &amp;{" "}
              <code className="text-foreground/85">backup/pre-squash</code>
            </p>
          </div>
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4">
            <p className="text-xs font-medium text-emerald-300">Available Demo</p>
            <p className="mt-1 text-2xl font-bold text-emerald-200 tabular-nums">{summary.available}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Runnable milestones with isolated databases &amp; schemas
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card/70 p-4">
            <p className="text-xs font-medium text-muted-foreground">Not Prepared</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.notPrepared}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cataloged commits not currently built as live demo targets
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4">
            <p className="text-xs font-medium text-warning">Unavailable</p>
            <p className="mt-1 text-2xl font-bold text-warning tabular-nums">{summary.unavailable}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Retired external sync or mid-series build constraints
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-amethyst/25 bg-amethyst/[0.06] p-4 text-sm leading-relaxed text-foreground/90">
          <div className="flex flex-wrap items-start gap-3">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-amethyst" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="font-semibold text-foreground">
                Isolated fresh-account historical demos ({DEMO_RETENTION_HOURS}-hour workspace retention)
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                Listing a commit in the catalog below does not mean it has a live demo: only commits marked{" "}
                <strong className="font-medium text-emerald-300">Available Demo</strong> are prepared and playable,
                while <strong className="font-medium text-foreground/85">Not Prepared</strong> commits are cataloged for
                reference and future expansion. Each enabled milestone runs its original historical code and database
                migrations on a separate origin with a fresh demo account per visitor. Changes you make inside a demo
                persist across navigation and refresh for {DEMO_RETENTION_HOURS} hours, and{" "}
                <strong className="font-medium text-foreground/85">Reset Demo</strong> clears only your workspace for
                that specific version. Demos never connect to your production account, private uploads, or real coin
                balance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Playable Milestone Demos */}
      <section aria-labelledby="playable-milestones-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="playable-milestones-heading" className="text-lg font-bold tracking-tight">
              Playable historical milestones
            </h2>
            <p className="text-sm text-muted-foreground">
              Five prepared eras of Amethyst running their original interfaces and database schemas.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {availableMilestoneCommits.map((commit) => {
            const runtime = demos[commit.sha];
            const isOnline = Boolean(runtime?.online);
            const demoUrl = runtime?.demoUrl ?? `http://localhost:${commit.demo?.port ?? 4101}${commit.demo?.defaultPath ?? "/"}`;
            const isConfirming = confirmingResetSha === commit.sha;
            const isResetting = resettingSha === commit.sha;

            return (
              <article
                key={commit.sha}
                className="flex flex-col justify-between rounded-xl border border-amethyst/30 bg-card/80 p-5 shadow-sm transition-colors hover:border-amethyst/50"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StateBadge state={commit.state} />
                      {commit.milestone ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amethyst/35 bg-amethyst/15 px-2 py-0.5 text-xs font-semibold text-amethyst">
                          <Sparkles aria-hidden className="size-3" />
                          {commit.milestone}
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        isOnline
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-amber-500/10 text-warning",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full",
                          isOnline ? "bg-emerald-400" : "bg-amber-400",
                        )}
                      />
                      {isOnline ? `Online · :${commit.demo?.port}` : `Local runtime stopped · :${commit.demo?.port}`}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-foreground">{commit.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{commit.demo?.eraSummary}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Committed:{" "}
                      <time dateTime={commit.commitDate} className="font-medium text-foreground/85">
                        {formatChangeDate(commit.commitDate)}
                      </time>
                    </span>
                    {commit.releaseDate ? (
                      <span>
                        Verified release:{" "}
                        <time dateTime={commit.releaseDate} className="font-medium text-foreground/85">
                          {formatChangeDate(commit.releaseDate)}
                        </time>
                        {commit.releaseId ? (
                          <>
                            {" · "}
                            <Link
                              href={releasePath(commit.releaseId)}
                              className="text-amethyst underline-offset-4 hover:underline"
                            >
                              Release notes
                            </Link>
                          </>
                        ) : null}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <Database aria-hidden className="size-3 text-muted-foreground/75" />
                      {commit.migrationCount} migrations
                    </span>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/35 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                    <GitCommitHorizontal aria-hidden className="size-3.5 shrink-0 text-amethyst" />
                    <span className="truncate select-all" title={commit.sha}>
                      {commit.sha}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopySha(commit.sha)}
                      aria-label={`Copy full SHA ${commit.sha}`}
                      className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-sans font-medium text-foreground/80 hover:bg-white/[0.08]"
                    >
                      {copiedSha === commit.sha ? (
                        <>
                          <Check aria-hidden className="size-3 text-emerald-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy aria-hidden className="size-3" /> Copy SHA
                        </>
                      )}
                    </button>
                  </div>

                  {commit.demo?.features.length ? (
                    <ul className="space-y-1 text-xs text-foreground/85">
                      {commit.demo.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2">
                          <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-amethyst" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {commit.demo?.containedIntegrations.length ? (
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                      <span className="font-semibold text-foreground/80">Sandbox containment: </span>
                      {commit.demo.containedIntegrations.join(" · ")}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {isOnline ? (
                        <Button asChild size="sm">
                          <a href={demoUrl}>
                            <Play aria-hidden className="size-3.5" />
                            Launch Fresh Demo ({commit.shortSha})
                            <ArrowUpRight aria-hidden className="size-3.5" />
                          </a>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled>
                          Demo server offline (run npm run demos -- start {commit.shortSha})
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!isOnline || isResetting}
                        onClick={() =>
                          setConfirmingResetSha((prev) => (prev === commit.sha ? null : commit.sha))
                        }
                      >
                        <RotateCcw aria-hidden className="size-3.5" />
                        Reset Demo
                      </Button>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {runtime?.hasWorkspace ? "Active demo workspace" : "Starts fresh on first open"}
                    </span>
                  </div>

                  {isConfirming ? (
                    <div
                      role="alertdialog"
                      aria-label={`Confirm reset for demo ${commit.shortSha}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
                    >
                      <span>
                        Reset only your demo workspace for <strong>{commit.shortSha}</strong> back to fresh-account
                        defaults?
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => setConfirmingResetSha(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          disabled={isResetting}
                          onClick={() => void handleResetDemo(commit)}
                        >
                          {isResetting ? "Resetting…" : "Confirm Reset"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Complete Retained Commit Catalog */}
      <section aria-labelledby="complete-catalog-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-white/[0.08] pt-8">
          <div>
            <h2 id="complete-catalog-heading" className="text-lg font-bold tracking-tight">
              Complete commit catalog ({summary.total} commits)
            </h2>
            <p className="text-sm text-muted-foreground">
              Every retained commit reachable from repository branches and tags, deduplicated by full 40-character SHA.
            </p>
          </div>
          <CatalogSearch
            value={query}
            onChange={(val) => {
              setQuery(val);
              setPage(1);
            }}
            label="Search commit history"
            placeholder="Search SHA, title, milestone, schema…"
            className="sm:w-72"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Filter commits by demo state" className="flex flex-wrap items-center gap-2">
            <FilterChip
              pressed={stateFilter === "all"}
              onClick={() => {
                setStateFilter("all");
                setPage(1);
              }}
              count={summary.total}
            >
              All commits
            </FilterChip>
            <FilterChip
              pressed={stateFilter === "available"}
              onClick={() => {
                setStateFilter("available");
                setPage(1);
              }}
              count={summary.available}
            >
              Available Demo
            </FilterChip>
            <FilterChip
              pressed={stateFilter === "not_prepared"}
              onClick={() => {
                setStateFilter("not_prepared");
                setPage(1);
              }}
              count={summary.notPrepared}
            >
              Not Prepared
            </FilterChip>
            <FilterChip
              pressed={stateFilter === "unavailable"}
              onClick={() => {
                setStateFilter("unavailable");
                setPage(1);
              }}
              count={summary.unavailable}
            >
              Unavailable
            </FilterChip>
            <FilterChip
              pressed={milestonesOnly}
              onClick={() => {
                setMilestonesOnly((prev) => !prev);
                setPage(1);
              }}
              count={summary.milestones}
            >
              Milestones only
            </FilterChip>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <label htmlFor="commits-per-page">Per page:</label>
            <select
              id="commits-per-page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PAGE_SIZES.map((sz) => (
                <option key={sz} value={sz}>
                  {sz === 60 ? "All (60)" : sz}
                </option>
              ))}
            </select>
          </div>
        </div>

        {visibleCommits.length === 0 ? (
          <CatalogEmpty query={query} onReset={resetFilters} />
        ) : (
          <ol aria-label="Cataloged repository commits" className="space-y-3">
            {visibleCommits.map((commit) => {
              const runtime = demos[commit.sha];
              const isOnline = Boolean(runtime?.online);
              const demoUrl =
                runtime?.demoUrl ??
                `http://localhost:${commit.demo?.port ?? 4101}${commit.demo?.defaultPath ?? "/"}`;
              const isConfirming = confirmingResetSha === commit.sha;
              const isResetting = resettingSha === commit.sha;

              return (
                <li
                  key={commit.sha}
                  id={`commit-${commit.shortSha}`}
                  className={cn(
                    "rounded-xl border p-4 transition-colors",
                    commit.state === "available"
                      ? "border-amethyst/30 bg-card/85"
                      : commit.state === "unavailable"
                        ? "border-amber-500/20 bg-card/50"
                        : "border-border bg-card/60",
                  )}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StateBadge state={commit.state} />
                        {commit.milestone ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amethyst/35 bg-amethyst/15 px-2 py-0.5 text-xs font-semibold text-amethyst">
                            <Sparkles aria-hidden className="size-3" />
                            {commit.milestone}
                          </span>
                        ) : null}
                        {commit.refs.map((ref) => (
                          <span
                            key={ref}
                            className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                          >
                            <GitBranch aria-hidden className="size-2.5" />
                            {ref}
                          </span>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Committed:{" "}
                          <time dateTime={commit.commitDate} className="font-medium text-foreground/85">
                            {formatChangeDate(commit.commitDate)}
                          </time>
                        </span>
                        {commit.releaseDate ? (
                          <span>
                            Verified release:{" "}
                            <time dateTime={commit.releaseDate} className="font-medium text-emerald-300">
                              {formatChangeDate(commit.releaseDate)}
                            </time>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/65">Internal / intermediate commit</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-base font-semibold tracking-tight text-foreground">{commit.title}</h3>
                      {commit.summary ? (
                        <p className="text-xs leading-5 text-muted-foreground">{commit.summary}</p>
                      ) : null}
                    </div>

                    {commit.releaseDescription ? (
                      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs leading-5 text-foreground/85">
                        <span className="font-semibold text-amethyst">
                          Release ({commit.releaseTitle ?? commit.releaseDate}):{" "}
                        </span>
                        {commit.releaseDescription}{" "}
                        {commit.releaseId ? (
                          <Link
                            href={releasePath(commit.releaseId)}
                            className="font-medium text-amethyst underline-offset-4 hover:underline"
                          >
                            View release notes →
                          </Link>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/30 px-3 py-1.5 text-xs">
                      <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-muted-foreground">
                        <span className="rounded bg-amethyst/15 px-1.5 py-0.5 font-semibold text-amethyst">
                          {commit.shortSha}
                        </span>
                        <span className="truncate select-all" title={commit.sha}>
                          {commit.sha}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopySha(commit.sha)}
                          aria-label={`Copy full SHA ${commit.sha}`}
                          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[11px] text-foreground/75 hover:bg-white/[0.08]"
                        >
                          {copiedSha === commit.sha ? (
                            <>
                              <Check aria-hidden className="size-3 text-emerald-400" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy aria-hidden className="size-3" /> Copy
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Database aria-hidden className="size-3" />
                        <span>
                          {commit.migrationCount} migrations
                          {commit.schemaVersion ? ` · ${commit.schemaVersion}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
                        <span>{commit.stateReason}</span>
                      </p>

                      {commit.state === "available" ? (
                        <div className="flex shrink-0 items-center gap-2">
                          {isOnline ? (
                            <Button asChild size="xs">
                              <a href={demoUrl}>
                                <Play aria-hidden className="size-3" />
                                Launch Demo
                                <ArrowUpRight aria-hidden className="size-3" />
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-warning">
                              Local server stopped (<code>npm run demos -- start {commit.shortSha}</code>)
                            </span>
                          )}
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={!isOnline || isResetting}
                            onClick={() =>
                              setConfirmingResetSha((prev) => (prev === commit.sha ? null : commit.sha))
                            }
                          >
                            <RotateCcw aria-hidden className="size-3" />
                            Reset Demo
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {isConfirming && commit.state === "available" ? (
                      <div
                        role="alertdialog"
                        aria-label={`Confirm reset for demo ${commit.shortSha}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
                      >
                        <span>
                          Reset only your demo workspace for <strong>{commit.shortSha}</strong> back to fresh-account
                          defaults?
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() => setConfirmingResetSha(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="destructive"
                            disabled={isResetting}
                            onClick={() => void handleResetDemo(commit)}
                          >
                            {isResetting ? "Resetting…" : "Confirm Reset"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Pagination */}
        {filteredCommits.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4 text-xs text-muted-foreground">
            <span>
              Showing <strong className="font-medium text-foreground">{startIndex + 1}</strong>–
              <strong className="font-medium text-foreground">
                {Math.min(startIndex + pageSize, filteredCommits.length)}
              </strong>{" "}
              of <strong className="font-medium text-foreground">{filteredCommits.length}</strong> commits
            </span>
            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="tabular-nums">
                  Page <strong className="text-foreground">{safePage}</strong> of{" "}
                  <strong className="text-foreground">{totalPages}</strong>
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function VersionHistoryLinkButton() {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/version-history">
        <History aria-hidden className="size-3.5 text-amethyst" />
        Version history
      </Link>
    </Button>
  );
}
