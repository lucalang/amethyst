"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  Eye,
  EyeOff,
  ListChecks,
  Loader2,
  MoreHorizontal,
  PanelTopOpen,
  Pencil,
  Plus,
  Star,
  StickyNote,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { MAX_ITEMS_PER_REQUEST, itemLabelSchema, splitLines } from "@/lib/validation/workspace";
import type { ChecklistItem, ChecklistStep, NodeDetail } from "@/lib/workspace/tree";
import { errorMessage, useLocalStorageValue, writeLocal } from "./client-utils";
import { describeDue, useToday } from "./due-date";
import { RoundCheck } from "./round-check";
import { SaveStatus, type SaveState } from "./save-status";
import { TaskDetails, notesBackupKey, type Outcome, type TaskActions, type TaskPatch } from "./task-details";

const COMPLETED_KEY = "archive:checklist:completed";

const byPosition = <T extends { id: string; position: number }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));

/**
 * Task list in the style of Microsoft To Do. Changes apply optimistically and
 * are sent one at a time in order, so rapid toggles can never arrive out of
 * order; failures roll the affected task back and are reported.
 */
export function ChecklistEditor({
  detail,
  autoFocus,
  onItemsChange,
}: {
  detail: NodeDetail;
  autoFocus?: boolean;
  onItemsChange: (fileId: string, items: ChecklistItem[]) => void;
}) {
  const fileId = detail.node.id;
  const name = detail.node.name;
  const [items, setItems] = useState(() => byPosition(detail.items));
  const [pending, setPending] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const storedCompleted = useLocalStorageValue(COMPLETED_KEY);
  const [completedOverride, setCompletedOverride] = useState<boolean | null>(null);
  const showCompleted = completedOverride ?? storedCompleted !== "hidden";
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const today = useToday();

  const active = items.filter((item) => !item.checked);
  const completed = items.filter((item) => item.checked);
  const state: SaveState = pending > 0 ? { kind: "saving" } : lastError ? { kind: "error", message: lastError } : { kind: "saved" };

  const report = useEffectEvent((next: ChecklistItem[]) => onItemsChange(fileId, next));
  useEffect(() => report(items), [items]);

  /** Run a server change after the previous one; `undo` restores local state on failure. */
  function run<T>(failure: string, op: () => Promise<T>, undo?: () => void): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
    setPending((count) => count + 1);
    const task = chainRef.current.then(op);
    chainRef.current = task.catch(() => undefined);
    return task
      .then(
        (value) => {
          setLastError(null);
          return { ok: true as const, value };
        },
        (error: unknown) => {
          undo?.();
          const message = errorMessage(error);
          setLastError(message);
          toast.error(`${failure}: ${message}`);
          return { ok: false as const, message };
        },
      )
      .finally(() => setPending((count) => count - 1));
  }

  async function resync() {
    try {
      const latest = await apiFetch<NodeDetail>(`/api/nodes/${fileId}`);
      setItems(byPosition(latest.items));
    } catch {
      // The failure itself was already reported.
    }
  }

  function updateLocal(id: string, change: (item: ChecklistItem) => ChecklistItem) {
    setItems((current) => current.map((candidate) => (candidate.id === id ? change(candidate) : candidate)));
  }

  async function patchItem(item: ChecklistItem, patch: TaskPatch, failure: string, options: { revert?: boolean } = {}): Promise<Outcome> {
    const previous = Object.fromEntries(Object.keys(patch).map((key) => [key, item[key as keyof TaskPatch]])) as TaskPatch;
    updateLocal(item.id, (candidate) => ({ ...candidate, ...patch }));
    const result = await run(
      failure,
      () => apiFetch(`/api/items/${item.id}`, { method: "PATCH", json: patch }),
      options.revert === false ? undefined : () => updateLocal(item.id, (candidate) => ({ ...candidate, ...previous })),
    );
    return result.ok ? { ok: true } : result;
  }

  function setSteps(itemId: string, change: (steps: ChecklistStep[]) => ChecklistStep[]) {
    updateLocal(itemId, (candidate) => ({ ...candidate, steps: change(candidate.steps) }));
  }

  const actions: TaskActions = {
    patchItem,
    async addStep(item, label) {
      const result = await run("Step not added", () => apiFetch<{ step: ChecklistStep }>(`/api/items/${item.id}/steps`, { method: "POST", json: { label } }));
      if (!result.ok) return result;
      setSteps(item.id, (steps) => [...steps, result.value.step]);
      return { ok: true };
    },
    patchStep(item, step, patch) {
      const apply = (values: { label?: string; checked?: boolean }) =>
        setSteps(item.id, (steps) => steps.map((candidate) => (candidate.id === step.id ? { ...candidate, ...values } : candidate)));
      apply(patch);
      void run(
        "Step not saved",
        () => apiFetch(`/api/steps/${step.id}`, { method: "PATCH", json: patch }),
        () => apply({ label: step.label, checked: step.checked }),
      );
    },
    removeStep(item, step) {
      setSteps(item.id, (steps) => steps.filter((candidate) => candidate.id !== step.id));
      void run(
        "Step not deleted",
        () => apiFetch(`/api/steps/${step.id}`, { method: "DELETE" }),
        () => setSteps(item.id, (steps) => byPosition([...steps, step])),
      );
    },
    moveStep(item, index, delta) {
      const target = index + delta;
      if (target < 0 || target >= item.steps.length) return;
      const ordered = [...item.steps];
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      const next = ordered.map((step, position) => ({ ...step, position }));
      setSteps(item.id, () => next);
      void run(
        "Step order not saved",
        () => apiFetch(`/api/items/${item.id}/steps`, { method: "PUT", json: { stepIds: next.map((step) => step.id) } }),
        () => setSteps(item.id, () => item.steps),
      );
    },
    remove(item) {
      const extras = [item.steps.length ? `${item.steps.length} step${item.steps.length === 1 ? "" : "s"}` : "", item.notes.trim() ? "notes" : ""].filter(Boolean);
      if (extras.length && !window.confirm(`Delete “${item.label}” and its ${extras.join(" and ")}?`)) return;
      if (expandedId === item.id) setExpandedId(null);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      void run(
        `“${item.label}” not deleted`,
        () => apiFetch(`/api/items/${item.id}`, { method: "DELETE" }),
        () => setItems((current) => byPosition([...current, item])),
      ).then((result) => {
        if (result.ok) writeLocal(notesBackupKey(item.id), null);
      });
    },
  };

  function toggle(item: ChecklistItem, checked: boolean) {
    void patchItem(item, { checked }, `“${item.label}” not saved`);
  }

  function setAll(checked: boolean) {
    const changing = items.filter((item) => item.checked !== checked).length;
    if (changing === 0) return;
    if (!checked && completed.length > 3 && !window.confirm(`Mark all ${completed.length} completed tasks in “${name}” as not completed?`)) return;
    setItems((current) => current.map((item) => ({ ...item, checked })));
    void run("Checklist not saved", () => apiFetch(`/api/nodes/${fileId}/items`, { method: "PATCH", json: { checked } }), () => void resync());
  }

  /** Move a task within its section (active or completed). */
  function move(item: ChecklistItem, delta: number) {
    const section = item.checked ? completed : active;
    const index = section.findIndex((candidate) => candidate.id === item.id);
    const neighbour = section[index + delta];
    if (!neighbour) return;
    const ordered = [...items];
    const from = ordered.findIndex((candidate) => candidate.id === item.id);
    const to = ordered.findIndex((candidate) => candidate.id === neighbour.id);
    [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
    const next = ordered.map((candidate, position) => ({ ...candidate, position }));
    setItems(next);
    void run("Order not saved", () => apiFetch(`/api/nodes/${fileId}/items`, { method: "PUT", json: { itemIds: next.map((candidate) => candidate.id) } }), () => void resync());
    requestAnimationFrame(() => document.getElementById(`task-${item.id}`)?.focus());
  }

  function rename(item: ChecklistItem, label: string) {
    const parsed = itemLabelSchema.safeParse(label);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid task name.");
      return;
    }
    if (parsed.data !== item.label) void patchItem(item, { label: parsed.data }, "Rename not saved");
  }

  async function addTasks(labels: string[]): Promise<boolean> {
    const result = await run("Tasks not added", () =>
      apiFetch<{ items: ChecklistItem[] }>(`/api/nodes/${fileId}/items`, { method: "POST", json: { labels } }),
    );
    if (!result.ok) return false;
    setItems((current) => byPosition([...current, ...result.value.items]));
    return true;
  }

  function setCompletedVisible(visible: boolean) {
    setCompletedOverride(visible);
    writeLocal(COMPLETED_KEY, visible ? null : "hidden");
  }

  const rowProps = (item: ChecklistItem, index: number, section: ChecklistItem[]) => ({
    item,
    today,
    expanded: expandedId === item.id,
    first: index === 0,
    last: index === section.length - 1,
    actions,
    onToggle: (checked: boolean) => toggle(item, checked),
    onExpand: () => setExpandedId((current) => (current === item.id ? null : item.id)),
    onMove: (delta: number) => move(item, delta),
    onRename: (label: string) => rename(item, label),
  });

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-[6.25rem] z-10 flex min-h-11 items-center justify-between gap-3 border-b border-border bg-black/90 px-4 backdrop-blur md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {items.length === 0 ? "No tasks" : `${completed.length} of ${items.length} completed`}
          </span>
          {items.length > 0 ? (
            <span aria-hidden className="hidden h-1 w-24 overflow-hidden rounded-full bg-white/[0.07] sm:block">
              <span
                className="block h-full rounded-full bg-amethyst transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${(completed.length / items.length) * 100}%` }}
              />
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <SaveStatus state={state} />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Checklist options" className="text-muted-foreground">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
              <DropdownMenuItem disabled={active.length === 0} onSelect={() => setAll(true)}>
                <CheckCheck aria-hidden /> Complete all tasks
              </DropdownMenuItem>
              <DropdownMenuItem disabled={completed.length === 0} onSelect={() => setAll(false)}>
                <Undo2 aria-hidden /> Mark all as not completed
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCompletedVisible(!showCompleted)}>
                {showCompleted ? <EyeOff aria-hidden /> : <Eye aria-hidden />} {showCompleted ? "Hide completed tasks" : "Show completed tasks"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="w-full max-w-[52rem] px-2 py-5 md:px-6">
        {active.length > 0 ? (
          <ul aria-label={`${name} tasks`} className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {active.map((item, index) => (
              <TaskRow key={item.id} {...rowProps(item, index, active)} />
            ))}
          </ul>
        ) : (
          <p className="px-3 pb-2 text-sm text-muted-foreground">
            {items.length === 0 ? "No tasks yet. Add your first one below." : "Everything here is done."}
          </p>
        )}

        <AddTask name={name} autoFocus={autoFocus} onAdd={addTasks} />

        {completed.length > 0 ? (
          <section className="mt-8">
            <h3>
              <button
                type="button"
                aria-expanded={showCompleted}
                aria-controls={`completed-${fileId}`}
                onClick={() => setCompletedVisible(!showCompleted)}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-white/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronRight aria-hidden className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", showCompleted && "rotate-90")} />
                Completed
                <span className="rounded-full bg-white/[0.07] px-2 py-px text-xs tabular-nums">{completed.length}</span>
              </button>
            </h3>
            {showCompleted ? (
              <ul id={`completed-${fileId}`} aria-label={`${name} completed tasks`} className="mt-2 divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {completed.map((item, index) => (
                  <TaskRow key={item.id} {...rowProps(item, index, completed)} />
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function TaskRow({
  item,
  today,
  expanded,
  first,
  last,
  actions,
  onToggle,
  onExpand,
  onMove,
  onRename,
}: {
  item: ChecklistItem;
  today: string | null;
  expanded: boolean;
  first: boolean;
  last: boolean;
  actions: TaskActions;
  onToggle: (checked: boolean) => void;
  onExpand: () => void;
  onMove: (delta: number) => void;
  onRename: (label: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const renamingRef = useRef(false);
  const doneSteps = item.steps.filter((step) => step.checked).length;
  const due = item.dueDate ? describeDue(item.dueDate, today) : null;
  const overdue = due?.overdue && !item.checked;
  const hasMeta = item.steps.length > 0 || due || item.notes.trim() !== "";
  const detailsId = `task-details-${item.id}`;

  function commitRename() {
    if (editing === null) return;
    const value = editing;
    setEditing(null);
    onRename(value);
  }

  return (
    <li className={cn("group/task transition-colors", expanded ? "bg-white/[0.03]" : "hover:bg-white/[0.025]")}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        <RoundCheck checked={item.checked} label={item.label} onCheckedChange={onToggle} className="mt-[3px]" />
        {editing !== null ? (
          <input
            autoFocus
            value={editing}
            maxLength={500}
            aria-label="Task name"
            onChange={(event) => setEditing(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setEditing(null);
              }
            }}
            className="-my-0.5 h-8 min-w-0 flex-1 rounded-sm bg-white/[0.04] px-2 text-[15px] ring-1 ring-amethyst/50 outline-none"
          />
        ) : (
          <button
            id={`task-${item.id}`}
            type="button"
            aria-expanded={expanded}
            aria-controls={expanded ? detailsId : undefined}
            onClick={onExpand}
            onKeyDown={(event) => {
              if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                event.preventDefault();
                onMove(event.key === "ArrowUp" ? -1 : 1);
              } else if (event.key === "F2") {
                event.preventDefault();
                setEditing(item.label);
              }
            }}
            className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-4 focus-visible:ring-offset-black"
          >
            <span
              className={cn(
                "block text-[15px] leading-6 break-words transition-colors",
                item.checked ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground",
              )}
            >
              {item.label}
            </span>
            {hasMeta ? (
              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {item.steps.length > 0 ? (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <ListChecks aria-hidden className="size-3.5" />
                    {doneSteps} of {item.steps.length}
                  </span>
                ) : null}
                {due ? (
                  <span className={cn("inline-flex items-center gap-1", overdue && "text-rose")}>
                    <CalendarDays aria-hidden className="size-3.5" />
                    {overdue ? `Overdue · ${due.text}` : due.text}
                  </span>
                ) : null}
                {item.notes.trim() ? (
                  <span className="inline-flex items-center gap-1">
                    <StickyNote aria-hidden className="size-3.5" /> Note
                  </span>
                ) : null}
              </span>
            ) : null}
          </button>
        )}
        <button
          type="button"
          aria-pressed={item.starred}
          aria-label={item.starred ? `Remove importance from ${item.label}` : `Mark ${item.label} as important`}
          onClick={() => void actions.patchItem(item, { starred: !item.starred }, "Importance not saved")}
          className={cn(
            "-my-0.5 grid size-8 shrink-0 place-items-center rounded-md transition-colors outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-ring/60",
            item.starred ? "text-rose" : "text-muted-foreground/60 hover:text-foreground",
          )}
        >
          <Star aria-hidden className={cn("size-4", item.starred && "fill-current")} />
        </button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${item.label}`}
              className="-my-0.5 text-muted-foreground opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(event) => event.stopPropagation()}
            onCloseAutoFocus={(event) => {
              if (renamingRef.current) event.preventDefault();
              renamingRef.current = false;
            }}
          >
            <DropdownMenuItem onSelect={onExpand}>
              <PanelTopOpen aria-hidden /> {expanded ? "Hide details" : "Show details"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                renamingRef.current = true;
                setEditing(item.label);
              }}
            >
              <Pencil aria-hidden /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
              <ArrowUp aria-hidden /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
              <ArrowDown aria-hidden /> Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => actions.remove(item)}>
              <Trash2 aria-hidden /> Delete task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded ? <TaskDetails id={detailsId} item={item} today={today} actions={actions} /> : null}
    </li>
  );
}

function AddTask({ name, autoFocus, onAdd }: { name: string; autoFocus?: boolean; onAdd: (labels: string[]) => Promise<boolean> }) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lines = splitLines(draft);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lines.length === 0) return;
    for (const label of lines) {
      const parsed = itemLabelSchema.safeParse(label);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Invalid task name.");
        return;
      }
    }
    if (lines.length > MAX_ITEMS_PER_REQUEST) {
      toast.error(`Add at most ${MAX_ITEMS_PER_REQUEST} tasks at once.`);
      return;
    }
    setAdding(true);
    const ok = await onAdd(lines);
    setAdding(false);
    if (ok) {
      setDraft((current) => (current === draft ? "" : current));
      inputRef.current?.focus();
    }
  }

  return (
    <form onSubmit={submit} className="mt-2">
      <div className="flex items-start gap-3 rounded-md px-3 py-2 transition-colors focus-within:bg-white/[0.03] hover:bg-white/[0.02]">
        <span className="mt-[3px] grid size-5 shrink-0 place-items-center text-amethyst">
          {adding ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Plus aria-hidden className="size-5" />}
        </span>
        <textarea
          ref={inputRef}
          rows={1}
          aria-label={`Add a task to ${name}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Add a task"
          maxLength={100_000}
          className="max-h-48 min-h-6 min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-6 outline-none [field-sizing:content] placeholder:text-amethyst/90 focus:placeholder:text-muted-foreground/70"
        />
        {draft.trim() ? (
          <Button type="submit" size="sm" className="-my-0.5 h-7" disabled={adding}>
            Add
          </Button>
        ) : null}
      </div>
      <p className="mt-1 px-3 pl-11 text-xs text-muted-foreground" aria-live="polite">
        {lines.length > 1 ? `${lines.length} tasks will be added, one per line.` : draft ? "Enter adds the task. Shift+Enter starts a new line." : ""}
      </p>
    </form>
  );
}
