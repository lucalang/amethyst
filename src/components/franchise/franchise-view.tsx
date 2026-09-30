"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Film, MoreHorizontal, Plus, RefreshCw, Sparkles, Trash2, Tv, Users } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/media/empty-state";
import { MarkdownEditor } from "@/components/media/markdown-editor";
import { MediaImage } from "@/components/media/media-image";
import { ProgressMeter } from "@/components/media/progress-meter";
import { apiFetch } from "@/lib/api-client";
import type { FranchiseData } from "@/lib/data/franchise";
import { franchiseSummary, sortWorks, type Work } from "@/lib/progress/derive";
import { pluralize } from "@/lib/format";
import { ProgressProvider, useProgressStore } from "./progress-store";
import { WorkPanel, WorkRow } from "./work-panel";

export type FranchiseTab = "arcs" | "movies" | "specials" | "characters";

export function FranchiseView({ data, initialTab, imageHosts }: { data: FranchiseData; initialTab: FranchiseTab; imageHosts: string[] }) {
  return (
    <ProgressProvider
      queryKey={["progress", data.entry.id]}
      refreshUrl={`/api/entries/${data.entry.id}/progress`}
      initialRows={data.progress}
      works={data.works}
      episodes={data.episodes}
    >
      <FranchiseLayout data={data} initialTab={initialTab} imageHosts={imageHosts} />
    </ProgressProvider>
  );
}

function FranchiseLayout({ data, initialTab, imageHosts }: { data: FranchiseData; initialTab: FranchiseTab; imageHosts: string[] }) {
  const { progress, episodesByParent } = useProgressStore();
  const [tab, setTab] = useState<FranchiseTab>(initialTab);
  const works = useMemo(() => sortWorks(data.works), [data.works]);
  const main = works.filter((work) => work.section === "main");
  const movies = works.filter((work) => work.section === "movie");
  const specials = works.filter((work) => work.section === "ova_special" || work.section === "related");
  const summary = franchiseSummary(works, progress, episodesByParent);
  const { entry } = data;
  const rootMalId = (entry.metadata as { root_mal_id?: number }).root_mal_id;
  const years = works.map((work) => work.year).filter((year): year is number => typeof year === "number");
  const yearLabel = years.length ? (Math.min(...years) === Math.max(...years) ? `${Math.min(...years)}` : `${Math.min(...years)}–${Math.max(...years)}`) : null;

  function selectTab(value: string) {
    setTab(value as FranchiseTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }

  return (
    <div>
      <FranchiseBanner coverUrl={entry.banner_url ?? entry.cover_url} />
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="relative -mt-24 flex flex-col gap-5 md:-mt-32 md:flex-row md:items-end">
          <div className="relative aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary shadow-2xl md:w-44">
            <MediaImage src={entry.cover_url} alt={`${entry.title} poster`} sizes="(min-width: 768px) 176px, 128px" priority fallbackLabel={entry.title} />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-xs font-medium tracking-wide text-jade uppercase">Franchise</p>
            <h1 className="mt-1 text-2xl leading-tight font-semibold md:text-3xl">{entry.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[yearLabel, `${works.length} ${pluralize(works.length, "work")}`, data.importStatus === "running" ? "Import in progress" : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-4 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryStat icon={Tv} label="Episodes" done={summary.episodes.watched} total={summary.episodes.unknownTotals > 0 ? null : summary.episodes.knownTotal} note={summary.episodes.unknownTotals > 0 ? `${summary.episodes.knownTotal}+ known, ${summary.episodes.unknownTotals} unknown` : undefined} />
              <SummaryStat icon={Film} label="Movies" done={summary.movies.done} total={summary.movies.total} text={`${summary.movies.done}/${summary.movies.total} movies watched`} />
              <SummaryStat icon={Sparkles} label="OVAs & specials" done={summary.specials.done} total={summary.specials.total} text={`${summary.specials.done}/${summary.specials.total} watched`} />
            </div>
          </div>
          <FranchiseActions entryId={entry.id} rootMalId={rootMalId} title={entry.title} />
        </div>

        {data.warnings.length > 0 || data.coverage ? <CoveragePanel data={data} /> : null}

        <Tabs value={tab} onValueChange={selectTab} className="mt-8">
          <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="arcs">Arcs</TabsTrigger>
            <TabsTrigger value="movies">
              Movies <span className="text-muted-foreground tabular-nums">{movies.length}</span>
            </TabsTrigger>
            <TabsTrigger value="specials">
              OVAs &amp; Specials <span className="text-muted-foreground tabular-nums">{specials.length}</span>
            </TabsTrigger>
            <TabsTrigger value="characters">
              Characters <span className="text-muted-foreground tabular-nums">{data.characters.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="arcs" className="mt-6 space-y-4">
            {main.length === 0 ? (
              <EmptyState icon={Tv} title="No main series" description="This franchise has no TV or web series. Movies and specials are in their own tabs." />
            ) : (
              main.map((work) => (
                <WorkPanel key={work.id} entryId={entry.id} work={work} arcs={data.arcs.filter((arc) => arc.seriesItemId === work.id)} />
              ))
            )}
          </TabsContent>

          <TabsContent value="movies" className="mt-6">
            <WorkList works={movies} summary={`${summary.movies.done}/${summary.movies.total} movies watched`} emptyTitle="No movies" />
          </TabsContent>

          <TabsContent value="specials" className="mt-6">
            <WorkList works={specials} summary={`${summary.specials.done}/${summary.specials.total} OVAs & specials watched`} emptyTitle="No OVAs or specials" />
          </TabsContent>

          <TabsContent value="characters" className="mt-6">
            <CharacterGrid characters={data.characters} />
          </TabsContent>
        </Tabs>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section aria-labelledby="notes-heading" className="rounded-lg border border-border bg-card p-4">
            <h2 id="notes-heading" className="mb-3 text-sm font-semibold">
              Private notes
            </h2>
            <EntryNotes entryId={entry.id} notes={entry.notes} version={entry.version} imageHosts={imageHosts} />
          </section>
          <RelatedCandidates entryId={entry.id} candidates={data.candidates} />
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Metadata, artwork and characters from{" "}
          <a href={rootMalId ? `https://myanimelist.net/anime/${rootMalId}` : "https://myanimelist.net"} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            MyAnimeList
          </a>{" "}
          via Jikan. Provider relations can be incomplete.
        </p>
      </div>
    </div>
  );
}

function FranchiseBanner({ coverUrl }: { coverUrl: string | null }) {
  return (
    <div aria-hidden className="relative h-52 overflow-hidden md:h-72">
      {coverUrl ? <MediaImage src={coverUrl} alt="" sizes="100vw" className="scale-110 opacity-40 blur-2xl" /> : null}
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/60 to-background" />
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  done,
  total,
  text,
  note,
}: {
  icon: typeof Tv;
  label: string;
  done: number;
  total: number | null;
  text?: string;
  note?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/80 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden className="size-3.5" /> {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {total === 0 ? "—" : `${done}/${total ?? "?"}`}
      </p>
      {total === 0 ? <div aria-hidden className="mt-2 h-1" /> : <ProgressMeter done={done} total={total} compact className="mt-2" />}
      <p className="mt-1 text-xs text-muted-foreground">
        {total === 0 ? "None in this franchise" : (note ?? text ?? (total === null ? "Total unknown" : `${label} watched`))}
      </p>
    </div>
  );
}

function WorkList({ works, summary, emptyTitle }: { works: Work[]; summary: string; emptyTitle: string }) {
  if (works.length === 0) {
    return <EmptyState icon={Film} title={emptyTitle} description="Nothing in this category was found in provider relations. Add missing works manually." />;
  }
  return (
    <div>
      <p className="mb-3 text-sm font-medium" aria-live="polite">
        {summary}
      </p>
      <ul className="grid gap-2 md:grid-cols-2">
        {works.map((work) => (
          <WorkRow key={work.id} work={work} />
        ))}
      </ul>
    </div>
  );
}

function CharacterGrid({ characters }: { characters: FranchiseData["characters"] }) {
  if (characters.length === 0) {
    return <EmptyState icon={Users} title="No characters listed" description="The provider has no character list for the main works of this franchise." />;
  }
  return (
    <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {characters.map((character) => (
        <li key={character.id} className="min-w-0">
          <div className="relative aspect-square overflow-hidden rounded-md bg-secondary">
            <MediaImage src={character.imageUrl} alt="" sizes="(min-width: 1024px) 128px, 30vw" fallbackLabel={character.name} />
          </div>
          <p className="mt-1.5 truncate text-sm font-medium" title={character.name}>
            {character.name}
          </p>
          {character.role ? <p className="text-xs text-muted-foreground">{character.role}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function CoveragePanel({ data }: { data: FranchiseData }) {
  const coverage = data.coverage as { works?: number; episodes?: number; truncated?: boolean } | null;
  return (
    <details className="mt-6 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        <AlertTriangle aria-hidden className="size-4 text-coral" />
        <span className="font-medium">Import coverage</span>
        <span className="text-muted-foreground">
          {coverage?.works ?? data.works.length} works · {coverage?.episodes ?? data.episodes.length} listed episodes · {data.warnings.length}{" "}
          {pluralize(data.warnings.length, "note")}
          {coverage?.truncated ? " · traversal truncated" : ""}
        </span>
      </summary>
      <p className="mt-3 text-muted-foreground">
        Provider relations and episode lists can be incomplete, and arc boundaries are not provided. Nothing missing was invented; add works
        or curated arcs manually.
      </p>
      {data.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1 pl-4 text-muted-foreground">
          {data.warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`} className="list-disc">
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

function EntryNotes({ entryId, notes, version, imageHosts }: { entryId: string; notes: string; version: number; imageHosts: string[] }) {
  const [state, setState] = useState({ notes, version });
  return (
    <MarkdownEditor
      label="Notes"
      value={state.notes}
      imageHosts={imageHosts}
      emptyText="No notes yet. Notes stay private and are never synced."
      onSave={async (value) => {
        const { entry } = await apiFetch<{ entry: { notes: string; version: number } }>(`/api/entries/${entryId}`, {
          method: "PATCH",
          json: { notes: value, expectedVersion: state.version },
        });
        setState({ notes: entry.notes, version: entry.version });
        toast.success("Notes saved.");
      }}
    />
  );
}

function RelatedCandidates({ entryId, candidates }: { entryId: string; candidates: FranchiseData["candidates"] }) {
  const router = useRouter();
  const [added, setAdded] = useState<Set<number>>(new Set());
  async function add(candidate: FranchiseData["candidates"][number]) {
    try {
      await apiFetch("/api/imports", { method: "POST", json: { malId: candidate.malId, traverse: false, entryId, title: candidate.name } });
      setAdded(new Set([...added, candidate.malId]));
      toast.success(`${candidate.name} is being added.`, { action: { label: "View imports", onClick: () => router.push("/import") } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add.");
    }
  }
  return (
    <section aria-labelledby="related-heading" className="rounded-lg border border-border bg-card p-4">
      <h2 id="related-heading" className="text-sm font-semibold">
        Linked candidates &amp; crossovers
      </h2>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">
        Related entries that were not imported automatically (crossovers, spin-offs, alternate versions). Add the ones that belong here.
      </p>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">None reported by the provider.</p>
      ) : (
        <ul className="divide-y divide-border">
          {candidates.map((candidate) => (
            <li key={candidate.malId} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{candidate.name}</p>
                <p className="text-xs text-muted-foreground">
                  {candidate.relation}
                  {candidate.reason === "not_trackable" ? " · not a trackable work" : candidate.reason === "limit" ? " · beyond import limit" : ""}
                </p>
              </div>
              <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${candidate.name} on MyAnimeList`}>
                <a href={`https://myanimelist.net/anime/${candidate.malId}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden />
                </a>
              </Button>
              {candidate.reason !== "not_trackable" ? (
                <Button size="sm" variant="outline" disabled={added.has(candidate.malId)} onClick={() => add(candidate)}>
                  <Plus aria-hidden /> {added.has(candidate.malId) ? "Queued" : "Add"}
                </Button>
              ) : (
                <Badge variant="outline">Skipped</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FranchiseActions({ entryId, rootMalId, title }: { entryId: string; rootMalId?: number; title: string }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function refresh() {
    if (!rootMalId) return;
    try {
      await apiFetch("/api/imports", { method: "POST", json: { malId: rootMalId, traverse: true, entryId, title } });
      toast.success("Refreshing from the provider in the background.", { action: { label: "View imports", onClick: () => router.push("/import") } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start refresh.");
    }
  }

  async function remove() {
    try {
      await apiFetch(`/api/entries/${entryId}`, { method: "DELETE" });
      toast.success("Franchise removed from your library.");
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete.");
    }
  }

  return (
    <div className="flex gap-2 pb-1">
      <Button asChild variant="secondary" size="sm">
        <Link href={`/import?into=${entryId}`}>
          <Plus aria-hidden /> Add work
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="More franchise actions">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {rootMalId ? (
            <DropdownMenuItem onSelect={refresh}>
              <RefreshCw aria-hidden /> Refresh from provider
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden /> Delete franchise
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {title}?</AlertDialogTitle>
            <AlertDialogDescription>
              The franchise page, its arcs and notes are removed. Nothing is deleted from MyAnimeList.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
