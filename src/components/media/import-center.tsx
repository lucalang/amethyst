"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Import, Loader2, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { parseImportInput } from "@/lib/imports/input";
import { formatRelative } from "@/lib/format";
import { isActiveJob, type JobView } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { MediaImage } from "./media-image";

type CatalogResult = {
  malId: number;
  title: string;
  titleEnglish: string | null;
  type: string | null;
  episodes: number | null;
  year: number | null;
  status: string | null;
  score: number | null;
  imageUrl: string | null;
};

type CreateImport = { malId: number; traverse: boolean; entryId?: string; title?: string };

export function ImportCenter({
  initialJobs,
  initialQuery,
  targetEntryId,
}: {
  initialJobs: JobView[];
  initialQuery: string;
  targetEntryId?: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  const [inputError, setInputError] = useState<string | null>(null);

  const search = useQuery({
    queryKey: ["catalog-search", submitted],
    queryFn: () => apiFetch<{ results: CatalogResult[] }>(`/api/catalog/search?q=${encodeURIComponent(submitted)}`),
    enabled: submitted.trim().length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const jobs = useQuery({
    queryKey: ["import-jobs"],
    queryFn: () => apiFetch<{ jobs: JobView[] }>("/api/imports").then((body) => body.jobs),
    initialData: initialJobs,
    refetchInterval: (query) => ((query.state.data ?? []).some(isActiveJob) ? 2_000 : false),
  });

  const create = useMutation({
    mutationFn: (body: CreateImport) => apiFetch<{ job: JobView; duplicate: boolean }>("/api/imports", { method: "POST", json: body }),
    onSuccess: ({ duplicate }) => {
      toast.success(duplicate ? "That import is already running." : "Import queued. It continues in the background.");
      void queryClient.invalidateQueries({ queryKey: ["import-jobs"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/imports/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["import-jobs"] }),
    onError: (error) => toast.error(error.message),
  });

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseImportInput(draft);
    if (parsed.type === "invalid") {
      setInputError(parsed.reason);
      return;
    }
    setInputError(null);
    setSubmitted(draft.trim());
  }

  const results = search.data?.results ?? [];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-labelledby="search-heading" className="min-w-0">
        <h2 id="search-heading" className="sr-only">
          Find an anime
        </h2>
        {targetEntryId ? (
          <p className="mb-3 rounded-md border border-jade/30 bg-jade/5 px-3 py-2 text-sm">
            Adding a single work to an existing franchise. Relations are not followed.
          </p>
        ) : null}
        <form onSubmit={onSubmit} className="flex gap-2" role="search">
          <label htmlFor="import-query" className="sr-only">
            Title, MyAnimeList ID or URL
          </label>
          <Input
            id="import-query"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. Steins;Gate, 9253, or https://myanimelist.net/anime/9253"
            className="h-10"
            aria-invalid={inputError ? true : undefined}
            aria-describedby={inputError ? "import-query-error" : undefined}
            autoComplete="off"
          />
          <Button type="submit" className="h-10 shrink-0" disabled={search.isFetching}>
            {search.isFetching ? <Loader2 aria-hidden className="animate-spin" /> : <Search aria-hidden />}
            Search
          </Button>
        </form>
        {inputError ? (
          <p id="import-query-error" role="alert" className="mt-2 text-sm text-destructive">
            {inputError}
          </p>
        ) : null}

        <div className="mt-6" aria-live="polite" aria-busy={search.isFetching}>
          {!submitted ? (
            <EmptyState
              icon={Import}
              title="Start with a title"
              description="Pick the exact match from the results. Main series, sequels, movies, OVAs and specials are imported together; crossovers are linked for review."
            />
          ) : search.isPending && search.fetchStatus !== "idle" ? (
            <ul className="space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <li key={index} className="flex gap-3">
                  <Skeleton className="aspect-[2/3] w-14 shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </li>
              ))}
            </ul>
          ) : search.isError ? (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 px-4 py-3 text-sm">
              <span>{search.error.message}</span>
              <Button variant="outline" size="sm" onClick={() => search.refetch()}>
                <RotateCcw aria-hidden /> Retry
              </Button>
            </div>
          ) : results.length === 0 ? (
            <EmptyState icon={Search} title="No matches" description="Try another spelling, the Japanese title, or paste the MyAnimeList URL." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {results.map((result) => (
                <li key={result.malId} className="flex gap-3 p-3">
                  <div className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-md bg-secondary">
                    <MediaImage src={result.imageUrl} alt="" sizes="56px" fallbackLabel={result.title} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{result.title}</p>
                    {result.titleEnglish && result.titleEnglish !== result.title ? (
                      <p className="truncate text-sm text-muted-foreground">{result.titleEnglish}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[result.type ?? "Unknown type", result.episodes ? `${result.episodes} eps` : "episodes unknown", result.year, `MAL #${result.malId}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {targetEntryId ? (
                        <Button
                          size="sm"
                          disabled={create.isPending}
                          onClick={() => create.mutate({ malId: result.malId, traverse: false, entryId: targetEntryId, title: result.title })}
                        >
                          Add to franchise
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            disabled={create.isPending}
                            onClick={() => create.mutate({ malId: result.malId, traverse: true, title: result.title })}
                          >
                            <Import aria-hidden /> Import franchise
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={create.isPending}
                            onClick={() => create.mutate({ malId: result.malId, traverse: false, title: result.title })}
                          >
                            This title only
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {results.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">Search results and artwork from MyAnimeList via Jikan.</p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="jobs-heading" className="min-w-0">
        <h2 id="jobs-heading" className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Imports
        </h2>
        {jobs.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <ul className="space-y-3">
            {jobs.data.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onCancel={() => cancel.mutate(job.id)}
                onRetry={() =>
                  create.mutate({
                    malId: Number(job.input?.mal_id),
                    traverse: job.input?.traverse ?? true,
                    entryId: job.input?.entry_id,
                    title: job.input?.title,
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const STATUS_STYLE: Record<JobView["status"], string> = {
  queued: "border-border text-muted-foreground",
  running: "border-jade/40 text-jade",
  succeeded: "border-jade/40 text-jade",
  failed: "border-coral/40 text-coral",
  cancelled: "border-border text-muted-foreground",
};

function JobCard({ job, onCancel, onRetry }: { job: JobView; onCancel: () => void; onRetry: () => void }) {
  const active = isActiveJob(job);
  const warnings = job.warnings ?? [];
  const entryId = job.result?.entry_id;
  const waiting = job.status === "queued" && job.last_error === "Waiting for provider rate limit";

  return (
    <li className="rounded-lg border border-border bg-card p-3" aria-live={active ? "polite" : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{job.input?.title ?? `MyAnimeList #${job.input?.mal_id ?? "?"}`}</p>
          <p className="text-xs text-muted-foreground">
            {job.input?.traverse === false ? "Single title" : "Franchise"} · {formatRelative(job.created_at)}
          </p>
        </div>
        <Badge variant="outline" className={cn("shrink-0 capitalize", STATUS_STYLE[job.status])}>
          {active ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
          {job.status}
        </Badge>
      </div>

      {active ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {waiting ? `Waiting for the provider rate limit (retrying ${formatRelative(job.run_after)}).` : (job.progress?.message ?? "Queued")}
          {job.progress?.works ? ` · ${job.progress.works} works` : ""}
          {job.progress?.episodes ? ` · ${job.progress.episodes} episodes` : ""}
        </p>
      ) : null}

      {job.status === "failed" && job.last_error ? (
        <p role="alert" className="mt-2 text-xs text-coral">
          {job.last_error}
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <details className="mt-2 text-xs">
          <summary className="flex cursor-pointer items-center gap-1 text-muted-foreground">
            <AlertTriangle aria-hidden className="size-3.5 text-coral" />
            {warnings.length} coverage {warnings.length === 1 ? "note" : "notes"}
          </summary>
          <ul className="mt-2 space-y-1 pl-4 text-muted-foreground">
            {warnings.slice(0, 12).map((warning, index) => (
              <li key={`${warning.code}-${index}`} className="list-disc">
                {warning.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {entryId && job.status === "succeeded" ? (
          <Button asChild size="sm">
            <Link href={`/franchise/${entryId}`}>
              Open <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : null}
        {active ? (
          <Button size="sm" variant="outline" onClick={onCancel}>
            <X aria-hidden /> Cancel
          </Button>
        ) : null}
        {job.status === "failed" || job.status === "cancelled" ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCcw aria-hidden /> Retry
          </Button>
        ) : null}
      </div>
    </li>
  );
}
