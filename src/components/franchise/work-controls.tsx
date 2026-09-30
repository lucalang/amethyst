"use client";

import { useState } from "react";
import { CheckCheck, Info, Loader2, Minus, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABELS } from "@/lib/format";
import { workProgress, type Work, type WatchStatus } from "@/lib/progress/derive";
import { useProgressStore } from "./progress-store";

export function StatusScoreControls({ work }: { work: Work }) {
  const { progress, episodesByParent, updateWork } = useProgressStore();
  const state = workProgress(work, progress, episodesByParent.get(work.id) ?? []);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={state.status} onValueChange={(value) => updateWork({ itemId: work.id, status: value as WatchStatus })}>
        <SelectTrigger size="sm" className="w-36" aria-label={`Status for ${work.title}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={state.score ? String(state.score) : "none"}
        onValueChange={(value) =>
          value === "none" ? updateWork({ itemId: work.id, clearScore: true }) : updateWork({ itemId: work.id, score: Number(value) })
        }
      >
        <SelectTrigger size="sm" className="w-28" aria-label={`Score for ${work.title}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No score</SelectItem>
          {Array.from({ length: 10 }, (_, index) => 10 - index).map((score) => (
            <SelectItem key={score} value={String(score)}>
              {score} / 10
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Aggregate watched count for works whose episodes the provider does not list. */
export function WatchedCountControl({ work }: { work: Work }) {
  const { progress, episodesByParent, updateWork } = useProgressStore();
  const state = workProgress(work, progress, episodesByParent.get(work.id) ?? []);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? String(state.watched);
  const max = state.total ?? undefined;
  const commit = (next: number) => {
    const clamped = Math.max(0, max ? Math.min(max, next) : next);
    setDraft(null);
    if (clamped !== state.watched) updateWork({ itemId: work.id, episodesWatched: clamped });
  };
  const inputId = `count-${work.id}`;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={inputId} className="text-sm text-muted-foreground">
        Watched
      </label>
      <Button variant="outline" size="icon-sm" aria-label="One fewer episode" onClick={() => commit(state.watched - 1)} disabled={state.watched <= 0}>
        <Minus aria-hidden />
      </Button>
      <Input
        id={inputId}
        inputMode="numeric"
        value={value}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
        onBlur={() => draft !== null && commit(Number(draft || 0))}
        onKeyDown={(event) => event.key === "Enter" && commit(Number(value || 0))}
        className="h-8 w-16 text-center tabular-nums"
      />
      <Button variant="outline" size="icon-sm" aria-label="One more episode" onClick={() => commit(state.watched + 1)} disabled={max !== undefined && state.watched >= max}>
        <Plus aria-hidden />
      </Button>
      <span className="text-sm text-muted-foreground">/ {state.total ?? "?"}</span>
    </div>
  );
}

export function MarkAllButton({ work }: { work: Work }) {
  const { progress, episodesByParent, setChecked, updateWork } = useProgressStore();
  const episodes = episodesByParent.get(work.id) ?? [];
  const state = workProgress(work, progress, episodes);
  const allChecked = episodes.length > 0 && state.checkedEpisodes === episodes.length;
  if (episodes.length === 0) {
    return (
      <Button
        size="sm"
        variant={state.complete ? "outline" : "secondary"}
        onClick={() =>
          state.complete ? updateWork({ itemId: work.id, episodesWatched: 0, status: "plan_to_watch" }) : updateWork({ itemId: work.id, status: "completed" })
        }
      >
        <CheckCheck aria-hidden /> {state.complete ? "Mark unwatched" : "Mark completed"}
      </Button>
    );
  }
  return (
    <Button size="sm" variant={allChecked ? "outline" : "secondary"} onClick={() => setChecked(episodes.map((episode) => episode.id), !allChecked)}>
      <CheckCheck aria-hidden /> {allChecked ? "Uncheck all" : "Mark all watched"}
    </Button>
  );
}

/** Imported counts are aggregates; mapping to specific episodes needs consent. */
export function UnmappedNotice({ work }: { work: Work }) {
  const { progress, episodesByParent, mapEpisodes } = useProgressStore();
  const episodes = episodesByParent.get(work.id) ?? [];
  const state = workProgress(work, progress, episodes);
  const [pending, setPending] = useState(false);
  if (!state.unmapped) return null;
  const n = Math.min(state.watched, episodes.length);
  return (
    <div role="note" className="flex flex-wrap items-center gap-3 rounded-md border border-coral/30 bg-coral/5 px-3 py-2 text-sm">
      <Info aria-hidden className="size-4 shrink-0 text-coral" />
      <p className="min-w-0 flex-1">
        {state.watched} episodes are recorded as watched (for example from MyAnimeList), but not which ones. Episode checkboxes are left
        unchanged.
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
            Map to episodes 1–{n}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark episodes 1–{n} as watched?</AlertDialogTitle>
            <AlertDialogDescription>
              This assumes the {state.watched} watched episodes are the first {n} in order. It checks those episodes in {work.title}; other
              episodes are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as a count</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setPending(true);
                try {
                  await mapEpisodes(work.id);
                } finally {
                  setPending(false);
                }
              }}
            >
              Mark episodes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
