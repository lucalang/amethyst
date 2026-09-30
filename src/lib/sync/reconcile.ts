// Pure reconciliation rules between local progress, the MAL list and the last
// agreed baseline. No I/O: unit tested in isolation.
import type { WatchStatus } from "../providers/mal.ts";

export type SyncState = { status: WatchStatus; score: number; watched: number };

export function normalizeState(value: { status?: string | null; score?: number | null; watched?: number | null }): SyncState {
  return {
    status: (value.status ?? "plan_to_watch") as WatchStatus,
    score: value.score ?? 0,
    watched: value.watched ?? 0,
  };
}

export function sameState(a: SyncState, b: SyncState): boolean {
  return a.status === b.status && a.score === b.score && a.watched === b.watched;
}

export function isUntouched(local: SyncState | null): boolean {
  return !local || (local.status === "plan_to_watch" && local.score === 0 && local.watched === 0);
}

export type PullDecision = "none" | "apply_remote" | "adopt_baseline" | "conflict";

/**
 * Decide what an inbound MAL list state means for a linked local work.
 * Never overwrites a local change silently: simultaneous edits become conflicts.
 */
export function decidePull(input: {
  local: SyncState | null;
  remote: SyncState;
  baseline: SyncState | null;
  pendingPush: boolean;
}): PullDecision {
  const { local, remote, baseline, pendingPush } = input;
  if (!baseline) {
    if (isUntouched(local) && !pendingPush) return "apply_remote";
    if (local && sameState(local, remote)) return "adopt_baseline";
    return "conflict";
  }
  const remoteChanged = !sameState(remote, baseline);
  if (!remoteChanged) return "none";
  const localChanged = pendingPush || (local ? !sameState(local, baseline) : false);
  if (!localChanged) return "apply_remote";
  return local && sameState(local, remote) ? "adopt_baseline" : "conflict";
}

export type PushDecision = "push" | "noop" | "conflict";

/** Decide whether a queued local change may be written to MAL. */
export function decidePush(input: { desired: SyncState; remote: SyncState | null; baseline: SyncState | null }): PushDecision {
  const { desired, remote, baseline } = input;
  if (!remote) return baseline ? "conflict" : "push"; // removed on MAL since the last sync vs. never listed
  if (sameState(remote, desired)) return "noop";
  if (baseline && sameState(remote, baseline)) return "push";
  return "conflict"; // remote changed since the last agreed state
}

export type PreviewRow = {
  malId: number;
  title: string;
  imageUrl: string | null;
  remote: SyncState;
  local: SyncState | null;
  mediaItemId: string | null;
  kind: "unmatched" | "same" | "remote_only" | "differs";
};

/** Initial-sync preview: classify every MAL list entry against the archive. */
export function buildSyncPreview(
  remoteEntries: { malId: number; title: string; imageUrl: string | null; state: SyncState }[],
  localByMalId: Map<number, { mediaItemId: string; state: SyncState | null }>,
): PreviewRow[] {
  return remoteEntries.map((entry) => {
    const local = localByMalId.get(entry.malId);
    const base = { malId: entry.malId, title: entry.title, imageUrl: entry.imageUrl, remote: entry.state };
    if (!local) return { ...base, local: null, mediaItemId: null, kind: "unmatched" as const };
    if (local.state && sameState(local.state, entry.state)) return { ...base, local: local.state, mediaItemId: local.mediaItemId, kind: "same" as const };
    if (isUntouched(local.state)) return { ...base, local: local.state, mediaItemId: local.mediaItemId, kind: "remote_only" as const };
    return { ...base, local: local.state, mediaItemId: local.mediaItemId, kind: "differs" as const };
  });
}
