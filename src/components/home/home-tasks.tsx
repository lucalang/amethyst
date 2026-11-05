"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CalendarClock, Star, type LucideIcon } from "lucide-react";
import { UpcomingTasks } from "@/components/home/upcoming-tasks";
import type { HomeTask } from "@/lib/data/home";
import { cn } from "@/lib/utils";

type TabId = "upcoming" | "favorited";
const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "upcoming", label: "Upcoming", icon: CalendarClock },
  { id: "favorited", label: "Favorited", icon: Star },
];

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-white/[0.1] px-4 py-3.5 text-sm text-muted-foreground">{children}</p>;
}

/** Home's checklist tasks: upcoming (due soonest) or favorited (starred), as ARIA tabs. */
export function HomeTasks({ upcoming, favorited }: { upcoming: HomeTask[]; favorited: HomeTask[] }) {
  const [tab, setTab] = useState<TabId>("upcoming");
  const id = useId();
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((item) => item.id === tab);
    const next =
      event.key === "ArrowRight" ? (index + 1) % TABS.length
      : event.key === "ArrowLeft" ? (index - 1 + TABS.length) % TABS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? TABS.length - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(TABS[next].id);
    refs.current[TABS[next].id]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Tasks" onKeyDown={onKeyDown} className="mb-3 inline-flex rounded-lg border border-white/[0.08] bg-surface/40 p-0.5">
        {TABS.map(({ id: tabId, label, icon: Icon }) => {
          const selected = tab === tabId;
          return (
            <button
              key={tabId}
              ref={(node) => {
                refs.current[tabId] = node;
              }}
              type="button"
              role="tab"
              id={`${id}-${tabId}-tab`}
              aria-selected={selected}
              aria-controls={`${id}-${tabId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(tabId)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "bg-amethyst/15 text-foreground shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.3)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon aria-hidden className={cn("size-3.5", selected && "text-amethyst", selected && tabId === "favorited" && "fill-current")} />
              {label}
            </button>
          );
        })}
      </div>
      {TABS.map(({ id: tabId }) => (
        <div key={tabId} role="tabpanel" id={`${id}-${tabId}-panel`} aria-labelledby={`${id}-${tabId}-tab`} hidden={tab !== tabId}>
          {tabId === "upcoming" ? (
            upcoming.length ? <UpcomingTasks tasks={upcoming} /> : <Empty>No open tasks with due dates. Add a due date to a checklist task to see it here.</Empty>
          ) : favorited.length ? (
            <UpcomingTasks tasks={favorited} label="Favorited tasks" />
          ) : (
            <Empty>No favorited open tasks. Star a checklist task in any entry to keep it here.</Empty>
          )}
        </div>
      ))}
    </div>
  );
}
