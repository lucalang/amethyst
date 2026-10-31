"use client";

import { useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api-client";
import { CODE_STATUS, CODE_STATUSES, codeStatus, type AdminCode, type AdminSnapshot, type CodeStatus } from "@/lib/vault-admin";
import { tabletsPerPage } from "./admin-layout";
import { describeRewards } from "./admin-rewards";
import { Panel } from "./admin-stage";
import { ConfirmAction, countdown, formatWhen, NavLink, number, PanelHead, plural, StatusBadge, timeAgo, useNow } from "./admin-ui";

const SORTS: Record<string, { label: string; compare: (a: AdminCode, b: AdminCode) => number }> = {
  newest: { label: "Newest first", compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
  oldest: { label: "Oldest first", compare: (a, b) => a.createdAt.localeCompare(b.createdAt) },
  redeemed: { label: "Most redeemed", compare: (a, b) => b.redemptionCount - a.redemptionCount },
  expiring: {
    label: "Expiring soonest",
    compare: (a, b) => (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity),
  },
  label: { label: "Label A–Z", compare: (a, b) => a.label.localeCompare(b.label) },
};

const subscribeSize = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};
const usePageSize = () => useSyncExternalStore(subscribeSize, () => tabletsPerPage(window.innerWidth, window.innerHeight), () => 8);

/** When a code opens or closes, relative to now. */
function timing(code: AdminCode, status: CodeStatus, now: number) {
  if (status === "scheduled" && code.startsAt) return `Starts in ${countdown(Date.parse(code.startsAt) - now)}`;
  if (status === "expired" && code.expiresAt) return `Expired ${formatWhen(code.expiresAt)}`;
  if (status === "disabled" && code.disabledAt) return `Disabled ${timeAgo(code.disabledAt, now)}`;
  if (code.expiresAt) return `Expires in ${countdown(Date.parse(code.expiresAt) - now)}`;
  return "Never expires";
}

export function Codes({
  snapshot,
  onNewCode,
  onContinueDraft,
  onDraftDeleted,
}: {
  snapshot: AdminSnapshot;
  onNewCode: () => void;
  onContinueDraft: (id: string) => void;
  onDraftDeleted: () => void;
}) {
  const now = useNow(snapshot.now);
  const pageSize = usePageSize();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CodeStatus | "all">("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [draftError, setDraftError] = useState<string | null>(null);

  const withStatus = snapshot.codes.map((code) => ({ code, status: codeStatus(code, now) }));
  const counts = Object.fromEntries(CODE_STATUSES.map((status) => [status, withStatus.filter((item) => item.status === status).length])) as Record<CodeStatus, number>;
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = withStatus
    .filter(({ code, status }) => (filter === "all" || status === filter) && terms.every((term) => `${code.label} ${describeRewards(code)} ${code.createdByName ?? ""}`.toLowerCase().includes(term)))
    .sort((a, b) => SORTS[sort].compare(a.code, b.code));
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = matches.slice(current * pageSize, (current + 1) * pageSize);
  const reset = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(0);
  };

  const deleteDraft = async (id: string) => {
    setDraftError(null);
    try {
      await apiFetch(`/api/admin/vault/drafts/${id}`, { method: "DELETE" });
      onDraftDeleted();
    } catch {
      setDraftError("The draft couldn’t be deleted. Try again.");
    }
  };

  return (
    <>
      <Panel station="codes" slot="toolbar" label="Find codes">
        <div className="cs-panel-inner cs-toolbar">
          <PanelHead kicker={`${plural(snapshot.codes.length, "code")} published`} title="Codes">
            <button type="button" className="cs-button cs-button-primary" onClick={onNewCode}>
              Forge a new code
            </button>
          </PanelHead>
          <div className="cs-toolbar-row">
            <label htmlFor="cs-code-search" className="sr-only">
              Search codes
            </label>
            <input id="cs-code-search" type="search" className="cs-input" placeholder="Search by label, reward or creator" value={query} onChange={(event) => reset(setQuery)(event.target.value)} />
            <label htmlFor="cs-code-sort" className="sr-only">
              Sort
            </label>
            <select id="cs-code-sort" className="cs-input cs-select" value={sort} onChange={(event) => reset(setSort)(event.target.value)}>
              {Object.entries(SORTS).map(([id, item]) => (
                <option key={id} value={id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="cs-chips" role="group" aria-label="Status">
            <button type="button" className="cs-chip" aria-pressed={filter === "all"} onClick={() => reset(setFilter)("all")}>
              All <span className="cs-chip-count">{snapshot.codes.length}</span>
            </button>
            {CODE_STATUSES.map((status) => (
              <button key={status} type="button" className="cs-chip" data-status={status} aria-pressed={filter === status} onClick={() => reset(setFilter)(status)} title={CODE_STATUS[status].hint}>
                {CODE_STATUS[status].label} <span className="cs-chip-count">{counts[status]}</span>
              </button>
            ))}
          </div>
          <div className="cs-pager">
            <p className="cs-hint" aria-live="polite">
              {matches.length ? `${plural(matches.length, "code")} · page ${current + 1} of ${pages}` : "No codes match."}
            </p>
            {pages > 1 ? (
              <div className="cs-row">
                <button type="button" className="cs-button cs-button-small" disabled={current === 0} onClick={() => setPage(current - 1)}>
                  Previous
                </button>
                <button type="button" className="cs-button cs-button-small" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      {shown.map(({ code, status }, index) => (
        <Panel key={code.id} station="codes" slot="grid" order={index} kind="tablet" tone={status} label={code.label}>
          <NavLink href={`/admin/codes/${code.id}`} className="cs-tablet" data-status={status} data-card>
            <span className="cs-tablet-face">
              <span className="cs-tablet-top">
                <StatusBadge status={status} />
                <span className="cs-tablet-format">{code.format === "phrase" ? "Phrase" : "Code"}</span>
              </span>
              <span className="cs-tablet-title">{code.label}</span>
              <span className="cs-tablet-rewards">{describeRewards(code)}</span>
              <span className="cs-tablet-meter" aria-hidden>
                <span style={{ width: code.maxRedemptions ? `${Math.min(100, (code.redemptionCount / code.maxRedemptions) * 100)}%` : "0%" }} />
              </span>
            </span>
            <span className="cs-tablet-more">
              <span className="cs-tablet-stat">
                <span className="cs-kicker">Redeemed</span>
                <span className="tabular-nums">
                  {number(code.redemptionCount)} / {code.maxRedemptions === null ? "∞" : number(code.maxRedemptions)}
                </span>
              </span>
              <span className="cs-tablet-stat">
                <span className="cs-kicker">{code.audience === "allowlist" ? `${plural(code.allowlistCount, "account")} listed` : "Everyone"}</span>
                <span className="tabular-nums">{timing(code, status, now)}</span>
              </span>
            </span>
          </NavLink>
        </Panel>
      ))}
      {!shown.length ? (
        <Panel station="codes" slot="grid" order={0} label="No codes">
          <div className="cs-panel-inner cs-empty-panel">
            <p className="cs-title">{snapshot.codes.length ? "Nothing matches" : "No codes yet"}</p>
            <p className="cs-hint">{snapshot.codes.length ? "Try another search or status." : "The Forge is where codes are made."}</p>
            {snapshot.codes.length ? null : (
              <button type="button" className="cs-button cs-button-primary" onClick={onNewCode}>
                Open the Forge
              </button>
            )}
          </div>
        </Panel>
      ) : null}

      <Panel station="codes" slot="drafts" label="Drafts">
        <div className="cs-panel-inner">
          <PanelHead kicker="Saved automatically" title="Drafts" />
          {draftError ? (
            <p className="cs-error" role="alert">
              {draftError}
            </p>
          ) : null}
          {snapshot.drafts.length ? (
            <ul className="cs-list">
              {snapshot.drafts.map((draft) => (
                <li key={draft.id} className="cs-list-row cs-list-static">
                  <span className="cs-list-main">
                    <span className="cs-list-title">{draft.label || "Untitled draft"}</span>
                    <span className="cs-option-meta">
                      {timeAgo(draft.updatedAt, now)}
                      {draft.updatedByName ? ` · ${draft.updatedByName}` : ""}
                    </span>
                  </span>
                  <span className="cs-row">
                    <button type="button" className="cs-button cs-button-small" onClick={() => onContinueDraft(draft.id)}>
                      Continue
                    </button>
                    <ConfirmAction
                      trigger={
                        <button type="button" className="cs-button cs-button-small cs-button-quiet-danger">
                          Delete
                        </button>
                      }
                      title="Delete this draft?"
                      description={`“${draft.label || "Untitled draft"}” and its choices will be gone. Published codes are not affected.`}
                      confirm="Delete draft"
                      danger
                      onConfirm={() => void deleteDraft(draft.id)}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cs-empty">No drafts. The Forge saves one as soon as you start.</p>
          )}
        </div>
      </Panel>
    </>
  );
}
