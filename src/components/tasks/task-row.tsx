"use client";

import { memo, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarMinus,
  CalendarPlus,
  Check,
  GripVertical,
  Link2,
  ListChecks,
  MoreHorizontal,
  Repeat2,
  SquareCheck,
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
import { shiftDate, type Task, type TaskList, type TaskStep } from "@/lib/tasks/model";
import { cn } from "@/lib/utils";
import { ListGlyph } from "./sidebar";
import { useTasks } from "./store";

type TaskActions = ReturnType<typeof useTasks>["actions"];

/** Row callbacks keyed by task, kept referentially stable by the view so rows can skip re-rendering. */
export type TaskRowHandlers = {
  /** Click on the row: opens details; Shift/Ctrl/Cmd extend or toggle the selection. */
  open: (id: string, event: MouseEvent) => void;
  toggleSelect: (id: string, range: boolean) => void;
  toggle: (task: Task, completed: boolean) => void;
  remove: (task: Task) => void;
  move: (id: string, delta: -1 | 1) => void;
  keyDown: (id: string, event: KeyboardEvent) => void;
  dragStart: (id: string, event: PointerEvent<HTMLElement>) => void;
};

const NO_STEPS: TaskStep[] = [];

export const TaskRow = memo(function TaskRow({
  task,
  list,
  entryTitle,
  steps = NO_STEPS,
  today,
  allLists,
  actions,
  selected,
  showList,
  showMyDay,
  celebrate,
  checkedOverride,
  snippet,
  handlers,
  movable,
  canMoveUp,
  canMoveDown,
  draggable,
  dragging,
  lifted,
  checked,
  selecting,
}: {
  task: Task;
  list: TaskList | undefined;
  entryTitle: string | null;
  steps?: TaskStep[];
  today: string | null;
  allLists: TaskList[];
  actions: TaskActions;
  selected: boolean;
  /** Show the source list (outside the task's own list). */
  showList: boolean;
  /** Show the My Day marker (outside My Day). */
  showMyDay: boolean;
  celebrate: boolean;
  /** Visually checked while the completion settles. */
  checkedOverride?: boolean;
  snippet?: ReactNode;
  handlers: TaskRowHandlers;
  /** Keyboard/menu reordering is available. */
  movable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Drag reordering is available. */
  draggable: boolean;
  /** Part of the tasks being dragged. */
  dragging: boolean;
  /** The grabbed row: how many tasks move with the pointer (0 = not grabbed). */
  lifted: number;
  /** In the multi-selection. */
  checked: boolean;
  /** A multi-selection exists, so every row shows its selection box. */
  selecting: boolean;
}) {
  const doneSteps = steps.filter((step) => step.completed).length;
  const completed = checkedOverride ?? Boolean(task.completedAt);
  const due = task.dueDate ? describeDue(task.dueDate, today) : null;
  const overdue = Boolean(due?.overdue && !completed);
  const dueToday = Boolean(task.dueDate && task.dueDate === today && !completed);
  const inMyDay = today !== null && task.myDayOn === today;
  const onToggle = (done: boolean) => handlers.toggle(task, done);
  const onDelete = () => handlers.remove(task);
  const runMove = (delta: -1 | 1) => handlers.move(task.id, delta);

  // Only what helps at a glance; everything else lives in the details pane.
  const meta = [
    showMyDay && inMyDay ? (
      <span key="day" className="inline-flex items-center gap-1">
        <Sun aria-hidden className="size-3.5" /> My Day
      </span>
    ) : null,
    showList && list ? (
      <span key="list" className="inline-flex min-w-0 items-center gap-1">
        <ListGlyph list={list} className="size-3.5 shrink-0" />
        <span className="max-w-40 truncate">{list.name}</span>
      </span>
    ) : null,
    due ? (
      <span key="due" className={cn("inline-flex items-center gap-1", overdue ? "font-medium text-rose" : dueToday && "text-amethyst")}>
        <CalendarDays aria-hidden className="size-3.5" />
        {overdue ? `Overdue · ${due.text}` : due.text}
      </span>
    ) : null,
    steps.length > 0 ? (
      <span key="steps" className={cn("inline-flex items-center gap-1 tabular-nums", doneSteps === steps.length && "text-amethyst")}>
        <ListChecks aria-hidden className="size-3.5" />
        {doneSteps}/{steps.length}
        <span className="sr-only"> steps done</span>
      </span>
    ) : null,
    task.hasNotes ? (
      <span key="note" className="inline-flex items-center" title="Has notes">
        <StickyNote aria-hidden className="size-3.5" />
        <span className="sr-only">Has notes</span>
      </span>
    ) : null,
    entryTitle ? (
      <span key="entry" className="inline-flex min-w-0 items-center gap-1">
        <Link2 aria-hidden className="size-3.5 shrink-0" />
        <span className="sr-only">Linked to </span>
        <span className="max-w-32 truncate">{entryTitle}</span>
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <div
      data-task-row
      data-id={task.id}
      className={cn(
        "group/task relative rounded-xl transition-[background-color,box-shadow,opacity] duration-200 ease-out motion-reduce:transition-none",
        checked
          ? "bg-amethyst/[0.09] shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.5)]"
          : selected
            ? "bg-surface-raised shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.45),0_8px_24px_-18px_rgb(var(--shadow-rgb)/0.8)]"
            : completed
              ? "hover:bg-foreground/[0.035]"
              : "bg-foreground/[0.03] shadow-[inset_0_0_0_1px_rgb(var(--ink-rgb)/0.05)] hover:bg-surface-raised hover:shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.28)]",
        dragging && !lifted && "opacity-35",
        lifted > 0 &&
          "bg-surface-raised opacity-95 shadow-[0_18px_40px_-14px_rgb(var(--shadow-rgb)/0.95),inset_0_0_0_1.5px_rgb(var(--accent-rgb)/0.6)] transition-none",
      )}
    >
      <div className={cn("flex min-h-[3.25rem] items-center gap-2.5 py-1.5 pr-1.5", draggable ? "pl-0.5" : "pl-2")}>
        {draggable ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            title="Drag to reorder"
            data-drag-handle
            onPointerDown={(event) => handlers.dragStart(task.id, event)}
            className={cn(
              "grid h-9 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground/45 transition-colors select-none group-hover/task:text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground active:cursor-grabbing pointer-coarse:w-7 pointer-coarse:text-muted-foreground",
              lifted > 0 && "cursor-grabbing text-amethyst",
            )}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={`Select ${task.title}`}
          title="Select (Shift+click for a range)"
          onClick={(event) => handlers.toggleSelect(task.id, event.shiftKey)}
          onMouseDown={(event) => event.shiftKey && event.preventDefault()}
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px] outline-none transition-[opacity,background-color,border-color] duration-150 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-amethyst/70 motion-reduce:transition-none",
            checked
              ? "border-amethyst bg-amethyst text-amethyst-foreground"
              : "border-foreground/30 text-transparent hover:border-amethyst",
            !checked && !selecting && "opacity-0 group-focus-within/task:opacity-100 group-hover/task:opacity-100 pointer-coarse:hidden",
          )}
        >
          <Check aria-hidden strokeWidth={3} className="size-3" />
        </button>
        <RoundCheck checked={completed} label={task.title} onCheckedChange={onToggle} celebrate={celebrate} />
        <button
          id={`task-row-${task.id}`}
          data-row-button
          type="button"
          aria-pressed={selected}
          aria-label={`${task.title}${completed ? ", completed" : ""}. Open details`}
          aria-keyshortcuts={movable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
          onClick={(event) => handlers.open(task.id, event)}
          onMouseDown={(event) => event.shiftKey && event.preventDefault()}
          onKeyDown={(event) => handlers.keyDown(task.id, event)}
          className="min-w-0 flex-1 self-stretch py-1.5 text-left outline-none after:pointer-events-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:shadow-[inset_0_0_0_2px_var(--amethyst)]"
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
          {meta.length > 0 ? <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">{meta}</span> : null}
          {snippet ? <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground/90">{snippet}</span> : null}
        </button>
        <button
          type="button"
          aria-pressed={task.important}
          aria-label={task.important ? `Remove importance from ${task.title}` : `Mark ${task.title} as important`}
          onClick={() => void actions.updateTask(task.id, { important: !task.important }, { failure: "Importance not saved" })}
          className={cn(
            "group/star grid size-9 shrink-0 place-items-center rounded-full transition-[background-color,color,scale] duration-200 outline-none hover:bg-rose/10 focus-visible:ring-2 focus-visible:ring-rose/60 active:scale-90 motion-reduce:transition-none",
            task.important ? "text-rose" : "text-muted-foreground hover:text-rose",
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
            {movable ? (
              <>
                <DropdownMenuItem disabled={!canMoveUp} onSelect={() => runMove(-1)}>
                  <ArrowUp aria-hidden /> Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canMoveDown} onSelect={() => runMove(1)}>
                  <ArrowDown aria-hidden /> Move down
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => handlers.toggleSelect(task.id, false)}>
              <SquareCheck aria-hidden /> {checked ? "Deselect" : "Select"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden /> Delete task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {lifted > 1 ? (
        <span className="absolute -top-2 right-3 rounded-full bg-amethyst px-2 py-0.5 text-[11px] font-semibold text-amethyst-foreground shadow tabular-nums">
          {lifted} tasks
        </span>
      ) : null}
    </div>
  );
});

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
    <div aria-busy className="flex min-h-[3.25rem] items-center gap-3 rounded-lg bg-white/[0.03] py-1.5 pr-3 pl-4 shadow-[inset_0_0_0_1px_rgb(var(--ink-rgb)/0.04)]">
      <span aria-hidden className="size-5 shrink-0 animate-pulse rounded-full border-[1.5px] border-white/25 motion-reduce:animate-none" />
      <span className="min-w-0 flex-1 truncate text-[14.5px] text-foreground/60">{title}</span>
      <span className="text-xs text-muted-foreground">Saving…</span>
    </div>
  );
}
