"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { applyChecks, rowFor, type Episode, type ProgressMap, type ProgressRow, type WatchStatus, type Work } from "@/lib/progress/derive";

type WorkUpdate = { itemId: string; episodesWatched?: number; status?: WatchStatus; score?: number; clearScore?: boolean };

type ProgressStore = {
  progress: ProgressMap;
  works: Work[];
  worksById: Map<string, Work>;
  episodesByParent: Map<string, Episode[]>;
  setChecked: (ids: string[], checked: boolean) => void;
  updateWork: (update: WorkUpdate) => void;
  mapEpisodes: (itemId: string) => Promise<void>;
  isSaving: boolean;
};

const Context = createContext<ProgressStore | null>(null);

export function useProgressStore(): ProgressStore {
  const value = useContext(Context);
  if (!value) throw new Error("useProgressStore must be used inside ProgressProvider");
  return value;
}

function toMap(rows: ProgressRow[]): ProgressMap {
  return Object.fromEntries(rows.map((row) => [row.media_item_id, row]));
}

/** Merge server rows, never letting an older version overwrite a newer one. */
function mergeRows(current: ProgressMap, rows: ProgressRow[]): ProgressMap {
  const next = { ...current };
  for (const row of rows) {
    const existing = next[row.media_item_id];
    if (!existing || row.version >= existing.version) next[row.media_item_id] = row;
  }
  return next;
}

type Snapshot = { before: Record<string, ProgressRow | undefined> };

export function ProgressProvider({
  queryKey,
  refreshUrl,
  initialRows,
  works,
  episodes,
  children,
}: {
  queryKey: readonly unknown[];
  refreshUrl: string;
  initialRows: ProgressRow[];
  works: Work[];
  episodes: Episode[];
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const worksById = useMemo(() => new Map(works.map((work) => [work.id, work])), [works]);
  const episodesByParent = useMemo(() => {
    const map = new Map<string, Episode[]>();
    for (const episode of episodes) map.set(episode.parentId, [...(map.get(episode.parentId) ?? []), episode]);
    return map;
  }, [episodes]);
  const parentOf = useMemo(() => new Map(episodes.map((episode) => [episode.id, episode.parentId])), [episodes]);

  const { data: progress } = useQuery({
    queryKey,
    queryFn: () => apiFetch<{ rows: ProgressRow[] }>(refreshUrl).then((body) => toMap(body.rows)),
    initialData: () => toMap(initialRows),
    staleTime: 60_000,
  });

  const snapshot = useCallback(
    (ids: string[]): Snapshot => {
      const current = queryClient.getQueryData<ProgressMap>(queryKey) ?? {};
      const affected = new Set(ids);
      for (const id of ids) {
        const parent = parentOf.get(id);
        if (parent) affected.add(parent);
      }
      return { before: Object.fromEntries([...affected].map((id) => [id, current[id]])) };
    },
    [parentOf, queryClient, queryKey],
  );

  const rollback = useCallback(
    (context: Snapshot | undefined) => {
      if (!context) return;
      queryClient.setQueryData<ProgressMap>(queryKey, (current = {}) => {
        const next = { ...current };
        for (const [id, row] of Object.entries(context.before)) {
          if (row) next[id] = row;
          else delete next[id];
        }
        return next;
      });
      void queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, queryKey],
  );

  const check = useMutation({
    mutationFn: (variables: { ids: string[]; checked: boolean }) =>
      apiFetch<{ rows: ProgressRow[] }>("/api/progress/check", { method: "POST", json: { itemIds: variables.ids, checked: variables.checked } }),
    onMutate: async ({ ids, checked }) => {
      await queryClient.cancelQueries({ queryKey });
      const context = snapshot(ids);
      queryClient.setQueryData<ProgressMap>(queryKey, (current = {}) => applyChecks(current, ids, checked, episodesByParent, worksById));
      return context;
    },
    onError: (error, variables, context) => {
      rollback(context);
      toast.error(`Not saved: ${error.message}. The change was undone.`, {
        action: { label: "Retry", onClick: () => check.mutate(variables) },
      });
    },
    onSuccess: ({ rows }) => {
      queryClient.setQueryData<ProgressMap>(queryKey, (current = {}) => mergeRows(current, rows));
    },
  });

  const work = useMutation({
    mutationFn: (update: WorkUpdate) => apiFetch<{ rows: ProgressRow[] }>("/api/progress/work", { method: "POST", json: update }),
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey });
      const context = snapshot([update.itemId]);
      queryClient.setQueryData<ProgressMap>(queryKey, (current = {}) => {
        const row = rowFor(current, update.itemId);
        const item = worksById.get(update.itemId);
        const total = item?.totalEpisodes ?? null;
        let watched = update.episodesWatched ?? row.episodes_watched;
        if (update.status === "completed" && update.episodesWatched === undefined && total) watched = total;
        return {
          ...current,
          [update.itemId]: {
            ...row,
            episodes_watched: watched,
            status: update.status ?? row.status,
            score: update.clearScore ? null : (update.score ?? row.score),
          },
        };
      });
      return context;
    },
    onError: (error, variables, context) => {
      rollback(context);
      toast.error(`Not saved: ${error.message}. The change was undone.`, {
        action: { label: "Retry", onClick: () => work.mutate(variables) },
      });
    },
    onSuccess: ({ rows }) => {
      queryClient.setQueryData<ProgressMap>(queryKey, (current = {}) => mergeRows(current, rows));
    },
  });

  const map = useMutation({
    mutationFn: (itemId: string) => apiFetch<{ rows: ProgressRow[] }>("/api/progress/map", { method: "POST", json: { itemId, confirm: true } }),
    onSuccess: ({ rows }) => {
      queryClient.setQueryData<ProgressMap>(queryKey, (current = {}) => mergeRows(current, rows));
      toast.success("Episodes marked as watched.");
    },
    onError: (error) => toast.error(error.message),
  });

  const value = useMemo<ProgressStore>(
    () => ({
      progress,
      works,
      worksById,
      episodesByParent,
      setChecked: (ids, checked) => {
        if (ids.length > 0) check.mutate({ ids, checked });
      },
      updateWork: (update) => work.mutate(update),
      mapEpisodes: async (itemId) => {
        await map.mutateAsync(itemId);
      },
      isSaving: check.isPending || work.isPending || map.isPending,
    }),
    [progress, works, worksById, episodesByParent, check, work, map],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
