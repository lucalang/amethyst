"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderInput,
  ListPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  SearchX,
  Star,
  Sun,
  Trash2,
  X,
} from "lucide-react";
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
  changedSlice,
  moveBlockBefore,
  moveBlockBy,
  PLANNED_LABELS,
  plannedBucket,
  shiftDate,
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
import { VirtualTaskList, type DragFlags, type Reorder, type VirtualListHandle } from "./task-list";
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

type Item =
  | { kind: "ghost"; key: string; title: string }
  | { kind: "task"; key: string; task: Task; open: boolean; snippet?: string }
  | { kind: "heading"; key: string; title: string; count: number; tone?: "rose" }
  | { kind: "completed"; key: string; count: number; open: boolean };

const estimateItem = (item: Item) =>
  item.kind === "heading" ? 40 : item.kind === "completed" ? 54 : item.kind === "task" && (item.task.dueDate || item.task.hasNotes || item.snippet) ? 76 : 58;

type Selection = { scope: string; ids: ReadonlySet<string>; anchor: string | null };
const NONE: ReadonlySet<string> = new Set();
/** Scroll offsets per view for this session, so switching lists returns to where you were. */
const scrollMemory = new Map<string, number>();

type ViewHandlers = TaskRowHandlers & {
  dragBlock: (id: string) => string[];
  drop: (block: string[], beforeId: string | null) => void;
};

export function TaskView() {
  const store = useTasks();
  const { data, today, allTasks, listOrder, ghosts, actions, stepsByTask } = store;
  const nav = useTasksNav();
  const { motion } = useSettings();
  const view = nav.view;
  const list = view?.kind === "list" ? (data.lists[view.id] ?? null) : null;
  const viewKey = view ? (view.kind === "list" ? "list" : view.kind === "search" ? "search" : view.id) : "none";
  const scopeKey = view?.kind === "list" ? `list:${view.id}` : viewKey;

  const [sort, setSort] = useStoredSort(viewKey, view?.kind === "smart" && view.id === "important" ? "due" : "manual");
  const [smartCompletedOpen, setSmartCompletedOpen] = useStoredFlag(`archive:tasks-completed-open:${viewKey}`, true);
  const [settling, addSettling] = useTransientIds(SETTLE_MS);
  const [celebrating, addCelebrating] = useTransientIds(CELEBRATE_MS);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [listDialog, setListDialog] = useState<ListDialogState | null>(null);
  const [deletingList, setDeletingList] = useState<TaskList | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const listHandle = useRef<VirtualListHandle>(null);

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
  const notes = notesSearch.data?.matches;
  const searchResults = useMemo(() => {
    const needle = query.toLowerCase();
    if (view?.kind !== "search" || !needle) return [];
    const snippets = new Map((notes ?? []).map((match) => [match.id, match.snippet]));
    const results = allTasks.filter(
      (task) =>
        (task.title.toLowerCase().includes(needle) || snippets.has(task.id) || (stepsByTask.get(task.id) ?? []).some((step) => step.title.toLowerCase().includes(needle))) &&
        (statusFilter === "any" || (statusFilter === "open") === !task.completedAt) &&
        (!importantOnly || task.important) &&
        (!dueOnly || task.dueDate) &&
        (listFilter === "all" || task.listId === listFilter),
    );
    return sortTasks(results, sort, listOrder)
      .sort((a, b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)))
      .map((task) => ({ task, snippet: snippets.get(task.id) }));
  }, [view, query, notes, allTasks, stepsByTask, statusFilter, importantOnly, dueOnly, listFilter, sort, listOrder]);

  // ---- Visible rows -------------------------------------------------------------------------
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

  const { sorted, completed } = useMemo(() => {
    const open: Task[] = [];
    const done: Task[] = [];
    if (view?.kind !== "search") for (const task of scope) (!task.completedAt || settling.has(task.id) ? open : done).push(task);
    const order = view?.kind === "smart" && view.id === "planned" ? "due" : sort;
    return { sorted: sortTasks(open, order, view?.kind === "list" ? undefined : listOrder), completed: done.sort(byCompletedDesc) };
  }, [view, scope, settling, sort, listOrder]);

  const canReorder = view?.kind === "list" && sort === "manual";
  const openIds = useMemo(() => sorted.map((task) => task.id), [sorted]);
  const openIndex = useMemo(() => new Map(openIds.map((id, index) => [id, index])), [openIds]);
  const loading = view?.kind === "smart" && !today;
  const viewGhosts = useMemo(
    () => (view?.kind === "list" ? ghosts.filter((ghost) => ghost.listId === view.id) : view?.kind === "smart" && today ? ghosts : []),
    [view, ghosts, today],
  );
  const showsCompleted = view?.kind === "list" || (view?.kind === "smart" && smartView(view.id).showsCompletedSection);
  const completedOpen = view?.kind === "list" ? Boolean(list?.showCompleted) : smartCompletedOpen;

  const items = useMemo<Item[]>(() => {
    if (!view || loading) return [];
    if (view.kind === "search") return searchResults.map(({ task, snippet }) => ({ kind: "task", key: task.id, task, open: !task.completedAt, snippet }));
    const out: Item[] = viewGhosts.map((ghost) => ({ kind: "ghost", key: ghost.key, title: ghost.title }));
    if (view.kind === "smart" && view.id === "planned") {
      const buckets = new Map<keyof typeof PLANNED_LABELS, Task[]>();
      for (const task of sorted) {
        const bucket = plannedBucket(task.dueDate!, today!);
        const tasks = buckets.get(bucket);
        if (tasks) tasks.push(task);
        else buckets.set(bucket, [task]);
      }
      for (const bucket of Object.keys(PLANNED_LABELS) as (keyof typeof PLANNED_LABELS)[]) {
        const tasks = buckets.get(bucket);
        if (!tasks) continue;
        out.push({ kind: "heading", key: `heading:${bucket}`, title: PLANNED_LABELS[bucket], count: tasks.length, tone: bucket === "overdue" ? "rose" : undefined });
        for (const task of tasks) out.push({ kind: "task", key: task.id, task, open: true });
      }
      return out;
    }
    for (const task of sorted) out.push({ kind: "task", key: task.id, task, open: true });
    if (showsCompleted && completed.length) {
      out.push({ kind: "completed", key: "completed-toggle", count: completed.length, open: completedOpen });
      if (completedOpen) for (const task of completed) out.push({ kind: "task", key: task.id, task, open: false });
    }
    return out;
  }, [view, loading, searchResults, viewGhosts, sorted, completed, today, showsCompleted, completedOpen]);

  // Every displayed task in display order: ranges, select all and arrow keys work on this, not on mounted rows.
  const taskOrder = useMemo(() => items.flatMap((item) => (item.kind === "task" ? [item.key] : [])), [items]);
  const orderIndex = useMemo(() => new Map(taskOrder.map((id, index) => [id, index])), [taskOrder]);

  // ---- Multi-selection ----------------------------------------------------------------------
  const [selection, setSelection] = useState<Selection>({ scope: scopeKey, ids: NONE, anchor: null });
  // Selections belong to one view and drop tasks that are no longer displayed.
  const validSelection = useMemo<Selection>(() => {
    if (selection.scope !== scopeKey) return { scope: scopeKey, ids: NONE, anchor: null };
    let stale = selection.anchor !== null && !orderIndex.has(selection.anchor);
    for (const id of selection.ids) if (!stale && !orderIndex.has(id)) stale = true;
    if (!stale) return selection;
    return {
      scope: scopeKey,
      ids: new Set([...selection.ids].filter((id) => orderIndex.has(id))),
      anchor: selection.anchor && orderIndex.has(selection.anchor) ? selection.anchor : null,
    };
  }, [selection, scopeKey, orderIndex]);
  if (validSelection !== selection) setSelection(validSelection);
  const selected = validSelection.ids;
  const selecting = selected.size > 0;

  // Row callbacks read the latest render's state through a ref, so their identity never changes.
  const latest = useRef<ViewHandlers | null>(null);
  useLayoutEffect(() => {
    const selectedOpen = (id: string) => (selected.has(id) && selected.size > 1 ? openIds.filter((other) => selected.has(other)) : [id]);
    const name = (block: string[]) => (block.length > 1 ? `${block.length} tasks` : `“${data.tasks[block[0]]?.title ?? "Task"}”`);
    const commitOrder = (next: string[], block: string[]) => {
      const slice = changedSlice(openIds, next);
      if (!slice) return;
      void actions.reorderTasks(slice);
      setAnnouncement(`Moved ${name(block)} to position ${next.indexOf(block[0]) + 1} of ${next.length}.`);
    };
    const focusTask = (id: string) => {
      setFocusId(id);
      listHandle.current?.reveal(id);
      let tries = 0;
      const attempt = () => {
        const row = document.getElementById(`task-row-${id}`);
        if (row) row.focus();
        else if (tries++ < 8) requestAnimationFrame(attempt);
      };
      requestAnimationFrame(attempt);
    };
    const toggleOne = (id: string) =>
      setSelection((current) => {
        const ids = new Set(current.ids);
        if (!ids.delete(id)) ids.add(id);
        return { scope: scopeKey, ids, anchor: id };
      });
    const selectRange = (id: string) =>
      setSelection((current) => {
        const anchor = current.anchor !== null && orderIndex.has(current.anchor) ? current.anchor : null;
        if (anchor === null || !orderIndex.has(id)) return { scope: scopeKey, ids: new Set([...current.ids, id]), anchor: id };
        const [from, to] = [orderIndex.get(anchor)!, orderIndex.get(id)!].sort((a, b) => a - b);
        const ids = new Set(current.ids);
        for (let index = from; index <= to; index++) ids.add(taskOrder[index]);
        return { scope: scopeKey, ids, anchor };
      });

    latest.current = {
      open(id, event) {
        if (event.shiftKey) {
          event.preventDefault();
          selectRange(id);
        } else if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          toggleOne(id);
        } else nav.select(nav.selectedId === id ? null : id);
      },
      toggleSelect: (id, range) => (range ? selectRange(id) : toggleOne(id)),
      toggle(task, done) {
        if (done && motion !== "off" && !prefersReducedMotion()) {
          addSettling(task.id);
          addCelebrating(task.id);
        }
        void actions.updateTask(task.id, { completed: done }, { failure: done ? "Task not completed" : "Task not reopened" });
      },
      remove: (task) => setDeleting(task),
      move(id, delta) {
        if (!canReorder || !openIndex.has(id)) {
          setAnnouncement("");
          toast.message(view?.kind === "list" ? "Switch the sort to Custom order to reorder tasks" : "Open a list to reorder its tasks");
          return;
        }
        const block = selectedOpen(id);
        commitOrder(moveBlockBy(openIds, block, delta), block);
        focusTask(id);
      },
      keyDown(id, event) {
        const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
        if (event.altKey && vertical) {
          event.preventDefault();
          latest.current?.move(id, event.key === "ArrowUp" ? -1 : 1);
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          setSelection({ scope: scopeKey, ids: new Set(taskOrder), anchor: id });
          setAnnouncement(`${taskOrder.length} tasks selected.`);
          return;
        }
        if (event.altKey || event.metaKey || event.ctrlKey || !(vertical || event.key === "Home" || event.key === "End")) return;
        const index = orderIndex.get(id) ?? 0;
        const next = taskOrder[event.key === "Home" ? 0 : event.key === "End" ? taskOrder.length - 1 : index + (event.key === "ArrowUp" ? -1 : 1)];
        if (!next || next === id) return;
        event.preventDefault();
        if (event.shiftKey) {
          setSelection((current) => ({ scope: scopeKey, ids: new Set([...current.ids, id, next]), anchor: current.anchor ?? id }));
        }
        focusTask(next);
      },
      dragStart: (id, event) => listHandle.current?.startDrag(id, event),
      dragBlock: selectedOpen,
      drop: (block, beforeId) => commitOrder(moveBlockBefore(openIds, block, beforeId), block),
    };
  });
  const handlers = useMemo<TaskRowHandlers>(
    () => ({
      open: (id, event) => latest.current?.open(id, event),
      toggleSelect: (id, range) => latest.current?.toggleSelect(id, range),
      toggle: (task, done) => latest.current?.toggle(task, done),
      remove: (task) => latest.current?.remove(task),
      move: (id, delta) => latest.current?.move(id, delta),
      keyDown: (id, event) => latest.current?.keyDown(id, event),
      dragStart: (id, event) => latest.current?.dragStart(id, event),
    }),
    [],
  );
  const reorder = useMemo<Reorder | null>(
    () =>
      canReorder && openIds.length > 1
        ? { ids: openIds, block: (id) => latest.current?.dragBlock(id) ?? [id], commit: (block, beforeId) => latest.current?.drop(block, beforeId) }
        : null,
    [canReorder, openIds],
  );
  const clearSelection = () => setSelection({ scope: scopeKey, ids: NONE, anchor: null });

  // Escape clears the selection unless something else (a field, dialog or menu) owns the key.
  useEffect(() => {
    if (!selecting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector("[role=dialog][data-state=open], [role=alertdialog][data-state=open], [role=menu][data-state=open], [role=listbox][data-state=open]")) return;
      event.preventDefault();
      setSelection((current) => ({ ...current, ids: NONE, anchor: null }));
      setAnnouncement("Selection cleared.");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selecting]);

  // Each view remembers its scroll position; a task opened by link is scrolled into view.
  const selectedIdRef = useRef(nav.selectedId);
  useLayoutEffect(() => {
    selectedIdRef.current = nav.selectedId;
  });
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const saved = scrollMemory.get(scopeKey);
    scroller.scrollTop = saved ?? 0;
    if (saved === undefined && selectedIdRef.current) listHandle.current?.reveal(selectedIdRef.current);
    const save = () => scrollMemory.set(scopeKey, scroller.scrollTop);
    scroller.addEventListener("scroll", save, { passive: true });
    return () => scroller.removeEventListener("scroll", save);
  }, [scopeKey]);

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

  const renderItem = (item: Item, flags: DragFlags): ReactNode => {
    if (item.kind === "ghost") return <GhostRow title={item.title} />;
    if (item.kind === "heading") {
      return (
        <h2 className={cn("flex items-center gap-2 px-1 pt-3 pb-0.5 text-sm font-semibold", item.tone === "rose" ? "text-rose" : "text-foreground/85")}>
          {item.title}
          <span className="font-normal text-muted-foreground tabular-nums">{item.count}</span>
        </h2>
      );
    }
    if (item.kind === "completed") {
      return (
        <div className="pt-3">
          <button
            type="button"
            aria-expanded={item.open}
            onClick={() =>
              view.kind === "list" ? void actions.updateList(list!.id, { showCompleted: !item.open }, { quiet: true }) : setSmartCompletedOpen(!item.open)
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground/[0.04] px-2.5 py-1.5 text-sm font-medium text-foreground/85 transition-colors outline-none hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-amethyst/60 motion-reduce:transition-none"
          >
            <ChevronRight aria-hidden className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", item.open && "rotate-90")} />
            Completed
            <span className="text-muted-foreground tabular-nums">{item.count}</span>
          </button>
        </div>
      );
    }
    const task = item.task;
    const index = canReorder && item.open && !task.completedAt ? openIndex.get(task.id) : undefined;
    const reorderable = index !== undefined;
    return (
      <TaskRow
        task={task}
        list={data.lists[task.listId]}
        entryTitle={task.entryId ? (data.entries[task.entryId]?.title ?? null) : null}
        steps={stepsByTask.get(task.id)}
        today={today}
        allLists={store.lists}
        actions={actions}
        selected={nav.selectedId === task.id}
        showList={view.kind !== "list"}
        showMyDay={!(view.kind === "smart" && view.id === "my-day")}
        celebrate={celebrating.has(task.id)}
        checkedOverride={settling.has(task.id) ? true : undefined}
        snippet={item.snippet}
        handlers={handlers}
        movable={reorderable}
        canMoveUp={reorderable && index > 0}
        canMoveDown={reorderable && index < openIds.length - 1}
        draggable={reorderable && reorder !== null}
        dragging={flags.dragging}
        lifted={flags.lifted}
        checked={selected.has(task.id)}
        selecting={selecting}
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
  // Content above the (virtualized) rows: empty states, search filters and result counts.
  let lead: ReactNode = null;
  if (loading) {
    lead = (
      <div className="space-y-1.5" aria-label="Loading tasks">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-[3.25rem] rounded-lg" />
        ))}
      </div>
    );
  } else if (view.kind === "search") {
    lead = (
      <div>
        <SearchFilters filters={{ statusFilter, importantOnly, dueOnly, listFilter }} setters={{ setStatusFilter, setImportantOnly, setDueOnly, setListFilter }} />
        {!query ? (
          <EmptyState compact icon={<SearchX aria-hidden className="size-7" />} title="Search your tasks" body="Titles, steps and notes are searched across every list." />
        ) : (
          <>
            <p className="mb-2 flex items-center gap-2 px-1 text-sm text-muted-foreground" aria-live="polite">
              {searchResults.length} {searchResults.length === 1 ? "result" : "results"}
              {notesSearch.isFetching ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" /> searching notes
                </span>
              ) : notesSearch.isError ? (
                <span className="text-rose">Notes couldn&apos;t be searched</span>
              ) : null}
            </p>
            {searchResults.length === 0 && !notesSearch.isFetching ? (
              <EmptyState compact icon={<SearchX aria-hidden className="size-7" />} title="No matches" body="Try another word or loosen the filters." />
            ) : null}
          </>
        )}
      </div>
    );
  } else if (sorted.length === 0 && viewGhosts.length === 0) {
    lead =
      view.kind === "list" ? (
        <EmptyState
          compact
          icon={<ListGlyph list={list!} className="size-7" />}
          title={completed.length ? "All done here" : "No tasks yet"}
          body={completed.length ? "Everything in this list is finished." : "Add a task above. Paste several lines to add them all at once."}
        />
      ) : (
        <ViewEmpty viewId={view.id} />
      );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {header}
      {addTarget ? <QuickAdd key={`${viewKey}:${addTarget.listId ?? "pick"}`} target={addTarget} /> : null}
      <div
        ref={scrollRef}
        data-task-scroll
        className={cn("relative min-h-0 flex-1 overflow-y-auto px-4 pt-1 sm:px-8", selecting ? "pb-44 md:pb-28" : "pb-24 md:pb-10")}
      >
        {lead}
        <VirtualTaskList
          ref={listHandle}
          items={items}
          scrollRef={scrollRef}
          label={view.kind === "search" ? "Search results" : `Tasks in ${title}`}
          estimate={estimateItem}
          render={renderItem}
          pinned={[focusId]}
          reorder={reorder}
          onFocusKey={setFocusId}
        />
      </div>
      {selecting ? (
        <SelectionBar
          ids={taskOrder.filter((id) => selected.has(id))}
          total={taskOrder.length}
          onSelectAll={() => {
            setSelection({ scope: scopeKey, ids: new Set(taskOrder), anchor: validSelection.anchor });
            setAnnouncement(`${taskOrder.length} tasks selected.`);
          }}
          onClear={clearSelection}
          onDeleted={(ids) => {
            if (nav.selectedId && ids.includes(nav.selectedId)) nav.select(null);
          }}
        />
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
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

type SearchFilterState = { statusFilter: "any" | "open" | "completed"; importantOnly: boolean; dueOnly: boolean; listFilter: string };

function SearchFilters({
  filters,
  setters,
}: {
  filters: SearchFilterState;
  setters: {
    setStatusFilter: (value: "any" | "open" | "completed") => void;
    setImportantOnly: (value: boolean) => void;
    setDueOnly: (value: boolean) => void;
    setListFilter: (value: string) => void;
  };
}) {
  const { lists } = useTasks();
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
  );
}

/** Bulk actions for the selected tasks; `ids` are in display order. */
function SelectionBar({
  ids,
  total,
  onSelectAll,
  onClear,
  onDeleted,
}: {
  ids: string[];
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  onDeleted: (ids: string[]) => void;
}) {
  const { data, lists, today, actions } = useTasks();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const tasks = ids.map((id) => data.tasks[id]).filter((task): task is Task => Boolean(task));
  const count = tasks.length;
  const allDone = tasks.every((task) => task.completedAt);
  const allStarred = tasks.every((task) => task.important);
  const allMyDay = today !== null && tasks.every((task) => task.myDayOn === today);

  async function run(targets: Task[], change: Parameters<typeof actions.bulkTasks>[1], label: string, clear = false) {
    if (!targets.length) return;
    setBusy(true);
    try {
      const result = await actions.bulkTasks(
        targets.map((task) => task.id),
        change,
        label,
      );
      if (clear && result.failed === 0) onClear();
      return result;
    } finally {
      setBusy(false);
    }
  }

  const due = (date: string | null) =>
    void run(
      tasks.filter((task) => task.dueDate !== date),
      { patch: { dueDate: date } },
      "updated",
    );

  const iconButton = "h-9 gap-1.5 px-2.5";
  return (
    <div
      role="toolbar"
      aria-label={`${count} selected tasks`}
      className="absolute inset-x-3 bottom-24 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-1 rounded-2xl border border-border/70 bg-popover/95 p-1.5 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-popover/80 sm:inset-x-6 md:bottom-5"
    >
      <span className="px-2 text-sm font-medium tabular-nums" aria-live="polite">
        {count} selected
      </span>
      {count < total ? (
        <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={onSelectAll} disabled={busy}>
          Select all {total}
        </Button>
      ) : null}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <Button
        variant="ghost"
        size="sm"
        className={iconButton}
        disabled={busy}
        onClick={() =>
          void run(
            tasks.filter((task) => Boolean(task.completedAt) === allDone),
            { patch: { completed: !allDone } },
            allDone ? "reopened" : "completed",
            true,
          )
        }
      >
        {allDone ? <RotateCcw aria-hidden className="size-4" /> : <CheckCircle2 aria-hidden className="size-4" />}
        <span className="max-sm:sr-only">{allDone ? "Reopen" : "Complete"}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={iconButton}
        disabled={busy}
        onClick={() =>
          void run(
            tasks.filter((task) => task.important === allStarred),
            { patch: { important: !allStarred } },
            "updated",
          )
        }
      >
        <Star aria-hidden className={cn("size-4", allStarred && "fill-current")} />
        <span className="max-sm:sr-only">{allStarred ? "Unstar" : "Star"}</span>
      </Button>
      {today ? (
        <Button
          variant="ghost"
          size="sm"
          className={iconButton}
          disabled={busy}
          onClick={() =>
            void run(
              tasks.filter((task) => (task.myDayOn === today) === allMyDay),
              { patch: { myDay: allMyDay ? null : today } },
              "updated",
            )
          }
        >
          <Sun aria-hidden className="size-4" />
          <span className="max-sm:sr-only">{allMyDay ? "Remove from My Day" : "Add to My Day"}</span>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={iconButton} disabled={busy}>
            <CalendarDays aria-hidden className="size-4" />
            <span className="max-sm:sr-only">Due</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top">
          <DropdownMenuLabel>Set due date</DropdownMenuLabel>
          {today ? (
            <>
              <DropdownMenuItem onSelect={() => due(today)}>Today</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => due(shiftDate(today, 1))}>Tomorrow</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => due(shiftDate(today, 7))}>In a week</DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem onSelect={() => due(null)}>Remove due date</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={iconButton} disabled={busy}>
            <FolderInput aria-hidden className="size-4" />
            <span className="max-sm:sr-only">Move</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="max-h-80 overflow-y-auto">
          <DropdownMenuLabel>Move to list</DropdownMenuLabel>
          {lists.map((list) => (
            <DropdownMenuItem
              key={list.id}
              onSelect={() =>
                void run(
                  tasks.filter((task) => task.listId !== list.id),
                  { patch: { listId: list.id } },
                  "moved",
                  true,
                )
              }
            >
              <ListGlyph list={list} className="size-4" />
              {list.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="sm" className={cn(iconButton, "text-rose hover:text-rose")} disabled={busy} onClick={() => setConfirming(true)}>
        <Trash2 aria-hidden className="size-4" />
        <span className="max-sm:sr-only">Delete</span>
      </Button>
      <span className="ml-auto flex items-center">
        {busy ? <Loader2 aria-label="Working" className="mr-1 size-4 animate-spin motion-reduce:animate-none" /> : null}
        <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2.5 text-muted-foreground" onClick={onClear} title="Clear selection (Esc)">
          <X aria-hidden className="size-4" />
          <span className="max-sm:sr-only">Clear</span>
        </Button>
      </span>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} {count === 1 ? "task" : "tasks"}?
            </AlertDialogTitle>
            <AlertDialogDescription>Their steps and notes are deleted too. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const targets = tasks.map((task) => task.id);
                void run(tasks, { delete: true }, "deleted", true).then(() => onDeleted(targets));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
