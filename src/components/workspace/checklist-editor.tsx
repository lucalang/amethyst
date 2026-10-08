"use client";

import { Fragment, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  ClipboardList,
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
import { InlineNameForm } from "./inline-name-form";

const COMPLETED_KEY = "archive:checklist:completed";
/** How long a just-completed task stays in place so the check and strike-through can play. */
const SETTLE_MS = 520;
const FRESH_MS = 600;

const byPosition = <T extends { id: string; position: number }>(list: readonly T[]) =>
  [...list].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A set of ids that each drop out again after `ms`. */
function useTransientIds(ms: number) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  function add(added: readonly string[], onDone?: () => void) {
    if (added.length === 0) return;
    setIds((current) => new Set([...current, ...added]));
    window.setTimeout(() => {
      setIds((current) => new Set([...current].filter((id) => !added.includes(id))));
      onDone?.();
    }, ms);
  }
  return [ids, add] as const;
}

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
  const [settling, addSettling] = useTransientIds(SETTLE_MS);
  const [fresh, addFresh] = useTransientIds(FRESH_MS);
  const storedCompleted = useLocalStorageValue(COMPLETED_KEY);
  const [completedOverride, setCompletedOverride] = useState<boolean | null>(null);
  const showCompleted = completedOverride ?? storedCompleted !== "hidden";
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const today = useToday();

  // Just-completed tasks linger in the active list until their completion feedback has played.
  const active = items.filter((item) => !item.checked || settling.has(item.id));
  const completed = items.filter((item) => item.checked && !settling.has(item.id));
  const doneCount = items.filter((item) => item.checked).length;
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
    async patchStep(item, step, patch) {
      const apply = (values: { label?: string; checked?: boolean }) =>
        setSteps(item.id, (steps) => steps.map((candidate) => (candidate.id === step.id ? { ...candidate, ...values } : candidate)));
      apply(patch);
      const result = await run(
        "Step not saved",
        () => apiFetch(`/api/steps/${step.id}`, { method: "PATCH", json: patch }),
        () => apply({ label: step.label, checked: step.checked }),
      );
      return result.ok ? { ok: true } : result;
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
    if (checked && !prefersReducedMotion()) addSettling([item.id], () => addFresh([item.id]));
    else addFresh([item.id]);
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

  async function rename(item: ChecklistItem, label: string): Promise<string | null> {
    const parsed = itemLabelSchema.safeParse(label);
    if (!parsed.success) {
      return parsed.error.issues[0]?.message ?? "Invalid task name.";
    }
    if (parsed.data === item.label) return null;
    const result = await patchItem(item, { label: parsed.data }, "Rename not saved");
    return result.ok ? null : result.message;
  }

  async function addTasks(labels: string[]): Promise<boolean> {
    const result = await run("Tasks not added", () =>
      apiFetch<{ items: ChecklistItem[] }>(`/api/nodes/${fileId}/items`, { method: "POST", json: { labels } }),
    );
    if (!result.ok) return false;
    setItems((current) => byPosition([...current, ...result.value.items]));
    addFresh(result.value.items.map((item) => item.id));
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
    celebrate: settling.has(item.id),
    fresh: fresh.has(item.id),
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
            {items.length === 0 ? "No tasks" : `${doneCount} of ${items.length} completed`}
          </span>
          {items.length > 0 ? (
            <span aria-hidden className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.07] sm:block">
              <span
                className="block h-full rounded-full bg-[linear-gradient(90deg,var(--amethyst),var(--rose))] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${(doneCount / items.length) * 100}%` }}
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

      <div className="enter enter-soft w-full max-w-[54rem] px-3 pt-5 pb-10 md:px-8 md:pt-7">
        {active.length > 0 ? (
          <ul aria-label={`${name} tasks`} className="space-y-1.5">
            {active.map((item, index) => (
              <TaskRow key={item.id} {...rowProps(item, index, active)} />
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-white/[0.08] px-4 py-5 text-sm text-muted-foreground">
            <ClipboardList aria-hidden className="size-5 shrink-0 text-amethyst/70" />
            {items.length === 0 ? "No tasks yet. Add your first one below." : "Everything here is done. Nice."}
          </div>
        )}

        <AddTask name={name} autoFocus={autoFocus} onAdd={addTasks} />

        {completed.length > 0 ? (
          <section className="mt-7">
            <h3>
              <button
                type="button"
                aria-expanded={showCompleted}
                aria-controls={`completed-${fileId}`}
                onClick={() => setCompletedVisible(!showCompleted)}
                className="group/completed inline-flex h-8 items-center gap-1.5 rounded-md bg-white/[0.05] pr-2.5 pl-1.5 text-[13px] font-semibold text-foreground/90 ring-1 ring-white/[0.06] transition-[background-color,box-shadow,color] duration-200 outline-none ring-inset hover:bg-white/[0.09] hover:text-foreground hover:ring-amethyst/35 focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-[0.97]"
              >
                <ChevronRight
                  aria-hidden
                  className={cn("size-4 text-muted-foreground transition-[rotate,color] duration-300 ease-out group-hover/completed:text-amethyst", showCompleted && "rotate-90")}
                />
                Completed
                <span className="ml-0.5 text-muted-foreground tabular-nums">{completed.length}</span>
              </button>
            </h3>
            {showCompleted ? (
              <ul id={`completed-${fileId}`} aria-label={`${name} completed tasks`} className="enter enter-drop mt-2.5 space-y-1.5">
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
  celebrate,
  fresh,
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
  celebrate: boolean;
  fresh: boolean;
  first: boolean;
  last: boolean;
  actions: TaskActions;
  onToggle: (checked: boolean) => void;
  onExpand: () => void;
  onMove: (delta: number) => void;
  onRename: (label: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const renamingRef = useRef(false);
  const doneSteps = item.steps.filter((step) => step.checked).length;
  const due = item.dueDate ? describeDue(item.dueDate, today) : null;
  const overdue = Boolean(due?.overdue && !item.checked);
  const dueToday = Boolean(item.dueDate && item.dueDate === today && !item.checked);
  const meta = [
    item.steps.length > 0 ? (
      <span key="steps" className={cn("inline-flex items-center gap-1 tabular-nums", doneSteps === item.steps.length && "text-amethyst/90")}>
        <ListChecks aria-hidden className="size-3.5" />
        {doneSteps} of {item.steps.length}
      </span>
    ) : null,
    due ? (
      <span key="due" className={cn("inline-flex items-center gap-1", overdue ? "text-rose" : dueToday && "text-amethyst")}>
        <CalendarDays aria-hidden className="size-3.5" />
        {overdue ? `Overdue · ${due.text}` : due.text}
      </span>
    ) : null,
    item.notes.trim() ? (
      <span key="note" className="inline-flex items-center gap-1">
        <StickyNote aria-hidden className="size-3.5" /> Note
      </span>
    ) : null,
  ].filter(Boolean);
  const detailsId = `task-details-${item.id}`;

  return (
    <li
      className={cn(
        "task-row group/task relative rounded-lg transition-[background-color,box-shadow] duration-200 ease-out",
        expanded
          ? "bg-[#140f1e] shadow-[inset_0_0_0_1px_rgb(165_124_255/0.38),0_18px_40px_-26px_rgb(165_124_255/0.8)]"
          : item.checked
            ? "bg-white/[0.022] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.035)] hover:bg-white/[0.045]"
            : "bg-white/[0.04] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.05)] hover:bg-[#15111d] hover:shadow-[inset_0_0_0_1px_rgb(165_124_255/0.3),0_10px_28px_-20px_rgb(165_124_255/0.9)]",
        "has-[[data-row-button]:focus-visible]:shadow-[inset_0_0_0_2px_var(--amethyst)]",
        fresh && "task-in",
      )}
    >
      <div className="flex min-h-[3.25rem] items-center gap-3.5 py-1.5 pr-2 pl-4">
        <RoundCheck checked={item.checked} label={item.label} onCheckedChange={onToggle} celebrate={celebrate} />
        {editing !== null ? (
          <InlineNameForm
            initial={editing}
            inputId={`task-name-${item.id}`}
            maxLength={500}
            label="Task name"
            onCancel={() => setEditing(null)}
            onSave={async (value) => {
              const message = await onRename(value);
              if (!message) setEditing(null);
              return message;
            }}
          />
        ) : (
          <button
            id={`task-${item.id}`}
            data-row-button
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
            className="min-w-0 flex-1 self-stretch py-1.5 text-left outline-none"
          >
            <span className="block text-[14.5px] leading-5 break-words">
              <span
                className={cn(
                  "bg-[linear-gradient(currentColor,currentColor)] [box-decoration-break:clone] bg-no-repeat [background-position:0_58%] transition-[background-size,color] duration-300 ease-out",
                  item.checked ? "bg-[length:100%_1.5px] text-muted-foreground" : "bg-[length:0%_1.5px] text-foreground",
                )}
              >
                {item.label}
              </span>
            </span>
            {meta.length > 0 ? (
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                {meta.map((part, index) => (
                  <Fragment key={index}>
                    {index > 0 ? (
                      <span aria-hidden className="text-white/20">
                        •
                      </span>
                    ) : null}
                    {part}
                  </Fragment>
                ))}
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
            "task-star group/star grid size-9 shrink-0 place-items-center rounded-full transition-[background-color,color] duration-200 outline-none hover:bg-rose/10 focus-visible:ring-2 focus-visible:ring-rose/60 active:scale-90",
            item.starred ? "text-rose" : "text-muted-foreground/70 hover:text-rose",
          )}
        >
          <Star
            aria-hidden
            className={cn(
              "size-[1.1rem] transition-[scale,rotate,filter] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/star:scale-125 group-hover/star:rotate-[18deg]",
              item.starred && "fill-current drop-shadow-[0_0_6px_rgb(244_114_168/0.7)]",
            )}
          />
        </button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${item.label}`}
              className="text-muted-foreground opacity-0 transition-[opacity,background-color,color] group-hover/task:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(event) => event.stopPropagation()}
            onCloseAutoFocus={(event) => {
              if (renamingRef.current) {
                event.preventDefault();
                document.getElementById(`task-name-${item.id}`)?.focus();
              }
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
    // Docked like To Do's input: stays reachable at the bottom while scrolling long lists.
    <form onSubmit={submit} className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[5] mt-1.5 md:bottom-4">
      <div
        className={cn(
          "group/add flex min-h-[3.25rem] cursor-text items-center gap-3.5 rounded-lg bg-[#0e0b14] py-1.5 pr-2 pl-4 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07),0_-10px_28px_-14px_rgb(0_0_0/0.95)] transition-[background-color,box-shadow] duration-200",
          "hover:bg-[#130f1b] hover:shadow-[inset_0_0_0_1px_rgb(165_124_255/0.25),0_-10px_28px_-14px_rgb(0_0_0/0.95)]",
          "focus-within:bg-[#130f1b] focus-within:shadow-[inset_0_0_0_1px_rgb(165_124_255/0.6),0_0_0_3px_rgb(165_124_255/0.12),0_-10px_28px_-14px_rgb(0_0_0/0.95)]",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <span className="grid size-5 shrink-0 place-items-center text-amethyst">
          {adding ? (
            <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <>
              <Plus aria-hidden className="size-5 transition-[rotate,scale] duration-300 group-hover/add:rotate-90 group-focus-within/add:hidden" />
              <span aria-hidden className="hidden size-5 rounded-full border-[1.5px] border-white/35 group-focus-within/add:block" />
            </>
          )}
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
          className="max-h-48 min-h-5 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[14.5px] leading-5 outline-none [field-sizing:content] placeholder:font-medium placeholder:text-amethyst group-focus-within/add:placeholder:font-normal group-focus-within/add:placeholder:text-muted-foreground/70"
        />
        {draft.trim() ? (
          <Button type="submit" size="sm" className="enter enter-soft h-8 px-3" disabled={adding}>
            Add
          </Button>
        ) : null}
      </div>
      <p className="mt-1.5 pl-[3.1rem] text-xs text-muted-foreground empty:hidden" aria-live="polite">
        {lines.length > 1 ? `${lines.length} tasks will be added, one per line.` : draft ? "Enter adds the task. Shift+Enter starts a new line." : ""}
      </p>
    </form>
  );
}
