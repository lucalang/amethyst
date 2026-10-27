"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { AccentPicker, IconPicker } from "@/components/categories/collection-identity-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TaskList } from "@/lib/tasks/model";
import { taskNameSchema } from "@/lib/validation/tasks";
import { errorMessage } from "@/components/workspace/client-utils";
import { useTasks } from "./store";
import { useTasksNav } from "./nav";

/** `onCreated` keeps the current view (e.g. choosing where quick add puts tasks) instead of opening the new list. */
export type ListDialogState = { mode: "create"; groupId: string | null; onCreated?: (list: TaskList) => void } | { mode: "edit"; list: TaskList } | null;

/** Create a list or edit its name, icon and color. */
export function ListDialog({ state, onClose }: { state: ListDialogState; onClose: () => void }) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">{state ? <ListForm key={state.mode === "edit" ? state.list.id : "new"} state={state} onClose={onClose} /> : null}</DialogContent>
    </Dialog>
  );
}

function ListForm({ state, onClose }: { state: NonNullable<ListDialogState>; onClose: () => void }) {
  const { actions } = useTasks();
  const nav = useTasksNav();
  const editing = state.mode === "edit" ? state.list : null;
  const [name, setName] = useState(editing?.name ?? "");
  const [icon, setIcon] = useState<string | null>(editing?.icon ?? null);
  const [accent, setAccent] = useState<string | null>(editing?.accent ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = taskNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        const message = await actions.updateList(editing.id, { name: parsed.data, icon, accentColor: accent }, { quiet: true });
        if (message) throw new Error(message);
      } else if (state.mode === "create") {
        const list = await actions.createList({ name: parsed.data, groupId: state.groupId, icon, accentColor: accent });
        if (state.onCreated) state.onCreated(list);
        else nav.go(`/tasks/lists/${list.id}`);
        requestAnimationFrame(() => document.getElementById("tasks-quick-add")?.focus());
      }
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit list" : "New list"}</DialogTitle>
        <DialogDescription>Name the list and optionally give it an icon and color.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="task-list-name">Name</Label>
        <Input
          id="task-list-name"
          value={name}
          autoFocus
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "task-list-error" : undefined}
          placeholder="e.g. Groceries"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="task-list-icon">Icon</Label>
        <IconPicker id="task-list-icon" value={icon} onChange={setIcon} accent={accent} disabled={busy} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="task-list-accent">Color</Label>
        <AccentPicker id="task-list-accent" value={accent} onChange={setAccent} disabled={busy} />
      </div>
      {error ? (
        <p id="task-list-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
          {editing ? "Save" : "Create list"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export type GroupDialogState = { mode: "create"; moveListId?: string } | { mode: "rename"; id: string; name: string } | null;

export function GroupDialog({ state, onClose }: { state: GroupDialogState; onClose: () => void }) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">{state ? <GroupForm key={state.mode === "rename" ? state.id : "new"} state={state} onClose={onClose} /> : null}</DialogContent>
    </Dialog>
  );
}

function GroupForm({ state, onClose }: { state: NonNullable<GroupDialogState>; onClose: () => void }) {
  const { actions, sidebar } = useTasks();
  const [name, setName] = useState(state.mode === "rename" ? state.name : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = taskNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (state.mode === "rename") {
        const message = await actions.updateGroup(state.id, { name: parsed.data });
        if (message) throw new Error(message);
      } else {
        const group = await actions.createGroup(parsed.data);
        if (state.moveListId) {
          // "Move to a new group": the new group takes the list.
          const layout = sidebar
            .map((item) =>
              item.kind === "group"
                ? { group: item.group.id, lists: item.lists.map((list) => list.id).filter((id) => id !== state.moveListId) }
                : { list: item.list.id },
            )
            .filter((item) => !("list" in item) || item.list !== state.moveListId);
          layout.push({ group: group.id, lists: [state.moveListId] });
          await actions.saveLayout(layout);
        }
      }
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{state.mode === "rename" ? "Rename group" : "New group"}</DialogTitle>
        <DialogDescription>Groups keep related lists together in the sidebar.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="task-group-name">Name</Label>
        <Input
          id="task-group-name"
          value={name}
          autoFocus
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          placeholder="e.g. Home"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
          {state.mode === "rename" ? "Save" : "Create group"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Confirms deleting a list, spelling out what goes with it. */
export function DeleteListDialog({ list, onClose }: { list: TaskList | null; onClose: () => void }) {
  const { actions, allTasks, stepsByTask } = useTasks();
  const nav = useTasksNav();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tasks = list ? allTasks.filter((task) => task.listId === list.id) : [];
  const open = tasks.filter((task) => !task.completedAt).length;
  const steps = tasks.reduce((sum, task) => sum + (stepsByTask.get(task.id)?.length ?? 0), 0);
  const notes = tasks.filter((task) => task.hasNotes).length;

  async function confirm(event: React.MouseEvent) {
    event.preventDefault();
    if (!list) return;
    setBusy(true);
    setError(null);
    const message = await actions.deleteList(list.id, tasks.length);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    if (nav.view?.kind === "list" && nav.view.id === list.id) nav.go("/tasks", { replace: true });
    onClose();
  }

  return (
    <AlertDialog
      open={list !== null}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{list?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {tasks.length === 0
              ? "The list is empty. This can't be undone."
              : `This permanently deletes ${plural(tasks.length, "task")} (${open} open, ${tasks.length - open} completed)${
                  steps ? `, ${plural(steps, "step")}` : ""
                }${notes ? ` and the notes on ${plural(notes, "task")}` : ""}. They also disappear from My Day, Important and Planned. This can't be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={confirm}>
            {busy ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
            Delete list
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DeleteGroupDialog({ group, onClose }: { group: { id: string; name: string; lists: number } | null; onClose: () => void }) {
  const { actions } = useTasks();
  return (
    <AlertDialog open={group !== null} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete group “{group?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {group?.lists
              ? `Its ${plural(group.lists, "list")} and their tasks are kept; they move out of the group and stay where it was.`
              : "The group is empty."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (group) void actions.deleteGroup(group.id);
              onClose();
            }}
          >
            Delete group
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
