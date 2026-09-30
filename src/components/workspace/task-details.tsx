"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, MoreHorizontal, Pencil, Plus, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MAX_TASK_NOTES_LENGTH, dueDateSchema, itemLabelSchema } from "@/lib/validation/workspace";
import type { ChecklistItem, ChecklistStep } from "@/lib/workspace/tree";
import { readLocal, writeLocal } from "./client-utils";
import { addDays, describeDue } from "./due-date";
import { RoundCheck } from "./round-check";
import { SaveStatus, type SaveState } from "./save-status";

export type TaskPatch = Partial<Pick<ChecklistItem, "label" | "checked" | "notes" | "starred" | "dueDate">>;
export type Outcome = { ok: true } | { ok: false; message: string };

export type TaskActions = {
  patchItem: (item: ChecklistItem, patch: TaskPatch, failure: string, options?: { revert?: boolean }) => Promise<Outcome>;
  addStep: (item: ChecklistItem, label: string) => Promise<Outcome>;
  patchStep: (item: ChecklistItem, step: ChecklistStep, patch: { label?: string; checked?: boolean }) => void;
  removeStep: (item: ChecklistItem, step: ChecklistStep) => void;
  moveStep: (item: ChecklistItem, index: number, delta: number) => void;
  remove: (item: ChecklistItem) => void;
};

export const notesBackupKey = (itemId: string) => `archive:task-notes:${itemId}`;

const SECTION_LABEL = "text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase";

/** Expanded view of one task: steps, due date and notes. */
export function TaskDetails({ id, item, today, actions }: { id: string; item: ChecklistItem; today: string | null; actions: TaskActions }) {
  return (
    <div id={id} role="region" aria-label={`Details for ${item.label}`} className="task-details space-y-5 pt-1 pr-3 pb-5 pl-11 md:pr-4">
      <Steps item={item} actions={actions} />
      <DueDate item={item} today={today} actions={actions} />
      <Notes item={item} actions={actions} />
      <div className="flex justify-end border-t border-white/[0.06] pt-3">
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => actions.remove(item)}>
          <Trash2 aria-hidden /> Delete task
        </Button>
      </div>
    </div>
  );
}

function Steps({ item, actions }: { item: ChecklistItem; actions: TaskActions }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const done = item.steps.filter((step) => step.checked).length;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const parsed = itemLabelSchema.safeParse(draft);
    if (!parsed.success) {
      if (draft.trim()) toast.error(parsed.error.issues[0]?.message ?? "Invalid step.");
      return;
    }
    setBusy(true);
    const outcome = await actions.addStep(item, parsed.data);
    setBusy(false);
    if (outcome.ok) setDraft((current) => (current === draft ? "" : current));
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h4 className={SECTION_LABEL}>Steps</h4>
        {item.steps.length > 0 ? (
          <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${done} of ${item.steps.length} steps completed`}>
            {done} of {item.steps.length}
          </span>
        ) : null}
      </div>
      {item.steps.length > 0 ? (
        <ol className="mt-1.5 divide-y divide-white/[0.05]">
          {item.steps.map((step, index) => (
            <StepRow key={step.id} item={item} step={step} index={index} actions={actions} />
          ))}
        </ol>
      ) : null}
      <form onSubmit={add} className="mt-1 flex items-center gap-3 py-1">
        <Plus aria-hidden className="size-4 shrink-0 text-amethyst" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          disabled={busy}
          aria-label={`Add a step to ${item.label}`}
          placeholder={item.steps.length ? "Next step" : "Add step"}
          className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/80 disabled:opacity-60"
        />
      </form>
    </div>
  );
}

function StepRow({ item, step, index, actions }: { item: ChecklistItem; step: ChecklistStep; index: number; actions: TaskActions }) {
  const [editing, setEditing] = useState<string | null>(null);
  const renamingRef = useRef(false);

  function commit() {
    if (editing === null) return;
    const parsed = itemLabelSchema.safeParse(editing);
    setEditing(null);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid step.");
      return;
    }
    if (parsed.data !== step.label) actions.patchStep(item, step, { label: parsed.data });
  }

  function move(delta: number) {
    actions.moveStep(item, index, delta);
    requestAnimationFrame(() => document.getElementById(`step-${step.id}`)?.focus());
  }

  return (
    <li className="group/step flex min-h-10 items-center gap-3">
      <RoundCheck size="sm" checked={step.checked} label={step.label} onCheckedChange={(checked) => actions.patchStep(item, step, { checked })} />
      {editing !== null ? (
        <input
          autoFocus
          value={editing}
          maxLength={500}
          aria-label="Step name"
          onChange={(event) => setEditing(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setEditing(null);
            }
          }}
          className="h-8 min-w-0 flex-1 rounded-sm bg-white/[0.04] px-2 text-sm ring-1 ring-amethyst/50 outline-none"
        />
      ) : (
        <button
          id={`step-${step.id}`}
          type="button"
          title="Rename (Alt+↑/↓ to reorder)"
          onClick={() => setEditing(step.label)}
          onKeyDown={(event) => {
            if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
              event.preventDefault();
              move(event.key === "ArrowUp" ? -1 : 1);
            }
          }}
          className={cn(
            "min-w-0 flex-1 rounded-sm py-2 text-left text-sm break-words outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            step.checked && "text-muted-foreground line-through decoration-muted-foreground/50",
          )}
        >
          {step.label}
        </button>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for step ${step.label}`}
            className="text-muted-foreground opacity-0 group-hover/step:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
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
          <DropdownMenuItem
            onSelect={() => {
              renamingRef.current = true;
              setEditing(step.label);
            }}
          >
            <Pencil aria-hidden /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === 0} onSelect={() => move(-1)}>
            <ArrowUp aria-hidden /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === item.steps.length - 1} onSelect={() => move(1)}>
            <ArrowDown aria-hidden /> Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => actions.removeStep(item, step)}>
            <Trash2 aria-hidden /> Delete step
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function DueDate({ item, today, actions }: { item: ChecklistItem; today: string | null; actions: TaskActions }) {
  const [draft, setDraft] = useState(item.dueDate ?? "");
  const timerRef = useRef<number | undefined>(undefined);
  const inputId = `due-${item.id}`;
  const due = item.dueDate ? describeDue(item.dueDate, today) : null;

  function commit(value: string) {
    window.clearTimeout(timerRef.current);
    const next = value === "" ? null : value;
    if (next === item.dueDate) return;
    if (next !== null && !dueDateSchema.safeParse(next).success) return;
    void actions.patchItem(item, { dueDate: next }, "Due date not saved").then((outcome) => {
      if (!outcome.ok) setDraft(item.dueDate ?? "");
    });
  }

  function choose(value: string) {
    setDraft(value);
    commit(value);
  }

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return (
    <div>
      <label htmlFor={inputId} className={SECTION_LABEL}>
        Due date
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <CalendarDays aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id={inputId}
            type="date"
            min="1900-01-01"
            max="2999-12-31"
            value={draft}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              window.clearTimeout(timerRef.current);
              timerRef.current = window.setTimeout(() => commit(value), 700);
            }}
            onBlur={(event) => commit(event.target.value)}
            className="h-9 rounded-md border border-border bg-white/[0.02] pr-2 pl-8 text-sm [color-scheme:dark] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </div>
        {item.dueDate ? (
          <>
            <span className={cn("text-sm", due?.overdue && !item.checked ? "text-rose" : "text-muted-foreground")}>
              {due?.overdue && !item.checked ? `Overdue · ${due.text}` : due?.text}
            </span>
            <Button variant="ghost" size="sm" onClick={() => choose("")} aria-label="Remove due date">
              <X aria-hidden /> Clear
            </Button>
          </>
        ) : today ? (
          <div className="flex gap-1.5">
            {[
              { label: "Today", value: today },
              { label: "Tomorrow", value: addDays(today, 1) },
              { label: "Next week", value: addDays(today, 7) },
            ].map((option) => (
              <Button key={option.label} variant="outline" size="sm" className="h-8 rounded-full" onClick={() => choose(option.value)}>
                {option.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Notes({ item, actions }: { item: ChecklistItem; actions: TaskActions }) {
  const key = notesBackupKey(item.id);
  const [initial] = useState(() => {
    const backup = readLocal(key);
    return backup !== null && backup !== item.notes ? { notes: backup, restored: true } : { notes: item.notes, restored: false };
  });
  const [notes, setNotes] = useState(initial.notes);
  const [state, setState] = useState<SaveState>(initial.restored ? { kind: "dirty" } : { kind: "saved" });
  const notesRef = useRef(initial.notes);
  const savedRef = useRef(item.notes);
  const itemRef = useRef(item);
  const textareaId = `notes-${item.id}`;

  useEffect(() => {
    itemRef.current = item;
  });

  async function save() {
    const value = notesRef.current;
    if (value === savedRef.current) return;
    setState({ kind: "saving" });
    const outcome = await actions.patchItem(itemRef.current, { notes: value }, "Notes not saved", { revert: false });
    if (!outcome.ok) {
      setState({ kind: "error", message: outcome.message });
      return;
    }
    savedRef.current = value;
    if (notesRef.current === value) {
      writeLocal(key, null);
      setState({ kind: "saved" });
    } else {
      setState({ kind: "dirty" });
    }
  }

  function change(value: string) {
    setNotes(value);
    notesRef.current = value;
    if (value === savedRef.current) {
      writeLocal(key, null);
      setState({ kind: "saved" });
    } else {
      writeLocal(key, value);
      setState({ kind: "dirty" });
    }
  }

  const autosave = useEffectEvent(() => void save());
  useEffect(() => {
    const timer = window.setTimeout(autosave, 800);
    return () => window.clearTimeout(timer);
  }, [notes]);

  const flush = useEffectEvent(() => {
    if (notesRef.current !== savedRef.current) void save();
  });
  useEffect(() => () => flush(), []);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={textareaId} className={SECTION_LABEL}>
          Notes
        </label>
        {notes !== "" || state.kind !== "saved" ? <SaveStatus state={state} onRetry={state.kind === "error" ? () => void save() : undefined} /> : null}
      </div>
      <div className="relative mt-1.5">
        <StickyNote aria-hidden className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground/70" />
        <Textarea
          id={textareaId}
          value={notes}
          maxLength={MAX_TASK_NOTES_LENGTH}
          onChange={(event) => change(event.target.value)}
          onBlur={() => {
            if (notesRef.current !== savedRef.current) void save();
          }}
          placeholder="Add a note"
          className="max-h-[60vh] min-h-20 resize-none bg-white/[0.02] pl-8 text-sm leading-6 [field-sizing:content] dark:bg-white/[0.02]"
        />
      </div>
    </div>
  );
}
