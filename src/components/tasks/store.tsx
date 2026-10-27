"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useSettings } from "@/components/layout/settings-context";
import { createClient } from "@/lib/supabase/client";
import {
  dateInZone,
  type Task,
  type TaskChanges,
  type TaskEntryRef,
  type TaskGroup,
  type TaskList,
  type TaskStep,
} from "@/lib/tasks/model";
import type { TaskLayoutItem } from "@/lib/validation/tasks";
import { errorMessage } from "@/components/workspace/client-utils";

type Data = {
  groups: Record<string, TaskGroup>;
  lists: Record<string, TaskList>;
  tasks: Record<string, Task>;
  steps: Record<string, TaskStep>;
  entries: Record<string, TaskEntryRef>;
};
type Table = keyof Data;
type Patch = { [K in Table]?: Record<string, Data[K][string] | null> };

export type TaskPatch = {
  title?: string;
  important?: boolean;
  dueDate?: string | null;
  myDay?: string | null;
  completed?: boolean;
  listId?: string;
  entryId?: string | null;
};
export type Ghost = { key: string; listId: string; title: string };
export type SidebarItem = { kind: "group"; group: TaskGroup; lists: TaskList[] } | { kind: "list"; list: TaskList };

const byPosition = <T extends { position: number; id: string }>(a: T, b: T) => a.position - b.position || a.id.localeCompare(b.id);
const index = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((row) => [row.id, row]));

function applyPatch(data: Data, patch: Patch): Data {
  const next = { ...data };
  for (const table of Object.keys(patch) as Table[]) {
    const rows = { ...data[table] } as Record<string, unknown>;
    for (const [id, row] of Object.entries(patch[table]!)) {
      if (row === null) delete rows[id];
      else rows[id] = row;
    }
    (next as Record<Table, unknown>)[table] = rows;
  }
  return next;
}

function inverseOf(data: Data, patch: Patch): Patch {
  const inverse: Patch = {};
  for (const table of Object.keys(patch) as Table[]) {
    const rows: Record<string, unknown> = {};
    for (const id of Object.keys(patch[table]!)) rows[id] = (data[table] as Record<string, unknown>)[id] ?? null;
    (inverse as Record<Table, unknown>)[table] = rows;
  }
  return inverse;
}

const KIND_TABLE = { group: "groups", list: "lists", task: "tasks", step: "steps" } as const;

/** Merge a sync response; rows with an edit still in flight keep their local version. */
function mergeChanges(data: Data, changes: TaskChanges, pending: Map<string, number>): Data {
  const keep = (table: Table, id: string) => (pending.get(`${table}:${id}`) ?? 0) > 0;
  const base: Data = changes.full
    ? {
        groups: {},
        lists: {},
        tasks: {},
        steps: {},
        entries: {},
      }
    : { ...data };
  if (changes.full) {
    for (const key of pending.keys()) {
      const [table, id] = key.split(":") as [Table, string];
      const row = (data[table] as Record<string, unknown>)[id];
      if (row && (pending.get(key) ?? 0) > 0) (base[table] as Record<string, unknown>)[id] = row;
    }
  }
  const put = <K extends Table>(table: K, rows: Data[K][string][]) => {
    if (rows.length === 0 && !changes.full) return;
    const target = { ...base[table] } as Record<string, unknown>;
    for (const row of rows) if (!keep(table, row.id)) target[row.id] = row;
    (base as Record<Table, unknown>)[table] = target;
  };
  put("groups", changes.groups);
  put("lists", changes.lists);
  put("tasks", changes.tasks);
  put("steps", changes.steps);
  base.entries = { ...(changes.full ? {} : data.entries), ...index(changes.entries) };
  if (changes.deleted.length) {
    for (const table of ["groups", "lists", "tasks", "steps"] as const) base[table] = { ...base[table] } as never;
    for (const { kind, id } of changes.deleted) delete (base[KIND_TABLE[kind]] as Record<string, unknown>)[id];
  }
  return base;
}

const subscribeToMinutes = (onChange: () => void) => {
  const timer = window.setInterval(onChange, 30_000);
  window.addEventListener("focus", onChange);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", onChange);
  };
};

/** Today's date in the account's time zone (or the device's); a new day re-renders. */
export function useTasksToday(): string | null {
  const { timeZone } = useSettings();
  return useSyncExternalStore(
    subscribeToMinutes,
    () => dateInZone(new Date(), timeZone),
    () => null,
  );
}

type Store = ReturnType<typeof useStoreValue>;
const TasksContext = createContext<Store | null>(null);

export function useTasks(): Store {
  const store = use(TasksContext);
  if (!store) throw new Error("useTasks must be used inside TasksProvider");
  return store;
}

function useStoreValue(userId: string, initial: TaskChanges) {
  const [data, setData] = useState<Data>(() => mergeChanges({ groups: {}, lists: {}, tasks: {}, steps: {}, entries: {} }, initial, new Map()));
  const dataRef = useRef(data);
  const cursorRef = useRef(initial.now);
  const pendingRef = useRef(new Map<string, number>());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [live, setLive] = useState(false);
  const today = useTasksToday();

  const commit = useCallback((update: (current: Data) => Data) => {
    const next = update(dataRef.current);
    dataRef.current = next;
    setData(next);
  }, []);

  // ---- Pulling changes -------------------------------------------------------------------
  const pullState = useRef<{ running: boolean; again: boolean; timer?: number }>({ running: false, again: false });
  const pull = useCallback(async () => {
    const state = pullState.current;
    if (state.running) {
      state.again = true;
      return;
    }
    state.running = true;
    try {
      do {
        state.again = false;
        const changes = await apiFetch<TaskChanges>(`/api/tasks/sync?since=${encodeURIComponent(cursorRef.current)}`);
        cursorRef.current = changes.now;
        commit((current) => mergeChanges(current, changes, pendingRef.current));
      } while (state.again);
    } catch {
      // Offline or signed out: the next focus, reconnect or broadcast tries again.
    } finally {
      state.running = false;
    }
  }, [commit]);

  const schedulePull = useCallback(
    (delay = 250) => {
      window.clearTimeout(pullState.current.timer);
      pullState.current.timer = window.setTimeout(() => void pull(), delay);
    },
    [pull],
  );

  // Realtime: a private per-account topic only says "something changed"; rows come from /sync.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void (async () => {
      try {
        await supabase.realtime.setAuth();
      } catch {
        return;
      }
      if (cancelled) return;
      channel = supabase
        .channel(`tasks:${userId}`, { config: { private: true } })
        .on("broadcast", { event: "changed" }, () => schedulePull())
        .subscribe((status) => {
          const subscribed = status === "SUBSCRIBED";
          setLive(subscribed);
          // Catch up on anything missed while the connection was down.
          if (subscribed) schedulePull(0);
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId, schedulePull]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") schedulePull(0);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    // Without a live connection, check occasionally while the page is visible.
    const timer = live ? undefined : window.setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [live, schedulePull]);

  // ---- Mutations ---------------------------------------------------------------------------
  /** Serialize requests so edits to the same rows reach the server in the order they were made. */
  const enqueue = useCallback(<R,>(job: () => Promise<R>): Promise<R> => {
    const run = queueRef.current.then(job, job);
    queueRef.current = run.catch(() => undefined);
    return run;
  }, []);

  /**
   * Apply `patch` immediately, send `request`, then apply the server's rows. On failure the
   * touched rows are restored and the message is returned (and toasted unless `quiet`).
   */
  const mutate = useCallback(
    async <R,>(
      patch: Patch,
      request: () => Promise<R>,
      options: { done?: (result: R) => Patch | void; failure?: string; quiet?: boolean; pullAfter?: boolean } = {},
    ): Promise<string | null> => {
      const keys = (Object.keys(patch) as Table[]).flatMap((table) => Object.keys(patch[table]!).map((id) => `${table}:${id}`));
      const pending = pendingRef.current;
      const inverse = inverseOf(dataRef.current, patch);
      commit((current) => applyPatch(current, patch));
      for (const key of keys) pending.set(key, (pending.get(key) ?? 0) + 1);
      const release = () => {
        for (const key of keys) {
          const count = (pending.get(key) ?? 1) - 1;
          if (count > 0) pending.set(key, count);
          else pending.delete(key);
        }
      };
      try {
        const result = await enqueue(request);
        const serverPatch = options.done?.(result);
        if (serverPatch) {
          // Rows with newer local edits still in flight keep those edits.
          const filtered: Patch = {};
          for (const table of Object.keys(serverPatch) as Table[]) {
            const rows = Object.entries(serverPatch[table]!).filter(([id]) => (pending.get(`${table}:${id}`) ?? 0) <= 1);
            (filtered as Record<Table, unknown>)[table] = Object.fromEntries(rows);
          }
          commit((current) => applyPatch(current, filtered));
        }
        release();
        if (options.pullAfter) schedulePull(0);
        return null;
      } catch (error) {
        release();
        commit((current) => applyPatch(current, inverse));
        const message = errorMessage(error);
        if (!options.quiet) toast.error(options.failure ?? "Change not saved", { description: message });
        if (error instanceof ApiError && (error.status === 404 || error.status === 409 || error.status === 422)) schedulePull(0);
        return message;
      }
    },
    [commit, enqueue, schedulePull],
  );

  const actions = useMemo(() => {
    const task = (id: string) => dataRef.current.tasks[id];
    const nowIso = () => new Date().toISOString();

    return {
      pull: () => schedulePull(0),

      async addTasks(listId: string, items: { title: string; completed: boolean }[], extras: { important?: boolean; dueDate?: string | null; myDay?: string | null } = {}) {
        const batch = items.map((item, offset) => ({ key: `${Date.now()}-${offset}-${Math.random()}`, listId, title: item.title }));
        setGhosts((current) => [...batch, ...current]);
        try {
          const result = await enqueue(() => apiFetch<{ tasks: Task[] }>("/api/tasks", { method: "POST", json: { listId, tasks: items, ...extras } }));
          commit((current) => applyPatch(current, { tasks: index(result.tasks) }));
          return null;
        } catch (error) {
          const message = errorMessage(error);
          toast.error(items.length > 1 ? "Tasks not added" : "Task not added", { description: message });
          return message;
        } finally {
          const keys = new Set(batch.map((ghost) => ghost.key));
          setGhosts((current) => current.filter((ghost) => !keys.has(ghost.key)));
        }
      },

      updateTask(id: string, patch: TaskPatch, options: { failure?: string; quiet?: boolean } = {}) {
        const current = task(id);
        if (!current) return Promise.resolve("That task no longer exists.");
        const next: Task = {
          ...current,
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.important !== undefined && { important: patch.important }),
          ...(patch.dueDate !== undefined && { dueDate: patch.dueDate }),
          ...(patch.myDay !== undefined && { myDayOn: patch.myDay }),
          ...(patch.completed !== undefined && { completedAt: patch.completed ? nowIso() : null }),
          ...(patch.entryId !== undefined && { entryId: patch.entryId }),
        };
        if (patch.listId !== undefined && patch.listId !== current.listId) {
          const top = Object.values(dataRef.current.tasks).filter((other) => other.listId === patch.listId);
          next.listId = patch.listId;
          next.position = Math.min(0, ...top.map((other) => other.position)) - 1;
        }
        return mutate(
          { tasks: { [id]: next } },
          () => apiFetch<{ task: Task; entry: TaskEntryRef | null }>(`/api/tasks/${id}`, { method: "PATCH", json: patch }),
          {
            failure: options.failure,
            quiet: options.quiet,
            done: (result) => ({ tasks: { [id]: result.task }, ...(result.entry && { entries: { [result.entry.id]: result.entry } }) }),
          },
        );
      },

      deleteTask(id: string) {
        const steps = Object.values(dataRef.current.steps).filter((step) => step.taskId === id);
        return mutate(
          { tasks: { [id]: null }, steps: Object.fromEntries(steps.map((step) => [step.id, null])) },
          () => apiFetch(`/api/tasks/${id}`, { method: "DELETE" }),
          { failure: "Task not deleted" },
        );
      },

      /** `orderedIds`: every task shown in the list's manual order (open tasks only is fine). */
      reorderTasks(orderedIds: string[]) {
        const rows = orderedIds.map(task).filter(Boolean);
        const slots = rows.map((row) => row.position).sort((a, b) => a - b);
        // Keep slots distinct so the local order matches what the server will store.
        for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1;
        const patch = Object.fromEntries(rows.map((row, i) => [row.id, { ...row, position: slots[i] }]));
        return mutate({ tasks: patch }, () => apiFetch("/api/tasks/order", { method: "PUT", json: { taskIds: rows.map((row) => row.id) } }), {
          failure: "Order not saved",
          pullAfter: true,
        });
      },

      async addStep(taskId: string, title: string) {
        try {
          const result = await enqueue(() => apiFetch<{ step: TaskStep }>(`/api/tasks/${taskId}/steps`, { method: "POST", json: { title } }));
          commit((current) => applyPatch(current, { steps: { [result.step.id]: result.step } }));
          return null;
        } catch (error) {
          const message = errorMessage(error);
          toast.error("Step not added", { description: message });
          return message;
        }
      },

      updateStep(id: string, patch: { title?: string; completed?: boolean }) {
        const current = dataRef.current.steps[id];
        if (!current) return Promise.resolve("That step no longer exists.");
        return mutate(
          { steps: { [id]: { ...current, ...patch } } },
          () => apiFetch<{ step: TaskStep }>(`/api/task-steps/${id}`, { method: "PATCH", json: patch }),
          { failure: "Step not saved", done: (result) => ({ steps: { [id]: result.step } }) },
        );
      },

      deleteStep(id: string) {
        return mutate({ steps: { [id]: null } }, () => apiFetch(`/api/task-steps/${id}`, { method: "DELETE" }), { failure: "Step not deleted" });
      },

      reorderSteps(taskId: string, orderedIds: string[]) {
        const steps = dataRef.current.steps;
        const patch = Object.fromEntries(orderedIds.filter((id) => steps[id]).map((id, i) => [id, { ...steps[id], position: i }]));
        return mutate({ steps: patch }, () => apiFetch(`/api/tasks/${taskId}/steps`, { method: "PUT", json: { stepIds: orderedIds } }), {
          failure: "Order not saved",
          pullAfter: true,
        });
      },

      async createList(input: { name: string; groupId?: string | null; icon?: string | null; accentColor?: string | null }) {
        const result = await enqueue(() => apiFetch<{ list: TaskList }>("/api/task-lists", { method: "POST", json: input }));
        commit((current) => applyPatch(current, { lists: { [result.list.id]: result.list } }));
        return result.list;
      },

      updateList(id: string, patch: { name?: string; icon?: string | null; accentColor?: string | null; showCompleted?: boolean }, options: { quiet?: boolean } = {}) {
        const current = dataRef.current.lists[id];
        if (!current) return Promise.resolve("That list no longer exists.");
        const next: TaskList = {
          ...current,
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.icon !== undefined && { icon: patch.icon }),
          ...(patch.accentColor !== undefined && { accent: patch.accentColor }),
          ...(patch.showCompleted !== undefined && { showCompleted: patch.showCompleted }),
        };
        return mutate({ lists: { [id]: next } }, () => apiFetch<{ list: TaskList }>(`/api/task-lists/${id}`, { method: "PATCH", json: patch }), {
          failure: "List not saved",
          quiet: options.quiet,
          done: (result) => ({ lists: { [id]: result.list } }),
        });
      },

      async deleteList(id: string, expectedTasks: number) {
        try {
          await enqueue(() => apiFetch(`/api/task-lists/${id}`, { method: "DELETE", json: { expectedTasks } }));
        } catch (error) {
          if (error instanceof ApiError && error.status !== 500) schedulePull(0);
          return errorMessage(error);
        }
        const { tasks, steps } = dataRef.current;
        const taskIds = new Set(Object.values(tasks).filter((row) => row.listId === id).map((row) => row.id));
        commit((current) =>
          applyPatch(current, {
            lists: { [id]: null },
            tasks: Object.fromEntries([...taskIds].map((taskId) => [taskId, null])),
            steps: Object.fromEntries(Object.values(steps).filter((step) => taskIds.has(step.taskId)).map((step) => [step.id, null])),
          }),
        );
        return null;
      },

      async createGroup(name: string) {
        const result = await enqueue(() => apiFetch<{ group: TaskGroup }>("/api/task-groups", { method: "POST", json: { name } }));
        commit((current) => applyPatch(current, { groups: { [result.group.id]: result.group } }));
        return result.group;
      },

      updateGroup(id: string, patch: { name?: string; collapsed?: boolean }) {
        const current = dataRef.current.groups[id];
        if (!current) return Promise.resolve("That group no longer exists.");
        return mutate({ groups: { [id]: { ...current, ...patch } } }, () => apiFetch<{ group: TaskGroup }>(`/api/task-groups/${id}`, { method: "PATCH", json: patch }), {
          failure: "Group not saved",
          done: (result) => ({ groups: { [id]: result.group } }),
        });
      },

      deleteGroup(id: string) {
        const lists = Object.values(dataRef.current.lists).filter((list) => list.groupId === id);
        return mutate(
          { groups: { [id]: null }, lists: Object.fromEntries(lists.map((list) => [list.id, { ...list, groupId: null }])) },
          () => apiFetch(`/api/task-groups/${id}`, { method: "DELETE" }),
          { failure: "Group not deleted", pullAfter: true },
        );
      },

      /** Persist the whole sidebar order (and list group membership). */
      saveLayout(layout: TaskLayoutItem[]) {
        const { groups, lists } = dataRef.current;
        const patch: Patch = { groups: {}, lists: {} };
        layout.forEach((item, position) => {
          if ("list" in item) {
            if (lists[item.list]) patch.lists![item.list] = { ...lists[item.list], groupId: null, position };
          } else {
            if (groups[item.group]) patch.groups![item.group] = { ...groups[item.group], position };
            item.lists.forEach((listId, inner) => {
              if (lists[listId]) patch.lists![listId] = { ...lists[listId], groupId: item.group, position: inner };
            });
          }
        });
        return mutate(patch, () => apiFetch("/api/task-lists/layout", { method: "PUT", json: { layout } }), { failure: "Order not saved", pullAfter: true });
      },

      /** Notes save outside the queue; the revision check protects text edited elsewhere. */
      async saveNotes(id: string, notes: string, notesRev: number): Promise<{ ok: true; rev: number } | { ok: false; conflict: boolean; message: string }> {
        try {
          const result = await apiFetch<{ task: Task }>(`/api/tasks/${id}`, { method: "PATCH", json: { notes, notesRev } });
          commit((current) => {
            const row = current.tasks[id];
            if (!row) return current;
            return applyPatch(current, {
              tasks: { [id]: { ...row, notesRev: result.task.notesRev, hasNotes: result.task.hasNotes, updatedAt: result.task.updatedAt } },
            });
          });
          return { ok: true, rev: result.task.notesRev };
        } catch (error) {
          return { ok: false, conflict: error instanceof ApiError && error.code === "notes_conflict", message: errorMessage(error) };
        }
      },
    };
  }, [commit, enqueue, mutate, schedulePull]);

  // ---- Derived -----------------------------------------------------------------------------
  const derived = useMemo(() => {
    const lists = Object.values(data.lists);
    const inbox = lists.find((list) => list.isInbox) ?? null;
    const groups = Object.values(data.groups).sort(byPosition);
    const sidebar: SidebarItem[] = [
      ...groups.map((group) => ({ kind: "group" as const, group, lists: lists.filter((list) => list.groupId === group.id).sort(byPosition) })),
      ...lists.filter((list) => !list.isInbox && (!list.groupId || !data.groups[list.groupId])).map((list) => ({ kind: "list" as const, list })),
    ].sort((a, b) => {
      const pa = a.kind === "group" ? a.group.position : a.list.position;
      const pb = b.kind === "group" ? b.group.position : b.list.position;
      return pa - pb || (a.kind === b.kind ? 0 : a.kind === "group" ? -1 : 1);
    });
    // Inbox first, then the sidebar order; used to sort tasks from many lists.
    const listOrder = new Map<string, number>();
    if (inbox) listOrder.set(inbox.id, 0);
    for (const item of sidebar) for (const list of item.kind === "group" ? item.lists : [item.list]) listOrder.set(list.id, listOrder.size);
    const stepsByTask = new Map<string, TaskStep[]>();
    for (const step of Object.values(data.steps)) {
      const bucket = stepsByTask.get(step.taskId);
      if (bucket) bucket.push(step);
      else stepsByTask.set(step.taskId, [step]);
    }
    for (const bucket of stepsByTask.values()) bucket.sort(byPosition);
    return { inbox, sidebar, listOrder, stepsByTask, allTasks: Object.values(data.tasks) };
  }, [data]);

  return { userId, today, live, data, ghosts, ...derived, actions };
}

export function TasksProvider({ userId, initial, children }: { userId: string; initial: TaskChanges; children: React.ReactNode }) {
  const store = useStoreValue(userId, initial);
  return <TasksContext value={store}>{children}</TasksContext>;
}
