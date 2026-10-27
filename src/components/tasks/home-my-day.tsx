"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight, Star } from "lucide-react";
import { useSettings } from "@/components/layout/settings-context";
import { dateInZone, sortTasks, type Task, type TaskList } from "@/lib/tasks/model";
import { cn } from "@/lib/utils";

const subscribe = (onChange: () => void) => {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
};

/** One line for Home's To Do card: what's left in today's My Day. */
export function MyDaySummary({ tasks }: { tasks: Task[] }) {
  const { timeZone } = useSettings();
  const today = useSyncExternalStore(
    subscribe,
    () => dateInZone(new Date(), timeZone),
    () => null,
  );
  if (!today) return <span className="invisible">My Day</span>;
  const picked = tasks.filter((task) => task.myDayOn === today);
  const open = picked.filter((task) => !task.completedAt).length;
  if (picked.length === 0) return <>Nothing planned for today yet</>;
  if (open === 0) return <>Everything in My Day is done</>;
  return (
    <>
      <span className="font-semibold text-foreground tabular-nums">{open}</span> left in My Day
      {picked.length > open ? <span className="text-muted-foreground"> · {picked.length - open} done</span> : null}
    </>
  );
}

/** Today's My Day tasks on Home; the server sends candidates and the viewer's day picks them. */
export function HomeMyDay({ tasks, lists }: { tasks: Task[]; lists: TaskList[] }) {
  const { timeZone } = useSettings();
  const today = useSyncExternalStore(
    subscribe,
    () => dateInZone(new Date(), timeZone),
    () => null,
  );
  if (!today) return <div className="h-24" aria-hidden />;
  const names = new Map(lists.map((list) => [list.id, list.name]));
  const order = new Map(lists.map((list, index) => [list.id, index]));
  const picked = tasks.filter((task) => task.myDayOn === today);
  const open = sortTasks(
    picked.filter((task) => !task.completedAt),
    "manual",
    order,
  );
  const done = picked.length - open.length;

  if (picked.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-white/[0.1] px-4 py-3.5 text-sm text-muted-foreground">
        Nothing picked for today yet.{" "}
        <Link href="/tasks" className="font-medium text-amethyst underline-offset-4 hover:underline">
          Plan your day in To Do
        </Link>
      </p>
    );
  }

  return (
    <div>
      {open.length ? (
        <ul aria-label="My Day tasks" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {open.slice(0, 9).map((task) => (
            <li key={task.id} className="min-w-0">
              <Link
                href={`/tasks?task=${task.id}`}
                className="group/day flex min-h-14 items-center gap-3 rounded-lg bg-white/[0.04] px-3.5 py-2 shadow-[inset_0_0_0_1px_rgb(var(--ink-rgb)/0.06)] transition-[background-color,box-shadow] outline-none hover:bg-surface-raised hover:shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.35)] focus-visible:shadow-[inset_0_0_0_2px_var(--amethyst)]"
              >
                <span aria-hidden className="size-4 shrink-0 rounded-full border-[1.5px] border-white/40" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{task.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{names.get(task.listId) ?? "Tasks"}</span>
                </span>
                <Star aria-hidden className={cn("size-3.5 shrink-0", task.important ? "fill-current text-rose" : "hidden")} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-white/[0.1] px-4 py-3.5 text-sm text-muted-foreground">Everything for today is done.</p>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {open.length} open{done ? ` · ${done} done` : ""}
          {open.length > 9 ? ` · ${open.length - 9} more` : ""}
        </span>
        <Link href="/tasks" className="inline-flex items-center gap-1 font-medium text-amethyst underline-offset-4 hover:underline">
          Open My Day <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </p>
    </div>
  );
}
