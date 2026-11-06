"use client";

import "./lootboxes.css";
import type { CSSProperties } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { TYPE_LOOK } from "@/components/inventory/item-art";
import { toInventoryItem, type InventoryItem, type InventoryType } from "@/lib/inventory";
import { caseOdds, formatChance, lootCaseInfo, refundFor, typeLabel, type LootResult, type LootTier, type RefundRates } from "@/lib/lootboxes";
import { RARITIES, RARITY_IDS, type RarityId } from "@/lib/rarities";
import { cn } from "@/lib/utils";

export const rarityStyle = (rarity: RarityId) => ({ "--rarity": RARITIES[rarity].color }) as CSSProperties;
export const caseStyle = (id: string) => ({ "--case": lootCaseInfo(id).hue, "--case-glow": lootCaseInfo(id).glow }) as CSSProperties;

/** A rolled or listed reward resolved through the cosmetic registries. */
export const rewardItem = (result: Pick<LootResult, "item" | "rarity">): InventoryItem | null => toInventoryItem(result.item, "", result.rarity);

export function RarityTag({ rarity, className }: { rarity: RarityId; className?: string }) {
  return (
    <span className={cn("lb-rarity", className)} style={rarityStyle(rarity)}>
      {RARITIES[rarity].label}
    </span>
  );
}

/** An original case illustration in the case's colors. */
export function CaseArt({ id, size, float = false, className }: { id: string; size?: string; float?: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("lb-case", className)} data-float={float || undefined} style={{ ...caseStyle(id), ...(size ? { "--lb-case-size": size } : {}) } as CSSProperties}>
      <span className="lb-case-body">
        <span className="lb-case-band" />
        <span className="lb-case-gem" />
      </span>
      <span className="lb-case-lid" />
    </span>
  );
}

export function TypeIcon({ kind, className }: { kind: InventoryType | null; className?: string }) {
  const Icon = TYPE_LOOK[kind ?? "frame"].icon;
  return <Icon aria-hidden className={className} />;
}

/** Exact odds per rarity, expandable to every item's own chance, straight from the drop table. With luck > 1 the boosted chance leads and the base chance follows. */
export function OddsList({ tiers, luck = 1 }: { tiers: readonly LootTier[]; luck?: number }) {
  const odds = caseOdds(tiers, luck);
  const base = luck > 1 ? caseOdds(tiers) : null;
  return (
    <ul className="grid gap-2">
      {odds.map((tier, tierIndex) => (
        <li key={tier.rarity}>
          <details className="lb-tier" style={rarityStyle(tier.rarity)}>
            <summary>
              <ChevronRight aria-hidden className="lb-tier-chevron size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <RarityTag rarity={tier.rarity} />
                  <span className="text-sm font-semibold tabular-nums">
                    {base ? <span className="mr-1.5 text-xs font-normal text-muted-foreground line-through">{formatChance(base[tierIndex].chance)}</span> : null}
                    {formatChance(tier.chance)}
                  </span>
                </span>
                <span aria-hidden className="lb-tier-bar mt-1.5 block">
                  <span style={{ width: `${Math.max(tier.chance * 100, 0.5)}%` }} />
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {tier.items.length} item{tier.items.length === 1 ? "" : "s"}, {formatChance(tier.itemChance)} each
                </span>
              </span>
            </summary>
            <ul className="grid gap-1 px-3 pb-3">
              {tier.items.map((entry, index) => {
                const item = entry.id ? rewardItem({ item: entry.id, rarity: tier.rarity }) : null;
                return (
                  <li key={entry.id ?? `secret-${index}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs odd:bg-foreground/[0.025]">
                    {item ? <TypeIcon kind={entry.kind} className="size-3.5 shrink-0 text-muted-foreground" /> : <Lock aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-foreground">{item?.name ?? "Secret item"}</span>
                      <span className="text-muted-foreground"> · {typeLabel(entry.kind)}</span>
                    </span>
                    {entry.owned ? <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">Owned</span> : null}
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatChance(tier.itemChance)}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}

export const DUPLICATE_NOTE =
  "Cosmetics are owned once. A reward you already own (or already won in an unclaimed opening) doesn’t add a second copy; it refunds Coins instead: a share of the price you paid for that case, set by the reward’s rarity and rounded down.";

/** Duplicate refund rates by rarity, with the amount at a unit price when one is given. */
export function RefundRateList({ rates, price, className }: { rates: RefundRates; price?: number; className?: string }) {
  const rows = RARITY_IDS.filter((rarity) => rates[rarity] !== undefined);
  if (!rows.length) return null;
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3", className)}>
      {rows.map((rarity) => (
        <div key={rarity} className="flex items-center justify-between gap-2">
          <dt>
            <RarityTag rarity={rarity} />
          </dt>
          <dd className="tabular-nums text-muted-foreground">
            {rates[rarity]}%{price !== undefined ? <span className="text-foreground"> · {refundFor(rates, rarity, price).toLocaleString("en")}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
