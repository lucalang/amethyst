"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, Star } from "lucide-react";
import { describeDue, useToday } from "@/components/workspace/due-date";
import type { HomeTask } from "@/lib/data/home";
import { cn } from "@/lib/utils";

/** Incomplete tasks with due dates (earliest first, so overdue ones lead). */
export function UpcomingTasks({ tasks }: { tasks: HomeTask[] }) {
  const today = useToday();
  return (
    <ul aria-label="Upcoming tasks" className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
      {tasks.map((task) => {
        const due = describeDue(task.dueDate, today);
        return (
          <li key={task.id}>
            <Link
              href={task.href}
              className="group/task flex min-w-0 items-center gap-3 px-2 py-3 transition-colors outline-none hover:bg-white/[0.025] focus-visible:bg-white/[0.035] focus-visible:ring-2 focus-visible:ring-ring sm:gap-4 sm:px-3"
            >
              <span className={cn("flex w-24 shrink-0 items-center gap-1.5 text-xs font-medium tabular-nums sm:w-32", due.overdue ? "text-rose" : "text-muted-foreground")}>
                <CalendarDays aria-hidden className={cn("size-3.5 shrink-0", due.overdue ? "text-rose" : "text-amethyst/80")} />
                <span className="truncate">{due.overdue ? `Overdue · ${due.text}` : due.text}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground transition-colors group-hover/task:text-amethyst">{task.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {task.entryTitle} · {task.fileName}
                </span>
              </span>
              {task.starred ? <Star aria-label="Important" className="size-3.5 shrink-0 fill-current text-amethyst" /> : null}
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-[color,translate] group-hover/task:translate-x-0.5 group-hover/task:text-amethyst" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
