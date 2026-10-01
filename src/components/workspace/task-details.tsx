"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

const SECTION_LABEL = "text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase";
const CARD =
  "rounded-lg bg-black/50 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] transition-shadow duration-200 focus-within:shadow-[inset_0_0_0_1px_rgb(165_124_255/0.45)]";

/** Expanded view of one task, grouped into cards like Microsoft To Do's detail pane. */
export function TaskDetails({ id, item, today, actions }: { id: string; item: ChecklistItem; today: string | null; actions: TaskActions }) {
  return (
    <div id={id} role="region" aria-label={`Details for ${item.label}`} className="enter enter-drop space-y-2 px-3 pb-3 md:pr-3 md:pl-[3.25rem]">
      <Steps item={item} actions={actions} />
      <DueDate item={item} today={today} actions={actions} />
      <Notes item={item} actions={actions} />
      <div className="flex items-center justify-between gap-3 pt-0.5 pl-1">
        <span className="text-[11px] text-muted-foreground/80">Changes save automatically</span>
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:[&_svg]:text-destructive" onClick={() => actions.remove(item)}>
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
    <div className={CARD}>
      <div className="flex items-center justify-between gap-3 px-3.5 pt-2.5 pb-1">
        <h4 className={SECTION_LABEL}>Steps</h4>
        {item.steps.length > 0 ? (
          <span
            className={cn("text-xs tabular-nums", done === item.steps.length ? "text-amethyst" : "text-muted-foreground")}
            aria-label={`${done} of ${item.steps.length} steps completed`}
          >
            {done} of {item.steps.length}
          </span>
        ) : null}
      </div>
      {item.steps.length > 0 ? (
        <ol className="px-1.5">
          {item.steps.map((step, index) => (
            <StepRow key={step.id} item={item} step={step} index={index} actions={actions} />
          ))}
        </ol>
      ) : null}
      <form onSubmit={add} className="group/step-add flex min-h-10 items-center gap-3 px-3.5 pb-1">
        <Plus aria-hidden className="size-[1.05rem] shrink-0 text-amethyst transition-transform duration-300 group-hover/step-add:rotate-90" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          disabled={busy}
          aria-label={`Add a step to ${item.label}`}
          placeholder={item.steps.length ? "Next step" : "Add step"}
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:font-medium placeholder:text-amethyst focus:placeholder:font-normal focus:placeholder:text-muted-foreground/70 disabled:opacity-60"
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
    <li className="group/step flex min-h-10 items-center gap-3 rounded-md pr-0.5 pl-2 transition-colors duration-150 hover:bg-white/[0.045]">
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
          className="h-8 min-w-0 flex-1 rounded-md bg-black/60 px-2 text-sm ring-1 ring-amethyst/60 outline-none"
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
            "min-w-0 flex-1 rounded-sm py-2 text-left text-sm break-words transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            step.checked && "text-muted-foreground line-through decoration-muted-foreground/60",
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

  const tone = due?.overdue && !item.checked ? "text-rose" : item.dueDate === today && !item.checked ? "text-amethyst" : "text-foreground/85";

  return (
    <div className={cn(CARD, "px-3.5 py-2.5")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CalendarDays aria-hidden className={cn("size-[1.05rem] shrink-0", item.dueDate ? tone : "text-muted-foreground")} />
        <label htmlFor={inputId} className="text-sm font-medium">
          Due date
        </label>
        {due ? <span className={cn("text-sm", tone)}>{due.overdue && !item.checked ? `Overdue · ${due.text}` : due.text}</span> : null}
        <div className="ml-auto flex items-center gap-1">
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
            className="h-8 rounded-md border border-white/10 bg-white/[0.03] px-2 text-xs text-muted-foreground [color-scheme:dark] transition-colors outline-none hover:border-amethyst/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {item.dueDate ? (
            <Button variant="ghost" size="icon-sm" onClick={() => choose("")} aria-label="Remove due date" className="text-muted-foreground">
              <X aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
      {!item.dueDate && today ? (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-[1.8rem]">
          {[
            { label: "Today", value: today },
            { label: "Tomorrow", value: addDays(today, 1) },
            { label: "Next week", value: addDays(today, 7) },
          ].map((option) => (
            <Button key={option.label} variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs" onClick={() => choose(option.value)}>
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
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
    <div className={CARD}>
      <div className="flex min-h-8 items-center justify-between gap-3 px-3.5 pt-2.5">
        <label htmlFor={textareaId} className={SECTION_LABEL}>
          Notes
        </label>
        {notes !== "" || state.kind !== "saved" ? <SaveStatus state={state} onRetry={state.kind === "error" ? () => void save() : undefined} /> : null}
      </div>
      <textarea
        id={textareaId}
        value={notes}
        maxLength={MAX_TASK_NOTES_LENGTH}
        onChange={(event) => change(event.target.value)}
        onBlur={() => {
          if (notesRef.current !== savedRef.current) void save();
        }}
        placeholder="Add a note"
        className="block max-h-[60vh] min-h-20 w-full resize-none bg-transparent px-3.5 pt-1.5 pb-3 text-sm leading-6 outline-none [field-sizing:content] placeholder:text-muted-foreground/60"
      />
    </div>
  );
}
