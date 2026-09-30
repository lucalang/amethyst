"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import type { Arc } from "@/lib/data/franchise";
import { groupState, type Episode, type Work } from "@/lib/progress/derive";
import { cn } from "@/lib/utils";
import { EpisodeRows } from "./episode-checklist";
import { useProgressStore } from "./progress-store";

export function ArcList({ arcs, episodes }: { arcs: Arc[]; episodes: Episode[] }) {
  const { progress, setChecked } = useProgressStore();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const byId = new Map(episodes.map((episode) => [episode.id, episode]));

  async function remove(arc: Arc) {
    if (!window.confirm(`Delete the arc "${arc.title}"? Episode progress is kept.`)) return;
    try {
      await apiFetch(`/api/arcs/${arc.id}`, { method: "DELETE" });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete arc.");
    }
  }

  return (
    <ul className="space-y-1">
      {arcs.map((arc) => {
        const state = groupState(arc.memberIds, progress);
        const members = arc.memberIds
          .map((id) => byId.get(id))
          .filter((episode): episode is Episode => Boolean(episode))
          .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
        const isOpen = open === arc.id;
        const panelId = `arc-${arc.id}`;
        return (
          <li key={arc.id} className="rounded-md border border-border">
            <div className="flex min-h-11 items-center gap-2 px-2">
              <Checkbox
                aria-label={`${state.state === "checked" ? "Uncheck" : "Check"} every episode in ${arc.title}`}
                checked={state.state === "checked" ? true : state.state === "indeterminate" ? "indeterminate" : false}
                disabled={state.total === 0}
                onCheckedChange={() => setChecked(arc.memberIds, state.state !== "checked")}
                className="size-5 data-[state=indeterminate]:border-jade data-[state=indeterminate]:bg-jade/30"
              />
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : arc.id)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm"
              >
                <ChevronRight aria-hidden className={cn("size-4 shrink-0 transition-transform", isOpen && "rotate-90")} />
                <span className="min-w-0 flex-1 truncate font-medium">{arc.title}</span>
                {arc.startEpisode ? (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    Ep {arc.startEpisode}–{arc.endEpisode}
                  </span>
                ) : null}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {state.checked}/{state.total}
                </span>
              </button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete arc ${arc.title}`} onClick={() => remove(arc)}>
                <Trash2 aria-hidden />
              </Button>
            </div>
            {isOpen ? (
              <div id={panelId} className="border-t border-border p-1">
                {members.length > 0 ? (
                  <EpisodeRows episodes={members} />
                ) : (
                  <p className="p-2 text-sm text-muted-foreground">No listed episodes fall in this range.</p>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function CreateArcDialog({ entryId, work, suggestedStart }: { entryId: string; work: Work; suggestedStart: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/entries/${entryId}/arcs`, {
        method: "POST",
        json: {
          seriesItemId: work.id,
          title: String(formData.get("title") ?? ""),
          start: Number(formData.get("start")),
          end: Number(formData.get("end")),
        },
      });
      setOpen(false);
      toast.success("Arc added.");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create arc.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={`Add arc to ${work.title}`}>
          <Plus aria-hidden /> Add arc
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a curated arc</DialogTitle>
          <DialogDescription>
            Arc boundaries are not provided by MyAnimeList. Define one by episode range in {work.title}.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="arc-title">Arc title</Label>
            <Input id="arc-title" name="title" required maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="arc-start">First episode</Label>
              <Input id="arc-start" name="start" type="number" min={1} defaultValue={suggestedStart} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arc-end">Last episode</Label>
              <Input id="arc-end" name="end" type="number" min={1} defaultValue={suggestedStart} required />
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
              Create arc
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
