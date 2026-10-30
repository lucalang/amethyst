"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";
import { ChevronRight, FilePenLine, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CatalogSearch } from "@/components/catalog/catalog-search";
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
import { ApiError, apiFetch } from "@/lib/api-client";
import { codeStatus, configFrom, STATUS_LABEL, type AdminCode, type AdminDraft, type CodeStatus } from "@/lib/vault-admin";
import { useConsoleLayers } from "./admin-console";
import { adminDialogClass, audienceSummary, codeRewards, ConsoleView, StatusPill, SystemWindow, useNow, When } from "./admin-ui";

const FILTERS: readonly ("all" | CodeStatus)[] = ["all", "active", "scheduled", "expired", "used-up", "disabled"];

export function AdminCodes({ codes, drafts, now: serverNow }: { codes: AdminCode[]; drafts: AdminDraft[]; now: number }) {
  const now = useNow(serverNow);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | CodeStatus>("all");

  const rows = useMemo(() => codes.map((code) => ({ code, status: codeStatus(code, now), rewards: codeRewards(code) })), [codes, now]);
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: rows.length };
    for (const row of rows) result[row.status] = (result[row.status] ?? 0) + 1;
    return result;
  }, [rows]);
  const needle = query.trim().toLowerCase();
  const shown = rows.filter(
    ({ code, status, rewards }) =>
      (filter === "all" || status === filter) &&
      (!needle || [code.label, rewards, code.id, code.createdByName ?? ""].some((text) => text.toLowerCase().includes(needle))),
  );
  const redemptions = codes.reduce((sum, code) => sum + code.redemptionCount, 0);
  useConsoleLayers(2);

  return (
    <ConsoleView
      eyebrow="Admin panel"
      title="Vault codes"
      lede="Build, publish and retire Vault codes. Codes are stored as hashes only, so a published code can’t be shown again."
      actions={
        <Link href="/admin/new" className="ax-btn" data-variant="primary">
          <Plus aria-hidden className="size-4" /> Build a code
        </Link>
      }
      asideLabel="Overview"
      aside={
        <SystemWindow id="ax-status-title" title="Status">
          <dl className="ax-stats">
            <div>
              <dt>Active</dt>
              <dd>{counts.active ?? 0}</dd>
            </div>
            <div>
              <dt>Scheduled</dt>
              <dd>{counts.scheduled ?? 0}</dd>
            </div>
            <div>
              <dt>Drafts</dt>
              <dd>{drafts.length}</dd>
            </div>
            <div>
              <dt>Redemptions</dt>
              <dd>{redemptions.toLocaleString("en")}</dd>
            </div>
          </dl>
        </SystemWindow>
      }
    >
      {drafts.length ? <Drafts drafts={drafts} /> : null}

      <SystemWindow id="ax-codes-title" title="Published codes" count={`${shown.length}/${rows.length}`} order={drafts.length ? 2 : 1}>
        <div className="ax-toolbar">
          <div className="ax-chips" role="group" aria-label="Filter by status">
            {FILTERS.map((id) => (
              <button key={id} type="button" className="ax-chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {id === "all" ? "All" : STATUS_LABEL[id]} <span className="ax-chip-count">{counts[id] ?? 0}</span>
              </button>
            ))}
          </div>
          <CatalogSearch value={query} onChange={setQuery} label="Search codes" placeholder="Label, reward, creator…" className="ax-search" />
        </div>
        {shown.length ? (
          <ul className="ax-rows">
            {shown.map(({ code, status, rewards }) => (
              <li key={code.id}>
                <Link href={`/admin/codes/${code.id}`} className="ax-row">
                  <span className="ax-row-status">
                    <StatusPill status={status} />
                  </span>
                  <span className="ax-row-main">
                    <span className="ax-row-title">{code.label}</span>
                    <span className="ax-row-rewards">{rewards}</span>
                    <span className="ax-row-meta">
                      {audienceSummary(code)}
                      {code.startsAt ? (
                        <>
                          {" · starts "}
                          <When iso={code.startsAt} />
                        </>
                      ) : null}
                      {" · "}
                      {code.expiresAt ? (
                        <>
                          expires <When iso={code.expiresAt} />
                        </>
                      ) : (
                        "no expiry"
                      )}
                    </span>
                  </span>
                  <span className="ax-row-usage">
                    <span className="ax-usage-count">
                      {code.redemptionCount.toLocaleString("en")}
                      <span className="ax-muted">{code.maxRedemptions === null ? " used" : ` / ${code.maxRedemptions.toLocaleString("en")}`}</span>
                    </span>
                    {code.maxRedemptions !== null ? (
                      <span aria-hidden className="ax-meter">
                        <span style={{ width: `${Math.min(100, (code.redemptionCount / code.maxRedemptions) * 100)}%` }} />
                      </span>
                    ) : null}
                    <span className="ax-row-date">
                      Published <When iso={code.createdAt} />
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="ax-row-go" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div role="status" className="ax-empty">
            <p>{codes.length ? "No codes match this search or status." : "No codes yet. Build the first one: rewards, rules, review, publish."}</p>
            {codes.length ? (
              <button
                type="button"
                className="ax-link"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear search and filters
              </button>
            ) : null}
          </div>
        )}
      </SystemWindow>
    </ConsoleView>
  );
}

function Drafts({ drafts }: { drafts: AdminDraft[] }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<AdminDraft | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove(event: MouseEvent) {
    event.preventDefault();
    if (!removing) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/vault/drafts/${removing.id}`, { method: "DELETE" });
      setRemoving(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "The draft couldn’t be deleted. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SystemWindow id="ax-drafts-title" title="Drafts" count="Not redeemable" tone="draft" order={1}>
      <ul className="ax-drafts">
        {drafts.map((draft) => {
          const config = configFrom(draft.config);
          return (
            <li key={draft.id} className="ax-draft">
              <FilePenLine aria-hidden className="ax-draft-icon" />
              <span className="min-w-0 flex-1">
                <span className="ax-row-title">{draft.label || "Untitled draft"}</span>
                <span className="ax-row-meta">
                  {codeRewards(config) || "No rewards yet"} · saved <When iso={draft.updatedAt} />
                  {draft.updatedByName ? ` by ${draft.updatedByName}` : ""}
                </span>
              </span>
              <Link href={`/admin/new?draft=${draft.id}`} className="ax-btn" data-size="sm">
                Continue
              </Link>
              <button type="button" className="ax-icon-btn" aria-label={`Delete draft ${draft.label || "Untitled draft"}`} onClick={() => setRemoving(draft)}>
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && !busy && setRemoving(null)}>
        <AlertDialogContent className={adminDialogClass}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>“{removing?.label || "Untitled draft"}” was never published, so no code exists for it. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={remove}>
              {busy ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SystemWindow>
  );
}
