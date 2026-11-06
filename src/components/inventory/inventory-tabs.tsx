"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Backpack, Clover, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "items", label: "Items", icon: Backpack },
  { id: "cases", label: "Cases", icon: Package },
  { id: "boosters", label: "Boosters", icon: Clover },
] as const;
export type InventoryTab = (typeof TABS)[number]["id"];

/** Items, Cases and Boosters tabs; the open tab lives in the URL (?tab=cases) so links can open any one. */
export function InventoryTabs({ counts, items, cases, boosters }: { counts: Record<InventoryTab, number | null>; items: ReactNode; cases: ReactNode; boosters: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const active: InventoryTab = TABS.find((tab) => tab.id === params.get("tab"))?.id ?? "items";
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const panels: Record<InventoryTab, ReactNode> = { items, cases, boosters };

  function select(tab: InventoryTab) {
    const next = new URLSearchParams(params.toString());
    if (tab === "items") next.delete("tab");
    else next.set("tab", tab);
    const query = next.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  function onKey(event: KeyboardEvent, index: number) {
    const last = TABS.length - 1;
    const target = event.key === "ArrowRight" ? (index === last ? 0 : index + 1) : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (target === null) return;
    event.preventDefault();
    select(TABS[target].id);
    buttons.current[target]?.focus();
  }

  return (
    <div className="grid gap-5">
      <div role="tablist" aria-label="Inventory" className="enter inline-flex w-fit gap-1 rounded-xl border border-border bg-foreground/[0.03] p-1">
        {TABS.map((tab, index) => {
          const selected = tab.id === active;
          const count = counts[tab.id];
          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`inv-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`inv-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(event) => onKey(event, index)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none",
                selected ? "bg-amethyst/15 text-foreground shadow-[inset_0_0_0_1px_rgb(167_139_250/0.35)]" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
              )}
            >
              <tab.icon aria-hidden className={cn("size-4", selected && "text-amethyst")} />
              {tab.label}
              {count !== null ? (
                <span className="rounded-full bg-foreground/[0.07] px-1.5 text-xs tabular-nums text-muted-foreground">
                  {count.toLocaleString("en")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {TABS.map((tab) => (
        <div key={tab.id} role="tabpanel" id={`inv-panel-${tab.id}`} aria-labelledby={`inv-tab-${tab.id}`} hidden={tab.id !== active} tabIndex={0} className="outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-xl">
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
