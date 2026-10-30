"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { ArrowLeft, Ban, Copy, Loader2 } from "lucide-react";
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
import { ACHIEVEMENT_PREFIX, rewardSummary, type VaultLooks } from "@/components/vault/vault-reveal";
import { ApiError, apiFetch } from "@/lib/api-client";
import { codeStatus, maxPayout, type AdminAccount, type AdminCodeDetail } from "@/lib/vault-admin";
import { AdminHeader, AdminStage, RewardTiles, StatusPill, useNow, When } from "./admin-ui";

const accountName = (account: AdminAccount | null) => (account ? account.name || account.email || "Unnamed account" : "Deleted account");

export function CodeDetail({ code, now: serverNow, looks }: { code: AdminCodeDetail; now: number; looks: VaultLooks }) {
  const router = useRouter();
  const now = useNow(serverNow);
  const status = codeStatus(code, now);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const payout = maxPayout({ ...code, allowlist: code.allowlist.map((account) => account.id) });

  async function disable(event: MouseEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/api/admin/vault/codes/${code.id}`, { method: "PATCH", json: { disabled: true } });
      toast.success("Code disabled. Rewards already granted stay with their owners.");
      setConfirming(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "The code couldn’t be disabled. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminStage>
      <Link href="/admin" className="ax-back">
        <ArrowLeft aria-hidden className="size-4" /> All codes
      </Link>
      <AdminHeader
        eyebrow={`Vault code · ${code.format === "phrase" ? "chosen words" : "random"}`}
        title={code.label}
        lede="Published codes can’t be edited. Disable this one, or clone it into a new code. The code itself was shown once when it was published and can’t be recovered."
        actions={
          <>
            <Link href={`/admin/new?clone=${code.id}`} className="ax-btn">
              <Copy aria-hidden className="size-4" /> Clone
            </Link>
            {code.disabledAt ? null : (
              <button type="button" className="ax-btn" data-variant="danger" onClick={() => setConfirming(true)}>
                <Ban aria-hidden className="size-4" /> Disable
              </button>
            )}
          </>
        }
      />

      <div className="ax-split">
        <section className="ax-panel" aria-labelledby="ax-rewards-title">
          <h2 id="ax-rewards-title" className="ax-section-title">
            Rewards
          </h2>
          <RewardTiles coins={code.coins} items={code.items} achievements={code.achievements} looks={looks} />
          {code.achievements.length ? (
            <p className="ax-hint">Unlocked achievements also grant their own reward once per account. Accounts that already have one keep its original unlock date.</p>
          ) : null}
        </section>

        <section className="ax-panel" aria-labelledby="ax-rules-title">
          <h2 id="ax-rules-title" className="ax-section-title">
            Status and rules
          </h2>
          <dl className="ax-facts">
            <div>
              <dt>Status</dt>
              <dd>
                <StatusPill status={status} />
              </dd>
            </div>
            <div>
              <dt>Who</dt>
              <dd>{code.audience === "allowlist" ? `${code.allowlist.length} listed account${code.allowlist.length === 1 ? "" : "s"}` : "All signed-in accounts"}</dd>
            </div>
            <div>
              <dt>Per account</dt>
              <dd>{code.perAccountLimit === 1 ? "Once" : `Up to ${code.perAccountLimit} times`}</dd>
            </div>
            <div>
              <dt>Used</dt>
              <dd>
                {code.redemptionCount.toLocaleString("en")}
                {code.maxRedemptions === null ? " (no total limit)" : ` of ${code.maxRedemptions.toLocaleString("en")}`}
              </dd>
            </div>
            <div>
              <dt>Starts</dt>
              <dd>
                <When iso={code.startsAt} fallback="When published" />
              </dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>
                <When iso={code.expiresAt} fallback="Never" />
              </dd>
            </div>
            {code.coins > 0 ? (
              <div>
                <dt>Max code coins</dt>
                <dd>
                  {payout.perAccount.toLocaleString("en")} per account · {payout.total === null ? "no total cap" : `${payout.total.toLocaleString("en")} in total`}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Published</dt>
              <dd>
                <When iso={code.createdAt} />
                {code.createdByName ? ` by ${code.createdByName}` : code.createdBy ? "" : " (command line)"}
              </dd>
            </div>
            {code.disabledAt ? (
              <div>
                <dt>Disabled</dt>
                <dd>
                  <When iso={code.disabledAt} />
                </dd>
              </div>
            ) : null}
          </dl>
          {code.audience === "allowlist" ? (
            <ul className="ax-accounts" aria-label="Allowlisted accounts">
              {code.allowlist.map((account) => (
                <li key={account.id}>
                  <span className="ax-account-name">{accountName(account)}</span>
                  {account.email ? <span className="ax-muted">{account.email}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <section className="ax-panel" aria-labelledby="ax-history-title">
        <h2 id="ax-history-title" className="ax-section-title">
          Redemption history <span className="ax-muted">· {code.redemptions.length === 500 ? "latest 500" : code.redemptions.length}</span>
        </h2>
        {code.redemptions.length ? (
          <div className="ax-table-wrap">
            <table className="ax-table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">When</th>
                  <th scope="col">Granted</th>
                </tr>
              </thead>
              <tbody>
                {code.redemptions.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="ax-account-name">{accountName(row.account)}</span>
                      {row.account?.email ? <span className="ax-muted block text-xs">{row.account.email}</span> : null}
                    </td>
                    <td className="whitespace-nowrap">
                      <When iso={row.redeemedAt} />
                    </td>
                    <td>
                      {rewardSummary(row.coins, [...row.items, ...row.achievements.map((id) => `${ACHIEVEMENT_PREFIX}${id}`)]) || "—"}
                      {row.achievements.length ? (
                        <span className="ax-muted block text-xs">
                          {row.achievementsNew.length} of {row.achievements.length} achievement{row.achievements.length === 1 ? "" : "s"} newly unlocked
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="ax-empty">Nobody has redeemed this code yet.</p>
        )}
      </section>

      <section className="ax-panel" aria-labelledby="ax-audit-title">
        <h2 id="ax-audit-title" className="ax-section-title">
          Audit trail
        </h2>
        {code.audit.length ? (
          <ol className="ax-audit">
            {code.audit.map((entry, index) => (
              <li key={index}>
                <span className="ax-audit-action" data-action={entry.action}>
                  {entry.action === "publish" ? "Published" : "Disabled"}
                </span>
                <span>
                  {entry.actor ? accountName(entry.actor) : entry.via === "cli" ? "Command line" : "Unknown"}
                  <span className="ax-muted"> · {entry.via === "cli" ? "npm run codes" : "admin panel"} · </span>
                  <When iso={entry.at} />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ax-empty">This code predates the audit trail.</p>
        )}
      </section>

      <AlertDialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable “{code.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Nobody can redeem it afterwards, and it can’t be turned back on or reused. Rewards already granted stay with their owners. To offer it again, clone it into a new code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it active</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={disable}>
              {busy ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
              Disable code
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminStage>
  );
}
