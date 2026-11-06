"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, Gift, PackageOpen, Store } from "lucide-react";
import type { ArtProfile, ArtSamples } from "@/components/inventory/item-art";
import { Button } from "@/components/ui/button";
import { lootCaseInfo, type LootState } from "@/lib/lootboxes";
import { CaseOpening, type OpenPlan } from "./case-opening";
import { CaseArt, caseStyle } from "./parts";

/** Cases in the Inventory: what's owned, opening them, and any saved rewards still to reveal. */
export function CaseShelf({ state, profile, samples }: { state: LootState | null; profile: ArtProfile; samples: ArtSamples }) {
  const [plan, setPlan] = useState<OpenPlan | null>(() => (state?.pending.length ? { kind: "resume", openings: state.pending } : null));
  if (!state) return null;

  const owned = state.cases.filter((lootCase) => lootCase.quantity > 0);
  const pending = state.pending;
  const pendingCases = pending.reduce((sum, opening) => sum + opening.quantity, 0);

  return (
    <section aria-labelledby="inv-cases-heading" className="enter mb-6 grid gap-3" style={{ "--enter-index": 0 } as CSSProperties}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="inv-cases-heading" className="text-sm font-semibold text-foreground">
          Cases
        </h2>
        <Link href="/arcade/lootboxes" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <Store aria-hidden className="size-3.5" />
          Lootboxes shop
        </Link>
      </div>

      {pending.length ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amethyst/40 bg-amethyst/[0.08] px-4 py-3 text-sm">
          <Gift aria-hidden className="size-4 text-amethyst" />
          <span className="min-w-0 flex-1">
            Rewards from {pendingCases} opened case{pendingCases === 1 ? "" : "s"} are saved and waiting to be claimed.
          </span>
          <Button size="sm" onClick={() => setPlan({ kind: "resume", openings: pending })}>
            Reveal rewards
          </Button>
        </div>
      ) : null}

      {owned.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {owned.map((lootCase) => {
            const info = lootCaseInfo(lootCase.id);
            return (
              <li key={lootCase.id} className="lb-stage flex items-center gap-4 p-3 pr-4" style={caseStyle(lootCase.id)}>
                <CaseArt id={lootCase.id} size="4.5rem" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Case</p>
                  <p className="truncate text-sm font-semibold text-foreground">{info.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">× {lootCase.quantity.toLocaleString("en")}</p>
                </div>
                <Button
                  size="sm"
                  disabled={pending.length > 0}
                  title={pending.length ? "Claim your saved rewards first" : undefined}
                  onClick={() => setPlan({ kind: "new", caseId: lootCase.id })}
                  aria-label={`Open ${info.name}`}
                >
                  <PackageOpen aria-hidden />
                  Open
                </Button>
              </li>
            );
          })}
        </ul>
      ) : !pending.length ? (
        <Link
          href="/arcade/lootboxes"
          className="group flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-amethyst/50 hover:text-foreground"
          style={caseStyle("release")}
        >
          <CaseArt id="release" size="2.5rem" />
          <span className="min-w-0 flex-1">No cases yet. Buy cases with Coins in the Lootboxes shop and open them here.</span>
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : null}

      {plan ? <CaseOpening key={plan.kind === "new" ? plan.caseId : "resume"} plan={plan} cases={state.cases} profile={profile} samples={samples} onClose={() => setPlan(null)} /> : null}
    </section>
  );
}
