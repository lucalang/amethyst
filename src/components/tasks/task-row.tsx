"use client";

import { Fragment, type PointerEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarMinus,
  CalendarPlus,
  GripVertical,
  Link2,
  ListChecks,
  MoreHorizontal,
  Repeat2,
  Star,
  StickyNote,
  Sun,
  SunDim,
  Trash2,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { describeDue } from "@/components/workspace/due-date";
import { RoundCheck } from "@/components/workspace/round-check";
import { shiftDate, type Task } from "@/lib/tasks/model";
import { cn } from "@/lib/utils";
import { ListGlyph } from "./sidebar";
import { useTasks } from "./store";

const completedFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function TaskRow({
  task,
  selected,
  showList,
  showMyDay,
  celebrate,
  checkedOverride,
  snippet,
  onSelect,
  onToggle,
  onDelete,
  move,
  drag,
}: {
  task: Task;
  selected: boolean;
  /** Show the source list (outside the task's own list). */
  showList: boolean;
  /** Show the My Day marker (outside My Day). */
  showMyDay: boolean;
  celebrate: boolean;
  /** Visually checked while the completion settles. */
  checkedOverride?: boolean;
  snippet?: ReactNode;
  onSelect: () => void;
  onToggle: (completed: boolean) => void;
  onDelete: () => void;
  move?: { up: boolean; down: boolean; run: (delta: number) => void };
  drag?: {
    active: boolean;
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerEnd: () => void;
  };
}) {
  const { data, today, stepsByTask, actions, sidebar, inbox } = useTasks();
  const list = data.lists[task.listId];
  const steps = stepsByTask.get(task.id) ?? [];
  const doneSteps = steps.filter((step) => step.completed).length;
  const completed = checkedOverride ?? Boolean(task.completedAt);
  const due = task.dueDate ? describeDue(task.dueDate, today) : null;
  const overdue = Boolean(due?.overdue && !completed);
  const dueToday = Boolean(task.dueDate && task.dueDate === today && !completed);
  const inMyDay = today !== null && task.myDayOn === today;
  const entry = task.entryId ? data.entries[task.entryId] : null;
  const allLists = [...(inbox ? [inbox] : []), ...sidebar.flatMap((item) => (item.kind === "group" ? item.lists : [item.list]))];

  const meta = [
    showMyDay && inMyDay ? (
      <span key="day" className="inline-flex items-center gap-1">
        <Sun aria-hidden className="size-3.5" /> My Day
      </span>
    ) : null,
    showList && list ? (
      <span key="list" className="inline-flex min-w-0 items-center gap-1">
        <ListGlyph list={list} className="size-3.5 shrink-0" />
        <span className="truncate">{list.name}</span>
      </span>
    ) : null,
    steps.length > 0 ? (
      <span key="steps" className={cn("inline-flex items-center gap-1 tabular-nums", doneSteps === steps.length && "text-amethyst/90")}>
        <ListChecks aria-hidden className="size-3.5" />
        {doneSteps} of {steps.length}
      </span>
    ) : null,
    due ? (
      <span key="due" className={cn("inline-flex items-center gap-1", overdue ? "text-rose" : dueToday && "text-amethyst")}>
        <CalendarDays aria-hidden className="size-3.5" />
        {overdue ? `Overdue · ${due.text}` : due.text}
      </span>
    ) : null,
    task.hasNotes ? (
      <span key="note" className="inline-flex items-center gap-1">
        <StickyNote aria-hidden className="size-3.5" /> Note
      </span>
    ) : null,
    entry ? (
      <span key="entry" className="inline-flex min-w-0 items-center gap-1">
        <Link2 aria-hidden className="size-3.5 shrink-0" />
        <span className="max-w-40 truncate">{entry.title}</span>
      </span>
    ) : null,
    task.completedAt && checkedOverride === undefined ? (
      <span key="done" className="inline-flex items-center gap-1">
        Completed {completedFormat.format(new Date(task.completedAt))}
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <li
      data-task-row
      data-id={task.id}
      className={cn(
        "group/task relative rounded-lg transition-[background-color,box-shadow] duration-200 ease-out",
        selected
          ? "bg-surface-raised shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.45)]"
          : completed
            ? "bg-white/[0.022] shadow-[inset_0_0_0_1px_rgb(var(--ink-rgb)/0.035)] hover:bg-white/[0.045]"
            : "bg-white/[0.04] shadow-[inset_0_0_0_1px_rgb(var(--ink-rgb)/0.05)] hover:bg-surface-raised hover:shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.3)]",
        "has-[[data-row-button]:focus-visible]:shadow-[inset_0_0_0_2px_var(--amethyst)]",
        drag?.active && "z-10 bg-surface-raised shadow-[0_14px_36px_-16px_rgb(var(--shadow-rgb)/0.9),inset_0_0_0_1px_rgb(var(--accent-rgb)/0.45)]",
      )}
    >
      <div className={cn("flex min-h-[3.25rem] items-center gap-3 py-1.5 pr-1.5", drag ? "pl-1" : "pl-4")}>
        {drag ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onPointerDown={drag.onPointerDown}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerEnd}
            onPointerCancel={drag.onPointerEnd}
            onLostPointerCapture={drag.onPointerEnd}
            className="grid h-8 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/50 opacity-0 group-hover/task:opacity-100 active:cursor-grabbing pointer-coarse:opacity-100"
          >
            <GripVertical className="size-3.5" />
          </button>
        ) : null}
        <RoundCheck checked={completed} label={task.title} onCheckedChange={onToggle} celebrate={celebrate} />
        <button
          id={`task-row-${task.id}`}
          data-row-button
          type="button"
          aria-pressed={selected}
          aria-label={`${task.title}${completed ? ", completed" : ""}. Open details`}
          onClick={onSelect}
          onKeyDown={(event) => {
            if (move && event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
              event.preventDefault();
              move.run(event.key === "ArrowUp" ? -1 : 1);
            }
          }}
          className="min-w-0 flex-1 self-stretch py-1.5 text-left outline-none"
        >
          <span className="block text-[14.5px] leading-5 break-words">
            <span
              className={cn(
                "bg-[linear-gradient(currentColor,currentColor)] [box-decoration-break:clone] bg-no-repeat [background-position:0_58%] transition-[background-size,color] duration-300 ease-out",
                completed ? "bg-[length:100%_1.5px] text-muted-foreground" : "bg-[length:0%_1.5px] text-foreground",
              )}
            >
              {task.title}
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
          {snippet ? <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground/90">{snippet}</span> : null}
        </button>
        <button
          type="button"
          aria-pressed={task.important}
          aria-label={task.important ? `Remove importance from ${task.title}` : `Mark ${task.title} as important`}
          onClick={() => void actions.updateTask(task.id, { important: !task.important }, { failure: "Importance not saved" })}
          className={cn(
            "group/star grid size-9 shrink-0 place-items-center rounded-full transition-[background-color,color] duration-200 outline-none hover:bg-rose/10 focus-visible:ring-2 focus-visible:ring-rose/60 active:scale-90",
            task.important ? "text-rose" : "text-muted-foreground/70 hover:text-rose",
          )}
        >
          <Star
            aria-hidden
            className={cn(
              "size-[1.1rem] transition-[scale,rotate] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/star:scale-125 group-hover/star:rotate-[18deg]",
              task.important && "fill-current",
            )}
          />
        </button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${task.title}`}
              className="text-muted-foreground opacity-0 transition-[opacity,background-color,color] group-hover/task:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" onClick={(event) => event.stopPropagation()}>
            {today ? (
              <DropdownMenuItem onSelect={() => void actions.updateTask(task.id, { myDay: inMyDay ? null : today }, { failure: "My Day not updated" })}>
                {inMyDay ? <SunDim aria-hidden /> : <Sun aria-hidden />} {inMyDay ? "Remove from My Day" : "Add to My Day"}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => void actions.updateTask(task.id, { important: !task.important }, { failure: "Importance not saved" })}>
              <Star aria-hidden /> {task.important ? "Remove importance" : "Mark as important"}
            </DropdownMenuItem>
            {today ? (
              <>
                <DropdownMenuItem onSelect={() => void actions.updateTask(task.id, { dueDate: today }, { failure: "Due date not saved" })}>
                  <CalendarPlus aria-hidden /> Due today
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void actions.updateTask(task.id, { dueDate: shiftDate(today, 1) }, { failure: "Due date not saved" })}>
                  <CalendarPlus aria-hidden /> Due tomorrow
                </DropdownMenuItem>
              </>
            ) : null}
            {task.dueDate ? (
              <DropdownMenuItem onSelect={() => void actions.updateTask(task.id, { dueDate: null }, { failure: "Due date not saved" })}>
                <CalendarMinus aria-hidden /> Remove due date
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Repeat2 aria-hidden /> Move to list
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                {allLists.map((target) => (
                  <DropdownMenuItem
                    key={target.id}
                    disabled={target.id === task.listId}
                    onSelect={() => void actions.updateTask(task.id, { listId: target.id }, { failure: "Task not moved" })}
                  >
                    <ListGlyph list={target} /> <span className="truncate">{target.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {move ? (
              <>
                <DropdownMenuItem disabled={!move.up} onSelect={() => move.run(-1)}>
                  <ArrowUp aria-hidden /> Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!move.down} onSelect={() => move.run(1)}>
                  <ArrowDown aria-hidden /> Move down
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden /> Delete task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/** Confirms deleting a task (with its steps and notes). */
export function DeleteTaskDialog({
  task,
  onOpenChange,
  onDeleted,
}: {
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (id: string) => void;
}) {
  const { actions, stepsByTask } = useTasks();
  const steps = task ? (stepsByTask.get(task.id)?.length ?? 0) : 0;
  const extras = [steps ? `${steps} ${steps === 1 ? "step" : "steps"}` : null, task?.hasNotes ? "its notes" : null].filter(Boolean);
  return (
    <AlertDialog open={task !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{task?.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {extras.length ? `This also deletes ${extras.join(" and ")}. ` : ""}This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (!task) return;
              onDeleted?.(task.id);
              void actions.deleteTask(task.id);
            }}
          >
            Delete task
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A task being created; shown until the server confirms it. */
export function GhostRow({ title }: { title: string }) {
  return (
    <li aria-busy className="flex min-h-[3.25rem] items-center gap-3 rounded-lg bg-white/[0.03] py-1.5 pr-3 pl-4 shadow-[inset_0_0_0_1px_rgb(var(--ink-rgb)/0.04)]">
      <span aria-hidden className="size-5 shrink-0 animate-pulse rounded-full border-[1.5px] border-white/25 motion-reduce:animate-none" />
      <span className="min-w-0 flex-1 truncate text-[14.5px] text-foreground/60">{title}</span>
      <span className="text-xs text-muted-foreground">Saving…</span>
    </li>
  );
}
