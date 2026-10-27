"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Link2,
  Loader2,
  MoreHorizontal,
  PanelRightClose,
  Pencil,
  Plus,
  Search,
  Star,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { LiveMarkdownEditor } from "@/components/editor/live-markdown-editor";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage, readLocal, writeLocal } from "@/components/workspace/client-utils";
import { describeDue } from "@/components/workspace/due-date";
import { InlineNameForm } from "@/components/workspace/inline-name-form";
import { RoundCheck } from "@/components/workspace/round-check";
import { SaveStatus, type SaveState } from "@/components/workspace/save-status";
import { apiFetch } from "@/lib/api-client";
import { entryPath } from "@/lib/collections";
import { shiftDate, type Task, type TaskStep } from "@/lib/tasks/model";
import { cn } from "@/lib/utils";
import { dueDateSchema, itemLabelSchema } from "@/lib/validation/workspace";
import { ListGlyph } from "./sidebar";
import { useTasks } from "./store";
import { DeleteTaskDialog } from "./task-row";

const SECTION_LABEL = "text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase";
const CARD =
  "rounded-lg bg-black/40 shadow-[inset_0_0_0_1px_rgb(var(--ink-rgb)/0.06)] transition-shadow duration-200 focus-within:shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.45)]";
const stamp = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const notesBackupKey = (taskId: string) => `archive:tasks-notes:${taskId}`;

/** Microsoft To Do style detail pane for the selected task. */
export function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data, today, stepsByTask, actions } = useTasks();
  const [deleting, setDeleting] = useState(false);
  const [askComplete, setAskComplete] = useState(false);
  const steps = stepsByTask.get(task.id) ?? [];
  const list = data.lists[task.listId];
  const inMyDay = today !== null && task.myDayOn === today;
  const allStepsDone = steps.length > 0 && steps.every((step) => step.completed);

  return (
    <div role="region" aria-label={`Details for ${task.title}`} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        {list ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <ListGlyph list={list} className="size-3.5 shrink-0" />
            <span className="truncate">{list.name}</span>
          </span>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Close details" onClick={onClose}>
          <PanelRightClose aria-hidden />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pt-2 pb-4">
        <div className={cn(CARD, "px-3.5 py-3")}>
          <div className="flex items-start gap-3">
            <RoundCheck
              className="mt-1"
              checked={Boolean(task.completedAt)}
              label={task.title}
              onCheckedChange={(completed) => {
                setAskComplete(false);
                void actions.updateTask(task.id, { completed }, { failure: completed ? "Task not completed" : "Task not reopened" });
              }}
            />
            <TitleField key={task.id} task={task} />
            <button
              type="button"
              aria-pressed={task.important}
              aria-label={task.important ? "Remove importance" : "Mark as important"}
              onClick={() => void actions.updateTask(task.id, { important: !task.important }, { failure: "Importance not saved" })}
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full transition-colors outline-none hover:bg-rose/10 focus-visible:ring-2 focus-visible:ring-rose/60",
                task.important ? "text-rose" : "text-muted-foreground hover:text-rose",
              )}
            >
              <Star aria-hidden className={cn("size-[1.1rem]", task.important && "fill-current")} />
            </button>
          </div>
          <Steps task={task} steps={steps} onAllDone={() => !task.completedAt && setAskComplete(true)} />
          {askComplete && allStepsDone && !task.completedAt ? (
            <div role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-amethyst/10 px-3 py-2 text-sm">
              <span className="flex-1">All steps are done. Complete the task too?</span>
              <Button
                size="sm"
                onClick={() => {
                  setAskComplete(false);
                  void actions.updateTask(task.id, { completed: true }, { failure: "Task not completed" });
                }}
              >
                Complete task
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAskComplete(false)}>
                Not now
              </Button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          disabled={!today}
          aria-pressed={inMyDay}
          onClick={() => today && void actions.updateTask(task.id, { myDay: inMyDay ? null : today }, { failure: "My Day not updated" })}
          className={cn(
            CARD,
            "flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-sm outline-none hover:bg-white/[0.04] focus-visible:shadow-[inset_0_0_0_2px_var(--amethyst)]",
            inMyDay ? "text-amethyst" : "text-foreground/85",
          )}
        >
          <Sun aria-hidden className="size-[1.05rem] shrink-0" />
          <span className="flex-1">{inMyDay ? "Added to My Day" : "Add to My Day"}</span>
          {inMyDay ? <X aria-label="Remove from My Day" className="size-4 text-muted-foreground" /> : null}
        </button>

        <DueDate task={task} />
        <ListPicker task={task} />
        <EntryLink task={task} />
        <Notes key={task.id} task={task} />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2.5">
        <span className="min-w-0 truncate text-[11px] text-muted-foreground/80">
          {task.completedAt ? `Completed ${stamp.format(new Date(task.completedAt))}` : `Created ${stamp.format(new Date(task.createdAt))}`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:[&_svg]:text-destructive"
          onClick={() => setDeleting(true)}
        >
          <Trash2 aria-hidden /> Delete
        </Button>
      </div>
      <DeleteTaskDialog task={deleting ? task : null} onOpenChange={setDeleting} onDeleted={onClose} />
    </div>
  );
}

function TitleField({ task }: { task: Task }) {
  const { actions } = useTasks();
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<SaveState | null>(null);
  const value = draft ?? task.title;

  async function commit() {
    if (draft === null) return;
    const parsed = itemLabelSchema.safeParse(draft.replace(/\s+/g, " "));
    if (!parsed.success) {
      setState({ kind: "error", message: parsed.error.issues[0]?.message ?? "Invalid title." });
      return;
    }
    if (parsed.data === task.title) {
      setDraft(null);
      setState(null);
      return;
    }
    setState({ kind: "saving" });
    const error = await actions.updateTask(task.id, { title: parsed.data }, { quiet: true });
    if (error) setState({ kind: "error", message: error });
    else {
      setDraft((current) => (current === draft ? null : current));
      setState({ kind: "saved" });
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={`task-title-${task.id}`} className="sr-only">
        Task title
      </label>
      <textarea
        id={`task-title-${task.id}`}
        rows={1}
        value={value}
        maxLength={500}
        onChange={(event) => {
          setDraft(event.target.value.replace(/\n/g, " "));
          setState({ kind: "dirty" });
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape" && draft !== null) {
            event.preventDefault();
            setDraft(null);
            setState(null);
          }
        }}
        className={cn(
          "field-sizing-content w-full resize-none bg-transparent text-lg leading-7 font-semibold break-words outline-none",
          task.completedAt && "text-muted-foreground line-through decoration-muted-foreground/60",
        )}
      />
      {state && state.kind !== "saved" ? <SaveStatus state={state} onRetry={() => void commit()} className="mt-0.5" /> : null}
    </div>
  );
}

function Steps({ task, steps, onAllDone }: { task: Task; steps: TaskStep[]; onAllDone: () => void }) {
  const { actions } = useTasks();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const parsed = itemLabelSchema.safeParse(draft);
    if (!parsed.success) {
      if (draft.trim()) toast.error(parsed.error.issues[0]?.message ?? "Invalid step.");
      return;
    }
    setBusy(true);
    const error = await actions.addStep(task.id, parsed.data);
    setBusy(false);
    if (!error) setDraft((current) => (current === draft ? "" : current));
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function move(index: number, delta: number) {
    const ids = steps.map((step) => step.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(index, 1));
    void actions.reorderSteps(task.id, ids);
    requestAnimationFrame(() => document.getElementById(`task-step-${steps[index].id}`)?.focus());
  }

  return (
    <div className="mt-2">
      {steps.length > 0 ? (
        <ol aria-label="Steps" className="-mx-1.5">
          {steps.map((step, index) => (
            <StepRow
              key={step.id}
              step={step}
              index={index}
              count={steps.length}
              onMove={(delta) => move(index, delta)}
              onToggle={(completed) => {
                void actions.updateStep(step.id, { completed });
                if (completed && steps.every((other) => other.id === step.id || other.completed)) onAllDone();
              }}
            />
          ))}
        </ol>
      ) : null}
      <form onSubmit={add} className="group/step-add -mx-1.5 flex min-h-10 items-center gap-3 rounded-md px-2">
        <Plus aria-hidden className="size-[1.05rem] shrink-0 text-amethyst transition-transform duration-300 group-hover/step-add:rotate-90 motion-reduce:transition-none" />
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          disabled={busy}
          aria-label={`Add a step to ${task.title}`}
          placeholder={steps.length ? "Next step" : "Add step"}
          className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:font-medium placeholder:text-amethyst focus:placeholder:font-normal focus:placeholder:text-muted-foreground/70 disabled:opacity-60"
        />
        {busy ? <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" /> : null}
      </form>
    </div>
  );
}

function StepRow({
  step,
  index,
  count,
  onMove,
  onToggle,
}: {
  step: TaskStep;
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onToggle: (completed: boolean) => void;
}) {
  const { actions } = useTasks();
  const [editing, setEditing] = useState<string | null>(null);
  const renamingRef = useRef(false);

  async function rename(value: string): Promise<string | null> {
    const parsed = itemLabelSchema.safeParse(value);
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid step.";
    if (parsed.data !== step.title) {
      const error = await actions.updateStep(step.id, { title: parsed.data });
      if (error) return error;
    }
    setEditing(null);
    return null;
  }

  return (
    <li className="group/step flex min-h-10 items-center gap-3 rounded-md pr-0.5 pl-2 transition-colors duration-150 hover:bg-white/[0.045]">
      <RoundCheck size="sm" checked={step.completed} label={step.title} onCheckedChange={onToggle} />
      {editing !== null ? (
        <InlineNameForm initial={editing} inputId={`task-step-name-${step.id}`} maxLength={500} label="Step name" onSave={rename} onCancel={() => setEditing(null)} />
      ) : (
        <button
          id={`task-step-${step.id}`}
          type="button"
          title="Rename (Alt+↑/↓ to reorder)"
          onClick={() => setEditing(step.title)}
          onKeyDown={(event) => {
            if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
              event.preventDefault();
              onMove(event.key === "ArrowUp" ? -1 : 1);
            }
          }}
          className={cn(
            "min-w-0 flex-1 rounded-sm py-2 text-left text-sm break-words transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            step.completed && "text-muted-foreground line-through decoration-muted-foreground/60",
          )}
        >
          {step.title}
        </button>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for step ${step.title}`}
            className="text-muted-foreground opacity-0 group-hover/step:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            if (renamingRef.current) {
              event.preventDefault();
              document.getElementById(`task-step-name-${step.id}`)?.focus();
            }
            renamingRef.current = false;
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              renamingRef.current = true;
              setEditing(step.title);
            }}
          >
            <Pencil aria-hidden /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
            <ArrowUp aria-hidden /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
            <ArrowDown aria-hidden /> Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void actions.deleteStep(step.id)}>
            <Trash2 aria-hidden /> Delete step
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function DueDate({ task }: { task: Task }) {
  const { today, actions } = useTasks();
  const [draft, setDraft] = useState<string | null>(null);
  const due = task.dueDate ? describeDue(task.dueDate, today) : null;
  const overdue = Boolean(due?.overdue && !task.completedAt);
  const tone = overdue ? "text-rose" : task.dueDate === today && !task.completedAt ? "text-amethyst" : "text-foreground/85";
  const inputId = `task-due-${task.id}`;

  function choose(value: string | null) {
    setDraft(null);
    if (value === task.dueDate) return;
    if (value !== null && !dueDateSchema.safeParse(value).success) return;
    void actions.updateTask(task.id, { dueDate: value }, { failure: "Due date not saved" });
  }

  return (
    <div className={cn(CARD, "px-3.5 py-2.5")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CalendarDays aria-hidden className={cn("size-[1.05rem] shrink-0", task.dueDate ? tone : "text-muted-foreground")} />
        <label htmlFor={inputId} className="text-sm font-medium">
          Due date
        </label>
        {due ? <span className={cn("text-sm", tone)}>{overdue ? `Overdue · ${due.text}` : due.text}</span> : null}
        <div className="ml-auto flex items-center gap-1">
          <input
            id={inputId}
            type="date"
            min="1900-01-01"
            max="2999-12-31"
            value={draft ?? task.dueDate ?? ""}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => draft !== null && choose(event.target.value || null)}
            onKeyDown={(event) => {
              if (event.key === "Enter") choose(event.currentTarget.value || null);
            }}
            className="h-8 rounded-md border border-white/10 bg-white/[0.03] px-2 text-xs text-muted-foreground transition-colors outline-none hover:border-amethyst/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {task.dueDate ? (
            <Button variant="ghost" size="icon-sm" onClick={() => choose(null)} aria-label="Remove due date" className="text-muted-foreground">
              <X aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
      {!task.dueDate && today ? (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-[1.8rem]">
          {[
            { label: "Today", value: today },
            { label: "Tomorrow", value: shiftDate(today, 1) },
            { label: "Next week", value: shiftDate(today, 7) },
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

function ListPicker({ task }: { task: Task }) {
  const { inbox, sidebar, actions } = useTasks();
  const lists = [...(inbox ? [inbox] : []), ...sidebar.flatMap((item) => (item.kind === "group" ? item.lists : [item.list]))];
  return (
    <div className={cn(CARD, "flex min-h-12 items-center gap-3 px-3.5 py-2")}>
      <span className="text-sm font-medium" id={`task-list-label-${task.id}`}>
        List
      </span>
      <Select value={task.listId} onValueChange={(listId) => void actions.updateTask(task.id, { listId }, { failure: "Task not moved" })}>
        <SelectTrigger size="sm" className="ml-auto max-w-56 min-w-0" aria-labelledby={`task-list-label-${task.id}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {lists.map((list) => (
            <SelectItem key={list.id} value={list.id}>
              <ListGlyph list={list} /> {list.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type EntryHit = { id: string; title: string; collectionName: string };

function EntryLink({ task }: { task: Task }) {
  const { data, actions } = useTasks();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<EntryHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entry = task.entryId ? data.entries[task.entryId] : null;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      apiFetch<{ entries: EntryHit[] }>(`/api/entries?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then(
        (result) => {
          setHits(result.entries);
          setError(null);
        },
        (reason) => {
          if (!controller.signal.aborted) setError(errorMessage(reason));
        },
      );
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  return (
    <div className={cn(CARD, "flex min-h-12 items-center gap-3 px-3.5 py-2")}>
      <Link2 aria-hidden className={cn("size-[1.05rem] shrink-0", entry ? "text-amethyst" : "text-muted-foreground")} />
      {entry ? (
        <Link href={entryPath(entry)} className="min-w-0 flex-1 truncate text-sm underline-offset-2 hover:underline">
          {entry.title}
        </Link>
      ) : task.entryId ? (
        <span className="flex-1 text-sm text-muted-foreground">Linked entry</span>
      ) : (
        <span className="flex-1 text-sm text-muted-foreground">No archive entry linked</span>
      )}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 text-muted-foreground">
            {task.entryId ? "Change" : "Link entry"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-2">
          <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-2">
            <Search aria-hidden className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={100}
              placeholder="Search archive entries"
              aria-label="Search archive entries"
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <ul className="mt-2 max-h-64 overflow-y-auto" aria-label="Entries">
            {error ? (
              <li className="px-2 py-3 text-sm text-destructive">{error}</li>
            ) : hits === null ? (
              <li className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> Loading…
              </li>
            ) : hits.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">No entries found.</li>
            ) : (
              hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setQuery("");
                      void actions.updateTask(task.id, { entryId: hit.id }, { failure: "Entry not linked" });
                    }}
                    className={cn(
                      "flex w-full flex-col rounded-md px-2 py-1.5 text-left outline-none hover:bg-white/[0.06] focus-visible:bg-white/[0.08]",
                      hit.id === task.entryId && "bg-amethyst/10",
                    )}
                  >
                    <span className="truncate text-sm">{hit.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{hit.collectionName}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </PopoverContent>
      </Popover>
      {task.entryId ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label="Unlink entry"
          onClick={() => void actions.updateTask(task.id, { entryId: null }, { failure: "Entry not unlinked" })}
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

type NotesBase = { text: string; rev: number };

/**
 * Notes load on demand (the sync feed never carries them), autosave, keep a local backup until
 * saved, and use the revision to detect edits made on another device.
 */
function Notes({ task }: { task: Task }) {
  const { actions } = useTasks();
  const backupKey = notesBackupKey(task.id);
  const [base, setBase] = useState<NotesBase | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [state, setState] = useState<SaveState>({ kind: "saved" });
  const [restored, setRestored] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const savingRef = useRef(false);
  const draftRef = useRef<string | null>(null);
  const dirty = base !== null && draft !== null && draft !== base.text;
  const needsLoad = base === null || (task.notesRev > base.rev && !dirty && state.kind !== "saving");

  useEffect(() => {
    draftRef.current = draft;
  });

  const load = useEffectEvent(() => {
    const first = base === null;
    const request: Promise<NotesBase> =
      !task.hasNotes && first
        ? Promise.resolve({ text: "", rev: task.notesRev })
        : apiFetch<{ notes: string; notesRev: number }>(`/api/tasks/${task.id}`).then((result) => ({ text: result.notes, rev: result.notesRev }));
    return request.then((latest) => {
      setLoadError(null);
      setBase(latest);
      const backup = first ? readLocal(backupKey) : null;
      if (backup !== null && backup !== latest.text) {
        setDraft(backup);
        setRestored(true);
        setState({ kind: "dirty" });
      } else {
        setDraft(null);
        if (first) writeLocal(backupKey, null);
      }
      setEditorKey((key) => key + 1);
    });
  });

  useEffect(() => {
    if (!needsLoad) return;
    let cancelled = false;
    load().catch((error: unknown) => {
      if (!cancelled) setLoadError(errorMessage(error));
    });
    return () => {
      cancelled = true;
    };
  }, [needsLoad, task.notesRev, reloads]);

  async function save() {
    if (!base || draft === null || draft === base.text || savingRef.current) return;
    savingRef.current = true;
    const sent = draft;
    setState({ kind: "saving" });
    const result = await actions.saveNotes(task.id, sent, base.rev);
    savingRef.current = false;
    if (result.ok) {
      setBase({ text: sent, rev: result.rev });
      if (draftRef.current === sent) {
        setDraft(null);
        writeLocal(backupKey, null);
        setRestored(false);
      }
      setState(draftRef.current === sent ? { kind: "saved" } : { kind: "dirty" });
    } else if (result.conflict) {
      setState({ kind: "conflict" });
    } else {
      setState({ kind: "error", message: result.message });
    }
  }
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    if (!dirty || state.kind === "conflict" || state.kind === "saving") return;
    writeLocal(backupKey, draft);
    const timer = window.setTimeout(() => void saveRef.current(), 800);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, base, state.kind, backupKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Closing the pane saves what's left; the backup stays until the save succeeds.
  useEffect(() => () => void saveRef.current(), []);

  async function resolve(keep: "mine" | "theirs") {
    try {
      const latest = await apiFetch<{ notes: string; notesRev: number }>(`/api/tasks/${task.id}`);
      setBase({ text: latest.notes, rev: latest.notesRev });
      if (keep === "theirs") {
        setDraft(null);
        writeLocal(backupKey, null);
        setRestored(false);
        setEditorKey((key) => key + 1);
        setState({ kind: "saved" });
      } else {
        setState({ kind: "dirty" });
      }
    } catch (error) {
      toast.error("Couldn't load the latest notes", { description: errorMessage(error) });
    }
  }

  return (
    <div className={cn(CARD, "px-3.5 pt-2.5 pb-3")}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h3 className={SECTION_LABEL}>Notes</h3>
        {base && (dirty || state.kind !== "saved") ? <SaveStatus state={state} onRetry={() => void save()} /> : null}
      </div>
      {state.kind === "conflict" ? (
        <div role="alert" className="mb-2 rounded-md bg-rose/10 px-3 py-2 text-sm">
          <p>These notes were changed on another device while you were editing.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void resolve("mine")}>
              Keep mine
            </Button>
            <Button size="sm" variant="outline" onClick={() => void resolve("theirs")}>
              Use theirs
            </Button>
          </div>
        </div>
      ) : null}
      {restored && state.kind !== "conflict" ? <p className="mb-2 text-xs text-muted-foreground">Restored unsaved notes from this device.</p> : null}
      {base ? (
        <div className="min-h-28 text-sm">
          <LiveMarkdownEditor
            key={editorKey}
            initialValue={draft ?? base.text}
            ariaLabel={`Notes for ${task.title}`}
            placeholder="Add a note"
            onChange={(value) => {
              setDraft(value);
              if (state.kind === "saved" || state.kind === "error") setState({ kind: "dirty" });
            }}
            onSave={() => void save()}
            onBlur={() => void save()}
            onImageError={(message) => toast.error("Image not added", { description: message })}
          />
        </div>
      ) : loadError ? (
        <div className="flex items-center gap-2 py-3 text-sm text-destructive">
          Notes couldn&apos;t be loaded.
          <Button size="sm" variant="ghost" onClick={() => setReloads((count) => count + 1)}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> Loading notes…
        </div>
      )}
    </div>
  );
}
