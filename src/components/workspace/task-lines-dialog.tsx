"use client";

import { useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ListPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { itemLabelSchema, MAX_ITEMS_PER_REQUEST, MAX_TASKS_PER_ADD, parseTaskLines, type TaskInput } from "@/lib/validation/workspace";
import { errorMessage } from "./client-utils";

const PREVIEW_LIMIT = 6;

function problemFor(tasks: TaskInput[]): string | null {
  if (tasks.length > MAX_TASKS_PER_ADD) return `Add up to ${MAX_TASKS_PER_ADD.toLocaleString("en")} tasks at a time. Split this addition into smaller parts.`;
  const index = tasks.findIndex((task) => !itemLabelSchema.safeParse(task.label).success);
  if (index >= 0) return `Task ${index + 1}: ${itemLabelSchema.safeParse(tasks[index].label).error?.issues[0]?.message ?? "Check this title."}`;
  return null;
}

/**
 * Paste or type several lines and turn each non-empty line into a task.
 * `onConfirm` returns an error message to keep the dialog (and the text) open.
 */
export function TaskLinesDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCloseAutoFocus,
  prepend = false,
  initialText = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (tasks: TaskInput[], batchId: string) => Promise<string | null>;
  onCloseAutoFocus?: (event: Event) => void;
  prepend?: boolean;
  initialText?: string;
}) {
  const id = useId();
  const [text, setText] = useState(initialText);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ saved: number; total: number } | null>(null);
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const submitting = useRef(false);
  const tasks = useMemo(() => parseTaskLines(text), [text]);
  const problem = problemFor(tasks);
  const completed = tasks.filter((task) => task.checked).length;

  function close(next: boolean) {
    if (submitting.current) return;
    if (!next) {
      setText("");
      setError(null);
      setProgress(null);
      retry.current = null;
    }
    onOpenChange(next);
  }

  async function submit() {
    if (submitting.current || tasks.length === 0 || problem) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    let remaining = tasks;
    let saved = progress?.saved ?? 0;
    const total = saved + remaining.length;
    setProgress({ saved, total });
    try {
      while (remaining.length) {
        const batch = prepend ? remaining.slice(-MAX_ITEMS_PER_REQUEST) : remaining.slice(0, MAX_ITEMS_PER_REQUEST);
        const signature = JSON.stringify(batch);
        if (retry.current?.signature !== signature) retry.current = { signature, id: crypto.randomUUID() };
        const failure = await onConfirm(batch, retry.current.id);
        if (failure) {
          setError(`${saved.toLocaleString("en")} of ${total.toLocaleString("en")} tasks confirmed saved. ${failure} Retry to safely finish the remaining tasks.`);
          return;
        }
        retry.current = null;
        saved += batch.length;
        remaining = prepend ? remaining.slice(0, -batch.length) : remaining.slice(batch.length);
        setText(remaining.map((task) => `- [${task.checked ? "x" : " "}] ${task.label}`).join("\n"));
        setProgress({ saved, total });
      }
      submitting.current = false;
      close(false);
    } catch (caught) {
      setError(`${saved.toLocaleString("en")} of ${total.toLocaleString("en")} tasks confirmed saved. ${errorMessage(caught)} Retry to safely finish the remaining tasks.`);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-lg border border-border bg-popover p-6 sm:max-w-[32rem]"
        showCloseButton={!pending}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader className="flex-row items-center gap-3.5">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-lg border border-amethyst/25 bg-amethyst/10 text-amethyst">
            <ListPlus className="size-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-lg leading-6 font-semibold tracking-normal">{title}</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5">{description}</DialogDescription>
          </div>
        </DialogHeader>
        <form
          className="min-w-0 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`${id}-lines`} className="text-xs font-medium text-muted-foreground">Paste or type one task per line</Label>
            <Textarea
              id={`${id}-lines`}
              value={text}
              onChange={(event) => { setText(event.target.value); setError(null); setProgress(null); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={"Buy groceries\n- [ ] Call the library\n- [x] Return the books"}
              className="max-h-[35dvh] min-h-36 resize-none overflow-y-auto border-input bg-background/50 px-3.5 py-3 font-mono text-[13px] leading-6 placeholder:text-muted-foreground/75 md:text-[13px]"
              autoFocus
              spellCheck={false}
              aria-invalid={Boolean(problem || error)}
              aria-describedby={`${id}-summary`}
              disabled={pending}
            />
          </div>
          <div id={`${id}-summary`} aria-live="polite" className="min-w-0 space-y-2">
            <p className="text-xs text-muted-foreground">Up to {MAX_TASKS_PER_ADD.toLocaleString("en")} tasks per addition, saved in batches of {MAX_ITEMS_PER_REQUEST}.</p>
            {progress ? <p role="status" className="text-sm tabular-nums">{progress.saved.toLocaleString("en")} of {progress.total.toLocaleString("en")} tasks saved{pending ? "..." : "."}</p> : null}
            <p className={cn("text-xs", tasks.length ? "text-foreground/85" : "text-muted-foreground")}>
              {tasks.length === 0
                ? "Nothing to add yet. Blank lines are skipped."
                : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} will be added${completed ? ` (${completed} already completed)` : ""}.`}
            </p>
            {tasks.length > 0 && !problem ? (
              <ul className="space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2">
                {tasks.slice(0, PREVIEW_LIMIT).map((task, index) => (
                  <li key={index} className="flex min-w-0 items-center gap-2 text-xs leading-5">
                    <span aria-hidden className={cn("grid size-3.5 shrink-0 place-items-center rounded-[4px] border", task.checked ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                      {task.checked ? <Check className="size-2.5" strokeWidth={3} /> : null}
                    </span>
                    <span className={cn("truncate", task.checked && "text-muted-foreground line-through")}>{task.label}</span>
                    <span className="sr-only">{task.checked ? "(completed)" : ""}</span>
                  </li>
                ))}
                {tasks.length > PREVIEW_LIMIT ? <li className="text-xs text-muted-foreground">and {tasks.length - PREVIEW_LIMIT} more</li> : null}
              </ul>
            ) : null}
          </div>
          {problem || error ? (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-rose/20 bg-rose/[0.06] px-3 py-2.5 text-xs leading-5 text-rose">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {problem ?? error}
            </p>
          ) : null}
          <DialogFooter className="-mx-6 -mb-6 gap-2 rounded-b-lg border-border bg-muted/30 px-6 py-4">
            <Button type="button" variant="ghost" className="h-10 px-4 text-muted-foreground" disabled={pending} onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" className="h-10 gap-2 px-4" disabled={pending || tasks.length === 0 || Boolean(problem)}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : <ListPlus aria-hidden />}
              {error ? "Retry remaining" : confirmLabel}
              {tasks.length ? <span className="tabular-nums opacity-80">({tasks.length})</span> : null}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
