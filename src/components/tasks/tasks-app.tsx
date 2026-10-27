"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, Search, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { parseTasksPath, type TaskChanges } from "@/lib/tasks/model";
import { cn } from "@/lib/utils";
import { TasksNavContext, type TasksNav } from "./nav";
import { TasksSidebar } from "./sidebar";
import { TasksProvider, useTasks } from "./store";
import { TaskDetail } from "./task-detail";
import { TaskView } from "./task-view";

export function TasksApp({ userId, initial }: { userId: string; initial: TaskChanges }) {
  return (
    <TasksProvider userId={userId} initial={initial}>
      <TasksShell />
    </TasksProvider>
  );
}

const XL = "(min-width: 80rem)";
const subscribeWide = (onChange: () => void) => {
  const media = window.matchMedia(XL);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

function TasksShell() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { inbox, data, live } = useTasks();
  const [navOpen, setNavOpen] = useState(false);
  const [query, setQueryState] = useState(() => searchParams.get("q") ?? "");
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(XL).matches, () => true);
  const returnPathRef = useRef("/tasks");
  const view = parseTasksPath(pathname, inbox?.id ?? null);
  const selectedId = searchParams.get("task");
  const selected = selectedId ? (data.tasks[selectedId] ?? null) : null;

  const nav = useMemo<TasksNav>(() => {
    const write = (url: string, replace: boolean) => {
      if (replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    };
    return {
      view,
      selectedId,
      query,
      go(path, options = {}) {
        if (!path.startsWith("/tasks/search")) setQueryState("");
        if (path === pathname && !selectedId) return;
        write(path, options.replace ?? false);
      },
      select(taskId) {
        const params = new URLSearchParams(searchParams.toString());
        if (taskId) params.set("task", taskId);
        else params.delete("task");
        const search = params.toString();
        // Opening details is a history step; switching tasks or closing replaces it.
        write(`${pathname}${search ? `?${search}` : ""}`, Boolean(selectedId) || !taskId);
      },
      setQuery(next) {
        setQueryState(next);
        const trimmed = next.trim();
        if (view?.kind !== "search") {
          if (!trimmed) return;
          returnPathRef.current = pathname;
          write(`/tasks/search?q=${encodeURIComponent(trimmed)}`, false);
          return;
        }
        if (!trimmed) {
          setQueryState("");
          write(returnPathRef.current, true);
          return;
        }
        const params = new URLSearchParams(searchParams.toString());
        params.set("q", trimmed);
        write(`/tasks/search?${params}`, true);
      },
      openNav: () => setNavOpen(true),
    };
  }, [view, selectedId, query, pathname, searchParams]);

  const close = () => nav.select(null);
  const detail = selected ? <TaskDetail key={selected.id} task={selected} onClose={close} /> : null;

  return (
    <TasksNavContext value={nav}>
      <div data-tasks-app className="-mb-24 flex h-[calc(100dvh-3.5rem-1px)] min-h-[28rem] overflow-hidden md:-mb-10">
        <aside aria-label="Task lists" className="hidden w-72 shrink-0 flex-col border-r border-white/[0.06] bg-black/20 md:flex">
          <TasksSidebar />
        </aside>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-[19rem] max-w-[85vw] gap-0 p-0 md:hidden">
            <SheetTitle className="sr-only">Task lists</SheetTitle>
            <SheetDescription className="sr-only">Smart views, lists and groups</SheetDescription>
            <TasksSidebar onNavigate={() => setNavOpen(false)} />
          </SheetContent>
        </Sheet>

        <section aria-label="Tasks" className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 px-4 pt-3 sm:px-8">
            <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open lists" onClick={() => setNavOpen(true)}>
              <Menu aria-hidden />
            </Button>
            <div className="relative max-w-md min-w-0 flex-1">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <label htmlFor="tasks-search" className="sr-only">
                Search tasks
              </label>
              <input
                id="tasks-search"
                type="search"
                value={query}
                maxLength={100}
                placeholder="Search tasks"
                autoComplete="off"
                onChange={(event) => nav.setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    nav.setQuery("");
                  }
                }}
                className="h-9 w-full rounded-full bg-white/[0.05] pr-9 pl-9 text-sm shadow-[inset_0_0_0_1px_rgb(var(--ink-rgb)/0.07)] transition-shadow outline-none placeholder:text-muted-foreground focus-visible:shadow-[inset_0_0_0_2px_var(--amethyst)] [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => nav.setQuery("")}
                  className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              ) : null}
            </div>
            {!live ? (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Live updates are paused; changes from other devices load when you return to this tab.">
                <WifiOff aria-hidden className="size-3.5" />
                <span className="hidden sm:inline">Not live</span>
              </span>
            ) : null}
          </div>
          <TaskView />
        </section>

        {wide ? (
          <aside
            aria-label="Task details"
            className={cn(
              "shrink-0 border-l border-white/[0.06] bg-black/20 transition-[width] duration-200 ease-out motion-reduce:transition-none",
              detail ? "w-[23rem] 2xl:w-[26rem]" : "w-0 border-l-0",
            )}
          >
            {detail}
          </aside>
        ) : (
          <Sheet open={detail !== null} onOpenChange={(next) => !next && close()}>
            <SheetContent side="right" showCloseButton={false} className="w-[26rem] max-w-[100vw] gap-0 p-0">
              <SheetTitle className="sr-only">{selected?.title ?? "Task details"}</SheetTitle>
              <SheetDescription className="sr-only">Edit the task, its steps, due date and notes</SheetDescription>
              {detail}
            </SheetContent>
          </Sheet>
        )}
      </div>
    </TasksNavContext>
  );
}
