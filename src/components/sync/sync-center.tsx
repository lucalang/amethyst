"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, Import, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api-client";
import type { SyncData } from "@/lib/data/sync";
import { STATUS_LABELS, formatRelative } from "@/lib/format";
import type { SyncState } from "@/lib/sync/reconcile";
import { cn } from "@/lib/utils";
import { connectionLabel } from "./mal-connection-card";

function describe(state: SyncState | null) {
  if (!state) return "Not started";
  return `${STATUS_LABELS[state.status] ?? state.status} · ${state.watched} ep${state.score ? ` · ${state.score}/10` : ""}`;
}

export function SyncCenter({ data, configured }: { data: SyncData; configured: boolean }) {
  const router = useRouter();
  const account = data.account;
  const connected = account && account.status !== "disconnected";
  const pulling = data.lastPull?.status === "queued" || data.lastPull?.status === "running";
  const pendingPush = (data.counts.pending ?? 0) + (data.counts.in_flight ?? 0);

  // Poll while background work is in progress so the page reflects the worker.
  useEffect(() => {
    if (!pulling && !pendingPush) return;
    const timer = setInterval(() => router.refresh(), 4_000);
    return () => clearInterval(timer);
  }, [pulling, pendingPush, router]);

  if (!configured) {
    return <p className="text-sm text-muted-foreground">MyAnimeList is not configured on this server (MAL_CLIENT_ID / MAL_REDIRECT_URI).</p>;
  }

  if (!connected) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Connect MyAnimeList</CardTitle>
          <CardDescription>
            Uses MyAnimeList&apos;s official OAuth. After connecting, your full list is pulled and shown here for review before anything is
            synchronized.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/api/mal/connect">
              <ExternalLink aria-hidden /> Connect MyAnimeList
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <StatusCard data={data} pulling={pulling} />
      {account.initial_sync === "pending" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> Pulling your complete MyAnimeList list…
        </p>
      ) : null}
      {account.initial_sync === "ready" ? <InitialPreview data={data} /> : null}
      {account.initial_sync === "approved" ? (
        <>
          <Conflicts data={data} />
          <Activity data={data} />
          <Unmatched data={data} />
        </>
      ) : null}
    </div>
  );
}

function StatusCard({ data, pulling }: { data: SyncData; pulling: boolean }) {
  const router = useRouter();
  const account = data.account!;
  const status = connectionLabel(account);
  const [outbound, setOutbound] = useState(account.outbound_enabled);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await apiFetch("/api/sync/refresh", { method: "POST" });
      toast.success("Refresh queued.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh.");
    } finally {
      setRefreshing(false);
    }
  }

  async function toggleOutbound(value: boolean) {
    setOutbound(value);
    try {
      await apiFetch("/api/sync/settings", { method: "POST", json: { outboundEnabled: value } });
      toast.success(value ? "Local changes will be written to MyAnimeList." : "Outbound writes paused. Changes stay local.");
    } catch (error) {
      setOutbound(!value);
      toast.error(error instanceof Error ? error.message : "Could not update.");
    }
  }

  const counts = data.counts;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{account.mal_username ?? "MyAnimeList"}</CardTitle>
          <Badge variant="outline" className={cn(status.tone === "jade" && "border-jade/40 text-jade", status.tone === "coral" && "border-coral/40 text-coral")}>
            {status.label}
          </Badge>
        </div>
        <CardDescription>
          Last pull {account.last_pull_at ? formatRelative(account.last_pull_at) : "not yet"} · last push{" "}
          {account.last_push_at ? formatRelative(account.last_push_at) : "not yet"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {account.status === "reconnect_required" ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-coral/40 bg-coral/5 px-3 py-2 text-sm">
            <AlertTriangle aria-hidden className="size-4 text-coral" />
            <span className="flex-1">MyAnimeList access expired. Local progress keeps working; queued changes are pushed after you reconnect.</span>
            <Button asChild size="sm">
              <a href="/api/mal/connect">Reconnect</a>
            </Button>
          </div>
        ) : null}
        {data.lastPull?.status === "failed" && data.lastPull.last_error ? (
          <p role="alert" className="text-sm text-coral">
            Last pull failed: {data.lastPull.last_error}
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Pending", (counts.pending ?? 0) + (counts.in_flight ?? 0)],
            ["Synced", counts.synced ?? 0],
            ["Failed", counts.failed ?? 0],
            ["Conflicts", data.conflicts.length],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-border p-3">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="outline" onClick={refresh} disabled={refreshing || pulling || account.status !== "connected"}>
            {refreshing || pulling ? <Loader2 aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
            {pulling ? "Pulling…" : "Refresh from MyAnimeList"}
          </Button>
          {account.initial_sync === "approved" ? (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={outbound} onCheckedChange={toggleOutbound} aria-describedby="outbound-help" />
              Write local changes to MyAnimeList
            </label>
          ) : null}
        </div>
        <p id="outbound-help" className="text-xs text-muted-foreground">
          Outbound writes are debounced and serialized per title. If a title changed on MyAnimeList since the last sync, you are asked to
          resolve it instead of overwriting.
        </p>
      </CardContent>
    </Card>
  );
}

function InitialPreview({ data }: { data: SyncData }) {
  const router = useRouter();
  const differs = data.preview.filter((row) => row.kind === "differs");
  const remoteOnly = data.preview.filter((row) => row.kind === "remote_only");
  const same = data.preview.filter((row) => row.kind === "same");
  const unmatched = data.preview.filter((row) => row.kind === "unmatched");
  const [choices, setChoices] = useState<Record<number, "remote" | "local">>({});
  const [applyUntouched, setApplyUntouched] = useState(true);
  const [enableOutbound, setEnableOutbound] = useState(false);
  const [pending, setPending] = useState(false);
  const unresolved = differs.filter((row) => !choices[row.malId]).length;

  async function approve() {
    setPending(true);
    try {
      const applyRemote = [
        ...differs.filter((row) => choices[row.malId] === "remote").map((row) => row.malId),
        ...(applyUntouched ? remoteOnly.map((row) => row.malId) : []),
      ];
      await apiFetch("/api/sync/approve", { method: "POST", json: { applyRemote, enableOutbound } });
      toast.success("Initial sync approved.");
      router.replace("/sync");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="preview-heading" className="space-y-6">
      <div>
        <h2 id="preview-heading" className="text-lg font-semibold">
          Review the initial sync
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.preview.length} entries on your MyAnimeList list: {differs.length} differ, {remoteOnly.length} only tracked on MAL, {same.length}{" "}
          already match, {unmatched.length} are not in this archive. MAL stores watched counts, not which episodes; counts are applied as
          totals and never ticked off as specific episodes without your confirmation.
        </p>
      </div>

      {differs.length > 0 ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Needs a decision ({unresolved} left)</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setChoices(Object.fromEntries(differs.map((row) => [row.malId, "remote"])))}>
                Use MyAnimeList for all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setChoices(Object.fromEntries(differs.map((row) => [row.malId, "local"])))}>
                Keep archive for all
              </Button>
            </div>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {differs.map((row) => (
              <li key={row.malId} className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Archive: {describe(row.local)} · MyAnimeList: {describe(row.remote)}
                  </p>
                </div>
                <fieldset className="flex gap-2">
                  <legend className="sr-only">Which value should win for {row.title}?</legend>
                  {(["remote", "local"] as const).map((choice) => (
                    <label
                      key={choice}
                      className={cn(
                        "flex min-h-9 cursor-pointer items-center rounded-md border border-border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        choices[row.malId] === choice && "border-jade bg-jade/10",
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        name={`choice-${row.malId}`}
                        checked={choices[row.malId] === choice}
                        onChange={() => setChoices({ ...choices, [row.malId]: choice })}
                      />
                      {choice === "remote" ? "Use MyAnimeList" : "Keep archive"}
                    </label>
                  ))}
                </fieldset>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-3 rounded-lg border border-border p-4">
        {remoteOnly.length > 0 ? (
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={applyUntouched} onCheckedChange={(value) => setApplyUntouched(value === true)} className="mt-0.5" />
            <span>
              Apply MyAnimeList progress to {remoteOnly.length} archive {remoteOnly.length === 1 ? "title" : "titles"} you have not started here
              (as watched counts).
            </span>
          </label>
        ) : null}
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={enableOutbound} onCheckedChange={(value) => setEnableOutbound(value === true)} className="mt-0.5" />
          <span>
            Also write future archive changes to MyAnimeList{differs.some((row) => choices[row.malId] === "local") ? ", starting with the titles where you chose “Keep archive”" : ""}.
            You can turn this off any time.
          </span>
        </label>
        <Button onClick={approve} disabled={pending || unresolved > 0}>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <CheckCircle2 aria-hidden />}
          Approve sync
        </Button>
        {unresolved > 0 ? <p className="text-xs text-muted-foreground">Choose a side for every differing title first.</p> : null}
      </div>

      <Unmatched data={data} />
    </section>
  );
}

function Conflicts({ data }: { data: SyncData }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (data.conflicts.length === 0) return null;

  async function resolve(id: string, choice: "local" | "remote") {
    setBusy(id);
    try {
      await apiFetch(`/api/sync/conflicts/${id}`, { method: "POST", json: { choice } });
      toast.success(choice === "local" ? "Archive value will be written to MyAnimeList." : "MyAnimeList value applied locally.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resolve.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="conflicts-heading">
      <h2 id="conflicts-heading" className="mb-1 text-lg font-semibold">
        Conflicts
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">Both sides changed since the last sync. Nothing is overwritten until you choose.</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {data.conflicts.map((conflict) => (
          <li key={conflict.id} className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{conflict.title}</p>
              <p className="text-xs text-muted-foreground">
                Archive: {describe(conflict.local)} · MyAnimeList: {conflict.remote.removed ? "Removed from list" : describe(conflict.remote)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy === conflict.id} onClick={() => resolve(conflict.id, "remote")}>
                Use MyAnimeList
              </Button>
              <Button size="sm" disabled={busy === conflict.id} onClick={() => resolve(conflict.id, "local")}>
                Keep archive
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const OUTBOX_LABEL: Record<string, string> = {
  pending: "Pending",
  in_flight: "Sending",
  synced: "Synced",
  failed: "Failed",
  conflict: "Conflict",
  superseded: "Superseded",
};

function Activity({ data }: { data: SyncData }) {
  if (data.outbox.length === 0) return null;
  return (
    <section aria-labelledby="activity-heading">
      <h2 id="activity-heading" className="mb-3 text-lg font-semibold">
        Recent outbound changes
      </h2>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {data.outbox.slice(0, 20).map((row) => (
          <li key={row.id} className="flex items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground">
                {describe(row.desired)} · {formatRelative(row.updatedAt)}
                {row.lastError ? ` · ${row.lastError}` : ""}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn(row.state === "synced" && "border-jade/40 text-jade", (row.state === "failed" || row.state === "conflict") && "border-coral/40 text-coral")}
            >
              {OUTBOX_LABEL[row.state] ?? row.state}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Unmatched({ data }: { data: SyncData }) {
  const unmatched = useMemo(() => data.preview.filter((row) => row.kind === "unmatched"), [data.preview]);
  const [limit, setLimit] = useState(20);
  if (unmatched.length === 0) return null;
  return (
    <section aria-labelledby="unmatched-heading">
      <h2 id="unmatched-heading" className="mb-1 text-lg font-semibold">
        On MyAnimeList, not in this archive ({unmatched.length})
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">Import a franchise to track it here; its MAL progress is linked automatically after the next pull.</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {unmatched.slice(0, limit).map((row) => (
          <li key={row.malId} className="flex items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground">{describe(row.remote)}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/import?q=${row.malId}`}>
                <Import aria-hidden /> Import
              </Link>
            </Button>
          </li>
        ))}
      </ul>
      {unmatched.length > limit ? (
        <Button variant="ghost" className="mt-2" onClick={() => setLimit(limit + 50)}>
          Show more <ArrowRight aria-hidden />
        </Button>
      ) : null}
    </section>
  );
}
