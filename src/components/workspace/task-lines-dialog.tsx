"use client";

import { useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ListPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { itemLabelSchema, MAX_ITEMS_PER_REQUEST, parseTaskLines, type TaskInput } from "@/lib/validation/workspace";

const PREVIEW_LIMIT = 6;

function problemFor(tasks: TaskInput[]): string | null {
  if (tasks.length > MAX_ITEMS_PER_REQUEST) return `Add at most ${MAX_ITEMS_PER_REQUEST} tasks at once.`;
  const index = tasks.findIndex((task) => !itemLabelSchema.safeParse(task.label).success);
  if (index >= 0) return `Task ${index + 1} is too long. Titles can be at most 500 characters.`;
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (tasks: TaskInput[]) => Promise<string | null>;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const tasks = useMemo(() => parseTaskLines(text), [text]);
  const problem = problemFor(tasks);
  const completed = tasks.filter((task) => task.checked).length;

  function close(next: boolean) {
    if (submitting.current) return;
    if (!next) {
      setText("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function submit() {
    if (submitting.current || tasks.length === 0 || problem) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const failure = await onConfirm(tasks);
      if (failure) {
        setError(failure);
        return;
      }
      submitting.current = false;
      close(false);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="gap-5 rounded-lg border border-white/[0.08] bg-surface p-6 shadow-[0_24px_90px_rgb(0_0_0/0.75)] sm:max-w-[32rem]"
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
              onChange={(event) => { setText(event.target.value); setError(null); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={"Buy groceries\n- [ ] Call the library\n- [x] Return the books"}
              className="max-h-[45vh] min-h-36 resize-none overflow-y-auto border-white/[0.12] bg-black/50 px-3.5 py-3 font-mono text-[13px] leading-6 placeholder:text-muted-foreground/45 md:text-[13px]"
              autoFocus
              spellCheck={false}
              aria-invalid={Boolean(problem || error)}
              aria-describedby={`${id}-summary`}
              disabled={pending}
            />
          </div>
          <div id={`${id}-summary`} aria-live="polite" className="min-w-0 space-y-2">
            <p className={cn("text-xs", tasks.length ? "text-foreground/85" : "text-muted-foreground")}>
              {tasks.length === 0
                ? "Nothing to add yet. Blank lines are skipped."
                : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} will be added${completed ? ` (${completed} already completed)` : ""}.`}
            </p>
            {tasks.length > 0 && !problem ? (
              <ul className="space-y-1 rounded-md border border-white/[0.06] bg-black/30 px-3 py-2">
                {tasks.slice(0, PREVIEW_LIMIT).map((task, index) => (
                  <li key={index} className="flex min-w-0 items-center gap-2 text-xs leading-5">
                    <span aria-hidden className={cn("grid size-3.5 shrink-0 place-items-center rounded-[4px] border", task.checked ? "border-amethyst/60 bg-amethyst/80 text-black" : "border-white/25")}>
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
          <DialogFooter className="-mx-6 -mb-6 gap-2 rounded-b-lg border-white/[0.07] bg-white/[0.015] px-6 py-4">
            <Button type="button" variant="ghost" className="h-10 px-4 text-muted-foreground" disabled={pending} onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" className="h-10 gap-2 px-4" disabled={pending || tasks.length === 0 || Boolean(problem)}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : <ListPlus aria-hidden />}
              {confirmLabel}
              {tasks.length ? <span className="tabular-nums opacity-80">({tasks.length})</span> : null}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
