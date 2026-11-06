"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Backpack, Clover, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "items", label: "Items", icon: Backpack, accent: "#a855f7" },
  { id: "cases", label: "Cases", icon: Package, accent: "#f59e0b" },
  { id: "boosters", label: "Boosters", icon: Clover, accent: "#22c55e" },
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

  const activeIndex = TABS.findIndex((tab) => tab.id === active);
  return (
    <div className="grid gap-5">
      <div
        role="tablist"
        aria-label="Inventory"
        className="enter relative grid w-full max-w-xl grid-cols-3 rounded-2xl border border-border bg-surface/40 p-1.5"
        style={{ "--tab": activeIndex, "--accent": TABS[activeIndex].accent } as CSSProperties}
      >
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/3)] translate-x-[calc(var(--tab)*100%)] rounded-xl border border-(--accent)/40 bg-(--accent)/15 shadow-[0_8px_24px_-12px_var(--accent)] transition-[translate,background-color,border-color] duration-300 ease-out motion-reduce:transition-none"
        />
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
                "relative inline-flex h-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 motion-reduce:transition-none",
                selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon aria-hidden className="size-4 transition-colors" style={selected ? { color: tab.accent } : undefined} />
              {tab.label}
              {count !== null ? <span className="text-xs font-medium tabular-nums opacity-60">{count.toLocaleString("en")}</span> : null}
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
