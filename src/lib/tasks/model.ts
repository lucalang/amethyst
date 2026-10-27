import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];

export type TaskGroup = { id: string; name: string; position: number; collapsed: boolean; updatedAt: string };
export type TaskList = {
  id: string;
  groupId: string | null;
  name: string;
  icon: string | null;
  accent: string | null;
  position: number;
  showCompleted: boolean;
  updatedAt: string;
};
export type Task = {
  id: string;
  listId: string;
  title: string;
  notesRev: number;
  hasNotes: boolean;
  important: boolean;
  dueDate: string | null;
  myDayOn: string | null;
  completedAt: string | null;
  entryId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};
export type TaskStep = { id: string; taskId: string; title: string; completed: boolean; position: number; updatedAt: string };
export type TaskEntryRef = { id: string; title: string; slug: string };
export type TaskDeletion = { kind: "group" | "list" | "task" | "step"; id: string };

export type TaskChanges = {
  now: string;
  full: boolean;
  groups: TaskGroup[];
  lists: TaskList[];
  tasks: Task[];
  steps: TaskStep[];
  entries: TaskEntryRef[];
  deleted: TaskDeletion[];
};

type GroupRow = Omit<Tables["task_groups"]["Row"], "user_id">;
type ListRow = Omit<Tables["task_lists"]["Row"], "user_id" | "is_inbox">;
type TaskRow = Omit<Tables["tasks"]["Row"], "user_id" | "notes">;
type StepRow = Omit<Tables["task_steps"]["Row"], "user_id">;

export const TASK_COLUMNS =
  "id, list_id, title, notes_rev, has_notes, important, due_date, my_day_on, completed_at, entry_id, position, created_at, updated_at";
export const LIST_COLUMNS = "id, group_id, name, icon, accent_color, position, show_completed, created_at, updated_at";
export const GROUP_COLUMNS = "id, name, position, collapsed, created_at, updated_at";
export const STEP_COLUMNS = "id, task_id, title, completed, position, created_at, updated_at";

export const mapGroup = (row: GroupRow): TaskGroup => ({
  id: row.id,
  name: row.name,
  position: row.position,
  collapsed: row.collapsed,
  updatedAt: row.updated_at,
});

export const mapList = (row: ListRow): TaskList => ({
  id: row.id,
  groupId: row.group_id,
  name: row.name,
  icon: row.icon,
  accent: row.accent_color,
  position: row.position,
  showCompleted: row.show_completed,
  updatedAt: row.updated_at,
});

export const mapTask = (row: TaskRow): Task => ({
  id: row.id,
  listId: row.list_id,
  title: row.title,
  notesRev: row.notes_rev,
  hasNotes: row.has_notes,
  important: row.important,
  dueDate: row.due_date,
  myDayOn: row.my_day_on,
  completedAt: row.completed_at,
  entryId: row.entry_id,
  position: row.position,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapStep = (row: StepRow): TaskStep => ({
  id: row.id,
  taskId: row.task_id,
  title: row.title,
  completed: row.completed,
  position: row.position,
  updatedAt: row.updated_at,
});

/** Parse the jsonb returned by the task_changes() database function. */
export function mapChanges(raw: unknown): TaskChanges {
  const value = raw as {
    now: string;
    full: boolean;
    groups: GroupRow[];
    lists: ListRow[];
    tasks: TaskRow[];
    steps: StepRow[];
    entries: TaskEntryRef[];
    deleted: TaskDeletion[];
  };
  return {
    now: value.now,
    full: value.full,
    groups: value.groups.map(mapGroup),
    lists: value.lists.map(mapList),
    tasks: value.tasks.map(mapTask),
    steps: value.steps.map(mapStep),
    entries: value.entries,
    deleted: value.deleted,
  };
}

// ---------------------------------------------------------------------------
// Dates. "Today" is the calendar day in the account's configured time zone, or the
// browser's own zone when none is set (settings.timeZone === "").
// ---------------------------------------------------------------------------
export function dateInZone(date: Date, timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return dateInZone(date);
  }
}

export function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Views. Smart views only *reference* tasks that live in real lists.
// ---------------------------------------------------------------------------
export type SmartViewId = "my-day" | "important" | "planned";
export type TaskView = { kind: "smart"; id: SmartViewId } | { kind: "list"; id: string } | { kind: "search" };

export type SmartView = {
  id: SmartViewId;
  label: string;
  /** Segment under /tasks ("" = /tasks itself). */
  slug: string;
  description: string;
  includes: (task: Task, today: string) => boolean;
  /** Smart views with their own completed section (the others show open tasks only). */
  showsCompletedSection: boolean;
};

export const SMART_VIEWS: SmartView[] = [
  {
    id: "my-day",
    label: "My Day",
    slug: "",
    description: "Tasks you picked for today. A new day starts with a clean slate.",
    includes: (task, today) => task.myDayOn === today,
    showsCompletedSection: true,
  },
  {
    id: "important",
    label: "Important",
    slug: "important",
    description: "Starred tasks that are still open.",
    includes: (task) => task.important && !task.completedAt,
    showsCompletedSection: false,
  },
  {
    id: "planned",
    label: "Planned",
    slug: "planned",
    description: "Open tasks with a due date.",
    includes: (task) => Boolean(task.dueDate) && !task.completedAt,
    showsCompletedSection: false,
  },
];

/** Retired /tasks/<slug> pages; their URLs now open My Day (or the former Inbox list). */
export const RETIRED_TASK_SLUGS = ["inbox", "all", "completed"];

export const smartView = (id: SmartViewId) => SMART_VIEWS.find((view) => view.id === id)!;

export function viewPath(view: TaskView): string {
  if (view.kind === "search") return "/tasks/search";
  if (view.kind === "list") return `/tasks/lists/${view.id}`;
  const slug = smartView(view.id).slug;
  return slug ? `/tasks/${slug}` : "/tasks";
}

/** Resolve a /tasks pathname to a view. */
export function parseTasksPath(pathname: string): TaskView | null {
  const segments = pathname.replace(/^\/tasks\/?/, "").split("/").filter(Boolean);
  if (segments.length === 0) return { kind: "smart", id: "my-day" };
  if (segments.length === 1) {
    if (segments[0] === "search") return { kind: "search" };
    if (RETIRED_TASK_SLUGS.includes(segments[0])) return { kind: "smart", id: "my-day" };
    const smart = SMART_VIEWS.find((view) => view.slug === segments[0]);
    return smart ? { kind: "smart", id: smart.id } : null;
  }
  if (segments.length === 2 && segments[0] === "lists") return { kind: "list", id: segments[1] };
  return null;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------
export const TASK_SORTS = [
  { id: "manual", label: "Custom order" },
  { id: "importance", label: "Importance" },
  { id: "due", label: "Due date" },
  { id: "title", label: "Alphabetically" },
  { id: "created", label: "Creation date" },
] as const;
export type TaskSort = (typeof TASK_SORTS)[number]["id"];

const byPosition = (a: Task, b: Task) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export function sortTasks(tasks: Task[], sort: TaskSort, listOrder?: Map<string, number>): Task[] {
  const manual = (a: Task, b: Task) =>
    (listOrder ? (listOrder.get(a.listId) ?? 0) - (listOrder.get(b.listId) ?? 0) : 0) || byPosition(a, b);
  const compare: Record<TaskSort, (a: Task, b: Task) => number> = {
    manual,
    importance: (a, b) => Number(b.important) - Number(a.important) || manual(a, b),
    due: (a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || manual(a, b),
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }) || manual(a, b),
    created: (a, b) => b.createdAt.localeCompare(a.createdAt) || manual(a, b),
  };
  return [...tasks].sort(compare[sort]);
}

export const byCompletedDesc = (a: Task, b: Task) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "") || a.id.localeCompare(b.id);

/** Planned view sections relative to today. */
export function plannedBucket(dueDate: string, today: string): "overdue" | "today" | "tomorrow" | "week" | "later" {
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  if (dueDate === shiftDate(today, 1)) return "tomorrow";
  if (dueDate <= shiftDate(today, 7)) return "week";
  return "later";
}

export const PLANNED_LABELS = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "Next 7 days",
  later: "Later",
} as const;
