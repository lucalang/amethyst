"use client";

import { createContext, use } from "react";
import type { TaskView } from "@/lib/tasks/model";

export type TasksNav = {
  view: TaskView | null;
  selectedId: string | null;
  query: string;
  /** Client-side navigation inside Tasks (no server round trip). */
  go: (path: string, options?: { replace?: boolean }) => void;
  select: (taskId: string | null) => void;
  setQuery: (query: string) => void;
  openNav: () => void;
};

export const TasksNavContext = createContext<TasksNav | null>(null);

export function useTasksNav(): TasksNav {
  const nav = use(TasksNavContext);
  if (!nav) throw new Error("useTasksNav must be used inside TasksApp");
  return nav;
}
