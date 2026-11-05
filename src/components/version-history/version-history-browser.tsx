"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Database,
  GitBranch,
  History,
  Info,
  Megaphone,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { LiveDemoRuntimeState } from "@/lib/version-demo-runtime";
import { CatalogEmpty, CatalogSearch, FilterChip } from "@/components/catalog/catalog-search";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { useSettings } from "@/components/layout/settings-context";
import { Button } from "@/components/ui/button";
import { catalogMatcher } from "@/lib/catalog-search";
import { findBrowserDemoSpec } from "@/lib/browser-version-demos";
import { formatChangeDate, releasePath } from "@/lib/changelog";
import { cn } from "@/lib/utils";
import {
  VERSION_HISTORY_CATALOG,
  getCatalogSummary,
  type DemoAvailabilityState,
  type VersionCommitEntry,
} from "@/lib/version-history";
import { dayNumber, formatDay, type ChronoCommit } from "./chrono-timing";
import { LaunchDemoLink, VersionHistoryStage } from "./version-history-stage";

type StateFilter = "all" | DemoAvailabilityState;

function chronoOf(commit: VersionCommitEntry): ChronoCommit {
  return {
    shortSha: commit.shortSha,
    day: dayNumber(commit.commitDate),
    time: Date.parse(commit.commitTimestamp) / 86_400_000,
    milestone: commit.milestone,
    title: commit.title,
    available: commit.state === "available",
  };
}

/** Oldest first: the order of the chronometer's index ring. */
const CHRONO_COMMITS: ChronoCommit[] = [...VERSION_HISTORY_CATALOG].reverse().map(chronoOf);

const STATE_LABELS: Readonly<Record<DemoAvailabilityState, string>> = {
  available: "Available Demo",
  not_prepared: "Not Prepared",
  unavailable: "Unavailable",
};

const PAGE_SIZES = [15, 30, 60] as const;

/** Milestone section classes: the chronometer's brass plates, or the standard card style. */
const MILESTONE_CLASSES = {
  special: {
    section: "vh-section",
    head: "vh-section-head",
    title: "vh-section-title",
    grid: "vh-capsules",
    card: "vh-capsule vh-plate",
    cardHead: "vh-capsule-head",
    window: "vh-capsule-window",
    sha: "vh-capsule-sha",
    lamp: "vh-lamp",
    bulb: "vh-lamp-bulb",
    milestone: "vh-capsule-milestone",
    cardTitle: "vh-capsule-title",
    meta: "vh-capsule-meta",
    controls: "vh-capsule-controls",
    launch: "vh-launch",
    state: "vh-capsule-state",
    confirm: "vh-confirm",
  },
  standard: {
    section: "space-y-4",
    head: "",
    title: "text-lg font-bold tracking-tight",
    grid: "grid gap-3 sm:grid-cols-2 xl:grid-cols-3",
    card: "flex flex-col gap-2 rounded-xl border border-border bg-card/80 p-4",
    cardHead: "flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground",
    window: "flex items-center gap-2",
    sha: "rounded bg-amethyst/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amethyst",
    lamp: "group inline-flex items-center gap-1.5 text-xs font-medium data-[state=online]:text-emerald-300",
    bulb: "size-1.5 rounded-full bg-muted-foreground group-data-[state=online]:bg-emerald-400",
    milestone: "inline-flex items-center gap-1 text-xs font-semibold text-amethyst",
    cardTitle: "text-base font-semibold tracking-tight text-foreground",
    meta: "text-xs text-muted-foreground [&_a]:text-amethyst [&_a]:underline-offset-4 [&_a:hover]:underline",
    controls: "mt-auto flex flex-wrap items-center justify-between gap-2 pt-2",
    launch: "",
    state: "text-xs text-muted-foreground",
    confirm:
      "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200",
  },
} as const;

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
  const { specialPages } = useSettings();
  const ms = MILESTONE_CLASSES[specialPages ? "special" : "standard"];
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
          signal: AbortSignal.timeout(5000),
        });
        const payload = (await res.json().catch(() => null)) as
          | { ok?: boolean; resetUrl?: string; error?: { message?: string } }
          | null;
        if (!res.ok || !payload?.ok || !payload.resetUrl) {
          toast.error(payload?.error?.message ?? `Could not reset demo for ${commit.shortSha}.`);
          return;
        }
        setConfirmingResetSha(null);
        window.location.assign(payload.resetUrl);
      } catch {
        toast.error(`Could not reach demo service for ${commit.shortSha}.`);
      } finally {
        setResettingSha(null);
      }
    },
    [],
  );

  const availableMilestoneCommits = useMemo(
    () => VERSION_HISTORY_CATALOG.filter((commit) => commit.state === "available")
      .sort((left, right) => left.commitTimestamp.localeCompare(right.commitTimestamp)),
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

  const gauges = [
    { label: "Cataloged commits", value: summary.total, tone: "brass" },
    { label: STATE_LABELS.available, value: summary.available, tone: "ok" },
    { label: STATE_LABELS.not_prepared, value: summary.notPrepared, tone: "off" },
    { label: STATE_LABELS.unavailable, value: summary.unavailable, tone: "warn" },
  ];

  const whatsNew = (
    <Button asChild variant="outline" size="sm">
      <Link href="/whats-new">
        <Megaphone aria-hidden className="size-3.5 text-amethyst" />
        What’s new
      </Link>
    </Button>
  );

  const hero = (
    <>
      <p className="vh-kicker">Chronometric archive</p>
      <h1 className="vh-title">Version history</h1>
      <p className="vh-lede">
        {"Every retained commit in Amethyst's repository, with interactive demos for prepared snapshots."}
      </p>
      <div className="vh-hero-actions">{whatsNew}</div>
      <section aria-label="Version history overview">
        <dl className="vh-gauges">
          {gauges.map((gauge) => (
            <div
              key={gauge.label}
              className="vh-gauge"
              data-tone={gauge.tone}
              style={{ "--vh-level": summary.total ? gauge.value / summary.total : 0 } as CSSProperties}
            >
              <span aria-hidden className="vh-dial">
                <span className="vh-needle" />
              </span>
              <dt>{gauge.label}</dt>
              <dd>{gauge.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );

  const content = (
    <>
      {/* Playable Milestone Demos */}
      <section aria-labelledby="playable-milestones-heading" className={ms.section}>
        <div className={ms.head}>
          <h2 id="playable-milestones-heading" className={ms.title}>
            {specialPages ? (
              <span aria-hidden className="vh-section-index">
                I
              </span>
            ) : null}
            Playable historical milestones
          </h2>
          {specialPages ? <span aria-hidden className="vh-section-rule" /> : null}
        </div>

        <div className={ms.grid}>
          {availableMilestoneCommits.map((commit) => {
            const runtime = demos[commit.sha];
            const demoUrl = runtime?.demoUrl;
            const isOnline = Boolean(runtime?.online && demoUrl);
            const isConfirming = confirmingResetSha === commit.sha;
            const isResetting = resettingSha === commit.sha;

            return (
              <article key={commit.sha} className={ms.card} data-online={isOnline}>
                <div className={ms.cardHead}>
                  <span className={ms.window}>
                    <time dateTime={commit.commitDate}>{formatDay(dayNumber(commit.commitDate))}</time>
                    <span className={ms.sha}>{commit.shortSha}</span>
                  </span>
                  <span className={ms.lamp} data-state={isOnline ? "online" : "offline"}>
                    <span aria-hidden className={ms.bulb} />
                    {isOnline ? "Online" : "Offline"}
                  </span>
                </div>

                {commit.milestone ? (
                  <p className={ms.milestone}>
                    <Sparkles aria-hidden className="size-3.5" />
                    {commit.milestone}
                  </p>
                ) : null}
                <h3 className={ms.cardTitle}>{commit.title}</h3>

                {commit.releaseDate ? (
                  <p className={ms.meta}>
                    Release: <time dateTime={commit.releaseDate}>{formatChangeDate(commit.releaseDate)}</time>
                    {commit.releaseId ? (
                      <>
                        {" · "}
                        <Link href={releasePath(commit.releaseId)}>Release</Link>
                      </>
                    ) : null}
                  </p>
                ) : null}

                <div className={ms.controls}>
                  <div className="flex flex-wrap items-center gap-2">
                    {isOnline && demoUrl ? (
                      <Button asChild size="sm" className={ms.launch}>
                        <LaunchDemoLink commit={chronoOf(commit)} href={demoUrl}>
                          <Play aria-hidden className="size-3.5" />
                          Launch Demo
                          <ArrowUpRight aria-hidden className="size-3.5" />
                        </LaunchDemoLink>
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled>
                        Launch Demo
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!isOnline || isResetting}
                      onClick={() => setConfirmingResetSha((prev) => (prev === commit.sha ? null : commit.sha))}
                    >
                      <RotateCcw aria-hidden className="size-3.5" />
                      Reset Demo
                    </Button>
                  </div>
                  <span className={ms.state}>{findBrowserDemoSpec(commit.sha) ? "Browser-local sample workspace" : "Isolated visitor workspace"}</span>
                </div>

                {isConfirming ? (
                  <div role="alertdialog" aria-label={`Confirm reset for demo ${commit.shortSha}`} className={ms.confirm}>
                    <span>
                      Reset only your demo workspace for <strong>{commit.shortSha}</strong> back to its starting
                      state?
                    </span>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="xs" variant="ghost" onClick={() => setConfirmingResetSha(null)}>
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
              className="h-8 cursor-pointer rounded-md border border-border bg-surface px-2 text-xs text-foreground transition-[border-color,background-color,box-shadow] duration-200 outline-none hover:border-amethyst/50 hover:bg-surface-raised hover:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.08)] focus-visible:ring-2 focus-visible:ring-ring"
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
              const demoUrl = runtime?.demoUrl;
              const isOnline = Boolean(runtime?.online && demoUrl);
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
                          className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-foreground/[0.03] px-2 py-0.5 font-sans text-[11px] font-medium text-foreground/85 transition-[color,background-color,border-color,scale] duration-150 outline-none select-none hover:border-amethyst/50 hover:bg-amethyst/[0.1] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
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
                          {isOnline && demoUrl ? (
                            <Button asChild size="xs">
                              <LaunchDemoLink commit={chronoOf(commit)} href={demoUrl}>
                                <Play aria-hidden className="size-3" />
                                Launch Demo
                                <ArrowUpRight aria-hidden className="size-3" />
                              </LaunchDemoLink>
                            </Button>
                          ) : (
                            <span className="text-xs text-warning">
                              Demo is currently offline.
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
                          Reset only your demo workspace for <strong>{commit.shortSha}</strong> back to its starting
                          state?
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
    </>
  );

  if (specialPages) {
    return (
      <VersionHistoryStage commits={CHRONO_COMMITS} hero={hero}>
        {content}
      </VersionHistoryStage>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Version history"
        description="Every retained commit in Amethyst's repository, with interactive fresh-account demos for prepared milestones."
        actions={whatsNew}
      />
      <section aria-label="Version history overview" className="mb-8">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {gauges.map((gauge) => (
            <div key={gauge.label} className="rounded-xl border border-border bg-card/70 px-4 py-3">
              <dt className="text-xs text-muted-foreground">{gauge.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{gauge.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="space-y-10">{content}</div>
    </PageContainer>
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
