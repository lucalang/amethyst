"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Star, type LucideIcon } from "lucide-react";
import { UpcomingTasks } from "@/components/home/upcoming-tasks";
import type { HomeTask } from "@/lib/data/home";
import { cn } from "@/lib/utils";

type TabId = "upcoming" | "favorited";
const FAVORITES_PER_PAGE = 8;
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
  const [favoritePage, setFavoritePage] = useState(0);
  const id = useId();
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const pageCount = Math.ceil(favorited.length / FAVORITES_PER_PAGE);
  const currentPage = Math.min(favoritePage, Math.max(pageCount - 1, 0));
  const pageTasks = favorited.slice(currentPage * FAVORITES_PER_PAGE, (currentPage + 1) * FAVORITES_PER_PAGE);

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
            <>
              <UpcomingTasks tasks={pageTasks} label="Favorited tasks" />
              {pageCount > 1 ? (
                <nav aria-label="Favorited task pages" className="mt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setFavoritePage((page) => Math.max(page - 1, 0))}
                    disabled={currentPage === 0}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-white/[0.1] px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronLeft aria-hidden className="size-3.5" />
                    Previous
                  </button>
                  <span aria-live="polite" className="text-xs text-muted-foreground">
                    Page {currentPage + 1} of {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFavoritePage((page) => Math.min(page + 1, pageCount - 1))}
                    disabled={currentPage >= pageCount - 1}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-white/[0.1] px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    Next
                    <ChevronRight aria-hidden className="size-3.5" />
                  </button>
                </nav>
              ) : null}
            </>
          ) : (
            <Empty>No favorited open tasks. Star a checklist task in any entry to keep it here.</Empty>
          )}
        </div>
      ))}
    </div>
  );
}
