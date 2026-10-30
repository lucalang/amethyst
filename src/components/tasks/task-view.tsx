"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  ListPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  SearchX,
  Trash2,
} from "lucide-react";
import { useSettings } from "@/components/layout/settings-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, useLocalStorageValue, writeLocal } from "@/components/workspace/client-utils";
import { TaskLinesDialog } from "@/components/workspace/task-lines-dialog";
import { apiFetch } from "@/lib/api-client";
import { accentStyle } from "@/lib/collection-identity";
import {
  byCompletedDesc,
  PLANNED_LABELS,
  plannedBucket,
  smartView,
  sortTasks,
  TASK_SORTS,
  type Task,
  type TaskList,
  type TaskSort,
} from "@/lib/tasks/model";
import { cn } from "@/lib/utils";
import { taskNameSchema } from "@/lib/validation/tasks";
import { MAX_ITEMS_PER_REQUEST, parseTaskLines } from "@/lib/validation/workspace";
import { DeleteListDialog, ListDialog, type ListDialogState } from "./list-dialogs";
import { useTasksNav } from "./nav";
import { ListGlyph, SMART_ICONS } from "./sidebar";
import { useTasks } from "./store";
import { DeleteTaskDialog, GhostRow, TaskRow, type TaskRowHandlers } from "./task-row";

const SETTLE_MS = 520;
const CELEBRATE_MS = 700;
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const dayHeading = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

/** A set of ids that each drop out again after `ms`. */
function useTransientIds(ms: number) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  function add(id: string) {
    setIds((current) => new Set([...current, id]));
    window.setTimeout(() => setIds((current) => new Set([...current].filter((other) => other !== id))), ms);
  }
  return [ids, add] as const;
}

function useStoredSort(viewKey: string, fallback: TaskSort): [TaskSort, (sort: TaskSort) => void] {
  const key = `archive:tasks-sort:${viewKey}`;
  const stored = useLocalStorageValue(key);
  const sort = TASK_SORTS.some((option) => option.id === stored) ? (stored as TaskSort) : fallback;
  return [
    sort,
    (next) => {
      writeLocal(key, next === fallback ? null : next);
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
  ];
}

function useStoredFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const stored = useLocalStorageValue(key);
  return [
    stored === null ? fallback : stored === "1",
    (value) => {
      writeLocal(key, value ? "1" : "0");
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
  ];
}

export function TaskView() {
  const store = useTasks();
  const { data, today, allTasks, listOrder, ghosts, actions, stepsByTask } = store;
  const nav = useTasksNav();
  const { motion } = useSettings();
  const view = nav.view;
  const list = view?.kind === "list" ? (data.lists[view.id] ?? null) : null;
  const viewKey = view ? (view.kind === "list" ? "list" : view.kind === "search" ? "search" : view.id) : "none";

  const [sort, setSort] = useStoredSort(viewKey, view?.kind === "smart" && view.id === "important" ? "due" : "manual");
  const [smartCompletedOpen, setSmartCompletedOpen] = useStoredFlag(`archive:tasks-completed-open:${viewKey}`, true);
  const [settling, addSettling] = useTransientIds(SETTLE_MS);
  const [celebrating, addCelebrating] = useTransientIds(CELEBRATE_MS);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [listDialog, setListDialog] = useState<ListDialogState | null>(null);
  const [deletingList, setDeletingList] = useState<TaskList | null>(null);

  // ---- Search -------------------------------------------------------------------------------
  const [statusFilter, setStatusFilter] = useState<"any" | "open" | "completed">("any");
  const [importantOnly, setImportantOnly] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [listFilter, setListFilter] = useState("all");
  const query = useDeferredValue(nav.query.trim());
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const notesSearch = useQuery({
    queryKey: ["task-notes-search", store.userId, debounced],
    queryFn: ({ signal }) => apiFetch<{ matches: { id: string; snippet: string }[] }>(`/api/tasks/search?q=${encodeURIComponent(debounced)}`, { signal }),
    enabled: view?.kind === "search" && debounced.length >= 2,
    staleTime: 30_000,
  });

  // ---- Drag reorder -------------------------------------------------------------------------
  const openListRef = useRef<HTMLOListElement>(null);
  const dragRef = useRef<{ id: string; startY: number; moved: boolean; order: string[] } | null>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const scope = useMemo(() => {
    if (!view) return [];
    if (view.kind === "list") return allTasks.filter((task) => task.listId === view.id);
    if (view.kind === "search") return allTasks;
    if (!today) return [];
    if (view.id === "my-day") return allTasks.filter((task) => task.myDayOn === today);
    if (view.id === "important") return allTasks.filter((task) => task.important);
    if (view.id === "planned") return allTasks.filter((task) => task.dueDate);
    return allTasks;
  }, [view, allTasks, today]);

  const isOpen = (task: Task) => !task.completedAt || settling.has(task.id);
  const sorted = sortTasks(
    scope.filter(isOpen),
    sort,
    view?.kind === "list" ? undefined : listOrder,
  );
  const completed = scope.filter((task) => !isOpen(task)).sort(byCompletedDesc);
  const canReorder = view?.kind === "list" && sort === "manual";
  const open = canReorder && dragOrder ? dragOrder.map((id) => data.tasks[id]).filter(Boolean) : sorted;
  const openIds = sorted.map((task) => task.id);

  // Row callbacks read the latest render's state through a ref, so their identity never changes.
  const latest = useRef<TaskRowHandlers | null>(null);
  useLayoutEffect(() => {
    latest.current = {
      select: (id) => nav.select(nav.selectedId === id ? null : id),
      toggle(task, done) {
        if (done && motion !== "off" && !prefersReducedMotion()) {
          addSettling(task.id);
          addCelebrating(task.id);
        }
        void actions.updateTask(task.id, { completed: done }, { failure: done ? "Task not completed" : "Task not reopened" });
      },
      remove: (task) => setDeleting(task),
      move(id, delta) {
        const ids = [...openIds];
        const from = ids.indexOf(id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= ids.length) return;
        ids.splice(to, 0, ...ids.splice(from, 1));
        void actions.reorderTasks(ids);
        requestAnimationFrame(() => document.getElementById(`task-row-${id}`)?.focus());
      },
      pointerDown(id, event) {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { id, startY: event.clientY, moved: false, order: openIds };
      },
      pointerMove(id, event) {
        const drag = dragRef.current;
        if (!drag || drag.id !== id || !openListRef.current) return;
        if (!drag.moved && Math.abs(event.clientY - drag.startY) < 4) return;
        if (!drag.moved) setDragId(id);
        drag.moved = true;
        const others = [...openListRef.current.querySelectorAll<HTMLElement>("[data-task-row]")].filter((row) => row.dataset.id !== id);
        let index = others.findIndex((row) => {
          const box = row.getBoundingClientRect();
          return event.clientY < box.top + box.height / 2;
        });
        if (index < 0) index = others.length;
        const next = others.map((row) => row.dataset.id!);
        next.splice(index, 0, id);
        if (next.join() !== drag.order.join()) {
          drag.order = next;
          setDragOrder(next);
        } else if (!dragOrder) setDragOrder(next);
      },
      pointerEnd() {
        const drag = dragRef.current;
        dragRef.current = null;
        if (drag?.moved && drag.order.join() !== openIds.join()) void actions.reorderTasks(drag.order);
        setDragOrder(null);
        setDragId(null);
      },
    };
  });
  const handlers = useMemo<TaskRowHandlers>(
    () => ({
      select: (id) => latest.current?.select(id),
      toggle: (task, done) => latest.current?.toggle(task, done),
      remove: (task) => latest.current?.remove(task),
      move: (id, delta) => latest.current?.move(id, delta),
      pointerDown: (id, event) => latest.current?.pointerDown(id, event),
      pointerMove: (id, event) => latest.current?.pointerMove(id, event),
      pointerEnd: () => latest.current?.pointerEnd(),
    }),
    [],
  );

  if (!view) {
    return (
      <EmptyState icon={<SearchX aria-hidden className="size-7" />} title="List not found" body="It may have been deleted on another device.">
        <Button variant="outline" onClick={() => nav.go("/tasks", { replace: true })}>
          Go to My Day
        </Button>
      </EmptyState>
    );
  }
  if (view.kind === "list" && !list) {
    return (
      <EmptyState icon={<SearchX aria-hidden className="size-7" />} title="List not found" body="This list doesn't exist or was deleted.">
        <Button variant="outline" onClick={() => nav.go("/tasks", { replace: true })}>
          Go to My Day
        </Button>
      </EmptyState>
    );
  }

  const row = (task: Task, options: { snippet?: ReactNode; index?: number; showList?: boolean } = {}) => {
    const reorderable = canReorder && options.index !== undefined && !task.completedAt;
    return (
      <TaskRow
        key={task.id}
        task={task}
        list={data.lists[task.listId]}
        entryTitle={task.entryId ? (data.entries[task.entryId]?.title ?? null) : null}
        steps={stepsByTask.get(task.id)}
        today={today}
        allLists={store.lists}
        actions={actions}
        selected={nav.selectedId === task.id}
        showList={options.showList ?? view.kind !== "list"}
        showMyDay={!(view.kind === "smart" && view.id === "my-day")}
        celebrate={celebrating.has(task.id)}
        checkedOverride={settling.has(task.id) ? true : undefined}
        snippet={options.snippet}
        handlers={handlers}
        movable={reorderable}
        canMoveUp={reorderable && options.index! > 0}
        canMoveDown={reorderable && options.index! < openIds.length - 1}
        draggable={reorderable && open.length > 1}
        dragging={dragId === task.id}
      />
    );
  };

  // ---- Header -------------------------------------------------------------------------------
  const smart = view.kind === "smart" ? smartView(view.id) : null;
  const SmartIcon = smart ? SMART_ICONS[smart.id] : null;
  const title = view.kind === "search" ? "Search" : (smart?.label ?? list!.name);
  const subtitle =
    view.kind === "smart" && view.id === "my-day"
      ? today
        ? dayHeading.format(new Date(`${today}T12:00:00Z`))
        : "\u00a0"
      : view.kind === "list"
        ? `${sorted.length} open${completed.length ? ` · ${completed.length} completed` : ""}`
        : view.kind === "smart"
          ? today
            ? `${sorted.length} open`
            : "\u00a0"
          : null;
  const sortable = view.kind === "list" || (view.kind === "smart" && ["my-day", "important"].includes(view.id)) || view.kind === "search";

  // ---- Quick add target ---------------------------------------------------------------------
  // Smart views have no list of their own; quick add asks where tasks go (listId null).
  const addTarget: AddTarget | null =
    view.kind === "list"
      ? { listId: view.id, extras: {}, hint: `Add a task to ${list!.name}` }
      : view.kind === "smart" && today
        ? {
            listId: null,
            extras: view.id === "my-day" ? { myDay: today } : view.id === "important" ? { important: true } : { dueDate: today },
            hint: view.id === "my-day" ? "Add a task to My Day" : view.id === "important" ? "Add an important task" : "Add a task due today",
          }
        : null;
  const viewGhosts = addTarget ? ghosts.filter((ghost) => !addTarget.listId || ghost.listId === addTarget.listId) : [];
  const loading = view.kind === "smart" && !today;

  const header = (
    <header className="flex items-start gap-2 px-4 pt-5 pb-3 sm:px-8 sm:pt-7" style={list ? accentStyle(list.accent) : undefined}>
      <div className="min-w-0 flex-1">
        <h1 className="flex min-w-0 items-center gap-2.5 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
          <span className={cn("grid shrink-0 place-items-center", list?.accent ? "text-[var(--ca)]" : "text-amethyst")}>
            {SmartIcon ? <SmartIcon aria-hidden className="size-6" /> : list ? <ListGlyph list={list} className="size-6" /> : null}
          </span>
          <span className="truncate">{title}</span>
        </h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground tabular-nums">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {sortable ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground" aria-label={`Sort: ${TASK_SORTS.find((option) => option.id === sort)?.label}`}>
                <ArrowDownUp aria-hidden />
                <span className="hidden sm:inline">{sort === "manual" ? "Sort" : TASK_SORTS.find((option) => option.id === sort)?.label}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              {TASK_SORTS.map((option) => (
                <DropdownMenuItem key={option.id} onSelect={() => setSort(option.id)}>
                  <Check aria-hidden className={cn(option.id !== sort && "invisible")} />
                  {option.id === "manual" && view.kind !== "list" ? "List order" : option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {list ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${list.name}`} className="text-muted-foreground">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setListDialog({ mode: "edit", list })}>
                <Pencil aria-hidden /> Edit list…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void actions.updateList(list.id, { showCompleted: !list.showCompleted }, { quiet: true })}>
                {list.showCompleted ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                {list.showCompleted ? "Hide completed tasks" : "Show completed tasks"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeletingList(list)}>
                <Trash2 aria-hidden /> Delete list
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </header>
  );

  // ---- Body ---------------------------------------------------------------------------------
  let body: ReactNode;
  if (loading) {
    body = (
      <ul className="space-y-1.5" aria-label="Loading tasks">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-[3.25rem] rounded-lg" />
        ))}
      </ul>
    );
  } else if (view.kind === "search") {
    body = (
      <SearchResults
        query={query}
        tasks={allTasks}
        stepsByTask={stepsByTask}
        notes={notesSearch.data?.matches}
        notesPending={notesSearch.isFetching}
        notesError={notesSearch.isError}
        sort={sort}
        listOrder={listOrder}
        filters={{ statusFilter, importantOnly, dueOnly, listFilter }}
        setters={{ setStatusFilter, setImportantOnly, setDueOnly, setListFilter }}
        row={(task, snippet) => row(task, { snippet, showList: true })}
      />
    );
  } else if (view.kind === "smart" && view.id === "planned") {
    const buckets = new Map<keyof typeof PLANNED_LABELS, Task[]>();
    for (const task of sortTasks(scope.filter(isOpen), "due", listOrder)) {
      const bucket = plannedBucket(task.dueDate!, today!);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), task]);
    }
    body =
      buckets.size === 0 && viewGhosts.length === 0 ? (
        <ViewEmpty viewId="planned" />
      ) : (
        <div className="space-y-5">
          {viewGhosts.length ? (
            <ul className="space-y-1.5">
              {viewGhosts.map((ghost) => (
                <GhostRow key={ghost.key} title={ghost.title} />
              ))}
            </ul>
          ) : null}
          {(Object.keys(PLANNED_LABELS) as (keyof typeof PLANNED_LABELS)[]).map((bucket) =>
            buckets.get(bucket)?.length ? (
              <TaskSection key={bucket} title={PLANNED_LABELS[bucket]} count={buckets.get(bucket)!.length} tone={bucket === "overdue" ? "rose" : undefined}>
                {buckets.get(bucket)!.map((task) => row(task))}
              </TaskSection>
            ) : null,
          )}
        </div>
      );
  } else {
    const showsCompleted = view.kind === "list" || (view.kind === "smart" && smartView(view.id).showsCompletedSection);
    const completedOpen = view.kind === "list" ? list!.showCompleted : smartCompletedOpen;
    body = (
      <>
        {open.length === 0 && viewGhosts.length === 0 ? (
          view.kind === "list" ? (
            <EmptyState
              compact
              icon={<ListGlyph list={list!} className="size-7" />}
              title={completed.length ? "All done here" : "No tasks yet"}
              body={completed.length ? "Everything in this list is finished." : "Add a task above. Paste several lines to add them all at once."}
            />
          ) : (
            <ViewEmpty viewId={view.id} />
          )
        ) : (
          <ol ref={openListRef} className="space-y-1.5" aria-label="Open tasks">
            {viewGhosts.map((ghost) => (
              <GhostRow key={ghost.key} title={ghost.title} />
            ))}
            {open.map((task, index) => row(task, { index }))}
          </ol>
        )}
        {showsCompleted && completed.length > 0 ? (
          <div className="mt-5">
            <button
              type="button"
              aria-expanded={completedOpen}
              onClick={() =>
                view.kind === "list" ? void actions.updateList(list!.id, { showCompleted: !completedOpen }, { quiet: true }) : setSmartCompletedOpen(!completedOpen)
              }
              className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-foreground/[0.04] px-2.5 py-1.5 text-sm font-medium text-foreground/85 transition-colors outline-none hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-amethyst/60 motion-reduce:transition-none"
            >
              <ChevronRight aria-hidden className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", completedOpen && "rotate-90")} />
              Completed
              <span className="text-muted-foreground tabular-nums">{completed.length}</span>
            </button>
            {completedOpen ? (
              <ol className="space-y-1.5" aria-label="Completed tasks">
                {completed.map((task) => row(task))}
              </ol>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {addTarget ? <QuickAdd key={`${viewKey}:${addTarget.listId ?? "pick"}`} target={addTarget} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-24 sm:px-8 md:pb-10">{body}</div>
      <DeleteTaskDialog
        task={deleting}
        onOpenChange={(next) => !next && setDeleting(null)}
        onDeleted={(id) => {
          if (nav.selectedId === id) nav.select(null);
        }}
      />
      {listDialog ? <ListDialog state={listDialog} onClose={() => setListDialog(null)} /> : null}
      <DeleteListDialog list={deletingList} onClose={() => setDeletingList(null)} />
    </div>
  );
}

type AddTarget = { listId: string | null; extras: { important?: boolean; dueDate?: string | null; myDay?: string | null }; hint: string };

function QuickAdd({ target }: { target: AddTarget }) {
  const { actions, data, lists, defaultList } = useTasks();
  const [draft, setDraft] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [listDialog, setListDialog] = useState<ListDialogState>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lines = parseTaskLines(draft);
  const destination = target.listId ? (data.lists[target.listId] ?? null) : ((chosenId && data.lists[chosenId]) || defaultList);

  if (!destination) return <FirstListForm onCreated={(created) => setChosenId(created.id)} />;
  const listId = destination.id;

  async function submit() {
    const items = parseTaskLines(draft).map((line) => ({ title: line.label, completed: line.checked }));
    if (items.length === 0) return;
    if (items.length > MAX_ITEMS_PER_REQUEST) {
      setBulkOpen(true);
      return;
    }
    const text = draft;
    setDraft("");
    const error = await actions.addTasks(listId, items, target.extras);
    if (error) setDraft((current) => current || text);
  }

  return (
    <div className="px-4 pb-3 sm:px-8">
      <div className="flex items-start gap-2 rounded-xl bg-foreground/[0.04] py-1 pr-1 pl-3 shadow-[inset_0_0_0_1px_rgb(var(--ink-rgb)/0.08)] transition-shadow focus-within:shadow-[inset_0_0_0_2px_var(--amethyst)] motion-reduce:transition-none">
        <Plus aria-hidden className="mt-3 size-[1.1rem] shrink-0 text-amethyst" />
        <label htmlFor="tasks-quick-add" className="sr-only">
          {target.hint}
        </label>
        <textarea
          id="tasks-quick-add"
          ref={inputRef}
          rows={1}
          value={draft}
          placeholder={target.hint}
          maxLength={20_000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            } else if (event.key === "Escape" && draft) {
              event.preventDefault();
              setDraft("");
            }
          }}
          className="field-sizing-content max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[14.5px] leading-6 outline-none placeholder:text-muted-foreground"
        />
        {lines.length > 0 ? (
          <Button size="sm" className="mt-1.5" onClick={() => void submit()}>
            {lines.length > 1 ? `Add ${lines.length}` : "Add"}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="mt-1.5 text-muted-foreground" onClick={() => setBulkOpen(true)}>
            <ListPlus aria-hidden />
            <span className="hidden sm:inline">Add multiple</span>
            <span className="sr-only sm:hidden">Add multiple tasks</span>
          </Button>
        )}
      </div>
      {target.listId === null || lines.length > 1 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-xs text-muted-foreground">
          {target.listId === null ? (
            <span className="inline-flex items-center gap-1">
              Adds to
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    style={accentStyle(destination.accent)}
                    aria-label={`Adds to ${destination.name}. Choose another list`}
                    className="inline-flex h-7 max-w-56 items-center gap-1.5 rounded-md px-1.5 font-medium text-foreground/85 outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring/60 aria-expanded:bg-foreground/[0.06]"
                  >
                    <ListGlyph list={destination} className={cn("size-3.5 shrink-0", destination.accent ? "text-[var(--ca)]" : "text-amethyst")} />
                    <span className="truncate">{destination.name}</span>
                    <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
                  <DropdownMenuLabel>Add tasks to</DropdownMenuLabel>
                  {lists.map((option) => (
                    <DropdownMenuItem key={option.id} onSelect={() => setChosenId(option.id)}>
                      <Check aria-hidden className={cn(option.id !== destination.id && "invisible")} />
                      <span style={accentStyle(option.accent)} className={cn("grid shrink-0 place-items-center", option.accent && "text-[var(--ca)]")}>
                        <ListGlyph list={option} className="size-4" />
                      </span>
                      <span className="truncate">{option.name}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setListDialog({ mode: "create", groupId: null, onCreated: (created) => setChosenId(created.id) })}>
                    <Plus aria-hidden /> New list…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          ) : null}
          {lines.length > 1 ? <span>Each line becomes a task · Shift+Enter for a new line</span> : null}
        </div>
      ) : null}
      <ListDialog state={listDialog} onClose={() => setListDialog(null)} />
      {bulkOpen ? <TaskLinesDialog
        open={bulkOpen}
        initialText={draft}
        onOpenChange={(open) => { setBulkOpen(open); if (!open) setDraft(""); }}
        prepend
        title="Add multiple tasks"
        description={`One task per line, added to ${destination.name}. Lines starting with “- [x]” are added as completed; list markers are removed.`}
        confirmLabel="Add tasks"
        onConfirm={(tasks, batchId) => actions.addTasks(listId, tasks.map((task) => ({ title: task.label, completed: task.checked })), target.extras, batchId)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      /> : null}
    </div>
  );
}

function FirstListForm({ onCreated }: { onCreated: (list: TaskList) => void }) {
  const { actions } = useTasks();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = taskNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onCreated(await actions.createList({ name: parsed.data }));
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-4 mb-3 rounded-xl border border-dashed border-border p-4 sm:mx-8">
      <p className="text-sm font-medium">Create your first list</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Every task lives in a list. Name one to start adding tasks here.</p>
      <div className="mt-3 flex gap-2">
        <label htmlFor="tasks-first-list" className="sr-only">
          List name
        </label>
        <Input
          id="tasks-first-list"
          value={name}
          maxLength={120}
          placeholder="e.g. Personal"
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "tasks-first-list-error" : undefined}
        />
        <Button type="submit" disabled={busy} className="shrink-0">
          {busy ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Plus aria-hidden />}
          Create list
        </Button>
      </div>
      {error ? (
        <p id="tasks-first-list-error" role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function TaskSection({ title, count, tone, children }: { title: string; count: number; tone?: "rose"; children: ReactNode }) {
  return (
    <section>
      <h2 className={cn("mb-2 flex items-center gap-2 px-1 text-sm font-semibold", tone === "rose" ? "text-rose" : "text-foreground/85")}>
        {title}
        <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
      </h2>
      <ol className="space-y-1.5">{children}</ol>
    </section>
  );
}

const EMPTY_COPY = {
  "my-day": { title: "Focus on your day", body: "Add tasks here, or pick them from any list with “Add to My Day”. Tomorrow starts fresh." },
  important: { title: "Nothing starred", body: "Star a task to see it here." },
  planned: { title: "Nothing planned", body: "Tasks with a due date show up here, grouped by when they're due." },
} as const;

function ViewEmpty({ viewId }: { viewId: keyof typeof EMPTY_COPY }) {
  const Icon = SMART_ICONS[viewId];
  return <EmptyState compact icon={<Icon aria-hidden className="size-7" />} {...EMPTY_COPY[viewId]} />;
}

function EmptyState({ icon, title, body, compact, children }: { icon: ReactNode; title: string; body: string; compact?: boolean; children?: ReactNode }) {
  return (
    <div className={cn("mx-auto flex max-w-sm flex-col items-center text-center", compact ? "py-14" : "py-24")}>
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-amethyst/10 text-amethyst shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.2)]">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

function SearchResults({
  query,
  tasks,
  stepsByTask,
  notes,
  notesPending,
  notesError,
  sort,
  listOrder,
  filters,
  setters,
  row,
}: {
  query: string;
  tasks: Task[];
  stepsByTask: Map<string, { title: string }[]>;
  notes: { id: string; snippet: string }[] | undefined;
  notesPending: boolean;
  notesError: boolean;
  sort: TaskSort;
  listOrder: Map<string, number>;
  filters: { statusFilter: "any" | "open" | "completed"; importantOnly: boolean; dueOnly: boolean; listFilter: string };
  setters: {
    setStatusFilter: (value: "any" | "open" | "completed") => void;
    setImportantOnly: (value: boolean) => void;
    setDueOnly: (value: boolean) => void;
    setListFilter: (value: string) => void;
  };
  row: (task: Task, snippet?: ReactNode) => ReactNode;
}) {
  const { lists } = useTasks();
  const needle = query.toLowerCase();
  const snippets = new Map((notes ?? []).map((match) => [match.id, match.snippet]));
  const results = needle
    ? tasks.filter(
        (task) =>
          (task.title.toLowerCase().includes(needle) || snippets.has(task.id) || (stepsByTask.get(task.id) ?? []).some((step) => step.title.toLowerCase().includes(needle))) &&
          (filters.statusFilter === "any" || (filters.statusFilter === "open") === !task.completedAt) &&
          (!filters.importantOnly || task.important) &&
          (!filters.dueOnly || task.dueDate) &&
          (filters.listFilter === "all" || task.listId === filters.listFilter),
      )
    : [];
  const ordered = sortTasks(results, sort, listOrder).sort((a, b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)));

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amethyst/60",
        active ? "bg-amethyst/20 text-foreground shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.45)]" : "bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.09]",
      )}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Search filters">
        <Select value={filters.statusFilter} onValueChange={(value) => setters.setStatusFilter(value as "any" | "open" | "completed")}>
          <SelectTrigger size="sm" className="w-36" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.listFilter} onValueChange={setters.setListFilter}>
          <SelectTrigger size="sm" className="w-44" aria-label="List">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lists</SelectItem>
            {lists.map((list) => (
              <SelectItem key={list.id} value={list.id}>
                {list.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {chip(filters.importantOnly, "Important", () => setters.setImportantOnly(!filters.importantOnly))}
        {chip(filters.dueOnly, "Has due date", () => setters.setDueOnly(!filters.dueOnly))}
      </div>
      {!needle ? (
        <EmptyState compact icon={<SearchX aria-hidden className="size-7" />} title="Search your tasks" body="Titles, steps and notes are searched across every list." />
      ) : (
        <>
          <p className="mb-2 flex items-center gap-2 px-1 text-sm text-muted-foreground" aria-live="polite">
            {ordered.length} {ordered.length === 1 ? "result" : "results"}
            {notesPending ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" /> searching notes
              </span>
            ) : notesError ? (
              <span className="text-rose">Notes couldn&apos;t be searched</span>
            ) : null}
          </p>
          {ordered.length ? (
            <ol className="space-y-1.5">{ordered.map((task) => row(task, snippets.get(task.id)))}</ol>
          ) : notesPending ? null : (
            <EmptyState compact icon={<SearchX aria-hidden className="size-7" />} title="No matches" body="Try another word or loosen the filters." />
          )}
        </>
      )}
    </div>
  );
}
