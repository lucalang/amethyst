"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FolderInput,
  FolderPlus,
  GripVertical,
  List,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { ClientCollectionIcon } from "@/components/categories/collection-identity-fields";
import { Button } from "@/components/ui/button";
import { glide, haptic, InsertionLine, LIFT_SCALE, LIFT_TRANSITION, lockPageForDrag, reducedMotion } from "@/components/ui/list-drag";
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
import { accentStyle } from "@/lib/collection-identity";
import { SMART_VIEWS, viewPath, type SmartViewId, type TaskList } from "@/lib/tasks/model";
import type { TaskLayoutItem } from "@/lib/validation/tasks";
import { cn } from "@/lib/utils";
import { DeleteGroupDialog, DeleteListDialog, GroupDialog, ListDialog, type GroupDialogState, type ListDialogState } from "./list-dialogs";
import { useTasksNav } from "./nav";
import { useTasks, type SidebarItem } from "./store";

export const SMART_ICONS: Record<SmartViewId, LucideIcon> = {
  "my-day": Sun,
  important: Star,
  planned: CalendarDays,
};

export function ListGlyph({ list, className }: { list: Pick<TaskList, "icon">; className?: string }) {
  if (list.icon) return <ClientCollectionIcon icon={list.icon} className={className} />;
  return <List aria-hidden className={className} />;
}

const toLayout = (sidebar: SidebarItem[]): TaskLayoutItem[] =>
  sidebar.map((item) => (item.kind === "group" ? { group: item.group.id, lists: item.lists.map((list) => list.id) } : { list: item.list.id }));

const withoutList = (layout: TaskLayoutItem[], listId: string): TaskLayoutItem[] =>
  layout
    .filter((item) => !("list" in item) || item.list !== listId)
    .map((item) => ("group" in item ? { group: item.group, lists: item.lists.filter((id) => id !== listId) } : item));

const sameLayout = (a: TaskLayoutItem[], b: TaskLayoutItem[]) => JSON.stringify(a) === JSON.stringify(b);

/** Place a list at `index` inside `groupId` (or at top-level `index` when groupId is null). */
function placeList(layout: TaskLayoutItem[], listId: string, groupId: string | null, index: number): TaskLayoutItem[] {
  const base = withoutList(layout, listId);
  if (groupId) {
    return base.map((item) => {
      if (!("group" in item) || item.group !== groupId) return item;
      const lists = [...item.lists];
      lists.splice(Math.max(0, Math.min(index, lists.length)), 0, listId);
      return { group: item.group, lists };
    });
  }
  const next = [...base];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, { list: listId });
  return next;
}

const topIndexOf = (layout: TaskLayoutItem[], id: string) => layout.findIndex((item) => ("group" in item ? item.group : item.list) === id);

/** Sidebar of smart views and the account's groups and lists. */
export function TasksSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { sidebar, allTasks, today, data, actions } = useTasks();
  const nav = useTasksNav();
  const [drag, setDrag] = useState<SidebarDrag | null>(null);
  const dragId = drag?.id ?? null;
  const [listDialog, setListDialog] = useState<ListDialogState>(null);
  const [groupDialog, setGroupDialog] = useState<GroupDialogState>(null);
  const [deleteList, setDeleteList] = useState<TaskList | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<{ id: string; name: string; lists: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<SidebarDrag | null>(null);
  const stopDrag = useRef<(() => void) | null>(null);
  /** The dropped row's on-screen top before the new order rendered, so it can glide into place. */
  const settle = useRef<{ id: string; top: number } | null>(null);
  const layout = useMemo(() => toLayout(sidebar), [sidebar]);
  const shown = layout;

  const counts = useMemo(() => {
    const open = allTasks.filter((task) => !task.completedAt);
    const byList = new Map<string, number>();
    for (const task of open) byList.set(task.listId, (byList.get(task.listId) ?? 0) + 1);
    const smart: Partial<Record<SmartViewId, number>> = {};
    for (const view of SMART_VIEWS) {
      smart[view.id] = today === null && view.id === "my-day" ? 0 : open.filter((task) => view.includes(task, today ?? "")).length;
    }
    return { byList, smart };
  }, [allTasks, today]);

  const navigate = (path: string) => {
    nav.go(path);
    onNavigate?.();
  };
  const isActive = (path: string) => nav.view !== null && viewPath(nav.view) === path;
  const listName = (id: string) => data.lists[id]?.name ?? "List";

  function commitLayout(next: TaskLayoutItem[], message?: string) {
    if (sameLayout(next, layout)) return;
    void actions.saveLayout(next);
    if (message) setAnnouncement(message);
  }

  // ---- Accessible move controls -----------------------------------------------------------
  function moveList(listId: string, delta: number) {
    const groupItem = layout.find((item) => "group" in item && item.lists.includes(listId)) as { group: string; lists: string[] } | undefined;
    if (groupItem) {
      const index = groupItem.lists.indexOf(listId) + delta;
      if (index < 0 || index >= groupItem.lists.length) return;
      commitLayout(placeList(layout, listId, groupItem.group, index), `${listName(listId)} moved ${delta < 0 ? "up" : "down"}.`);
    } else {
      const index = topIndexOf(layout, listId) + delta;
      if (index < 0 || index >= layout.length) return;
      commitLayout(placeList(layout, listId, null, index), `${listName(listId)} moved ${delta < 0 ? "up" : "down"}.`);
    }
    requestAnimationFrame(() => document.getElementById(`tasks-nav-${listId}`)?.focus());
  }

  function moveToGroup(listId: string, groupId: string | null) {
    const target = groupId ? layout.find((item) => "group" in item && item.group === groupId) : null;
    const index = target && "group" in target ? target.lists.length : layout.length;
    commitLayout(placeList(layout, listId, groupId, index), `${listName(listId)} moved to ${groupId ? (data.groups[groupId]?.name ?? "the group") : "no group"}.`);
  }

  function moveGroup(groupId: string, delta: number) {
    const index = topIndexOf(layout, groupId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= layout.length) return;
    const next = [...layout];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commitLayout(next, `Group ${data.groups[groupId]?.name ?? ""} moved ${delta < 0 ? "up" : "down"}.`);
    requestAnimationFrame(() => document.getElementById(`tasks-group-${groupId}`)?.focus());
  }

  // ---- Pointer dragging ---------------------------------------------------------------------
  // Rows stay where they are while dragging: the picked-up row follows the pointer and a line marks where it will
  // land. Moves are tracked on the window, so nothing (re-rendering, leaving the handle, scrolling) can end a drag
  // early; it ends on release (saves), on cancel or with Escape (no change).
  useEffect(() => () => stopDrag.current?.(), []);

  const blockOf = (id: string, kind: DragKind) =>
    containerRef.current?.querySelector<HTMLElement>(kind === "group" ? `[data-top-block][data-id="${CSS.escape(id)}"]` : `li[data-drag-row][data-id="${CSS.escape(id)}"]`) ?? null;

  /** Where a dragged list or group would land for a pointer position, and where to draw the insertion line. */
  function dropTarget(current: SidebarDrag, clientX: number, clientY: number): Pick<SidebarDrag, "next" | "line"> {
    const container = containerRef.current;
    if (!container) return { next: null, line: null };
    const box = container.getBoundingClientRect();
    if (current.kind === "group") {
      const blocks = [...container.querySelectorAll<HTMLElement>("[data-top-block]")].filter((block) => block.dataset.id !== current.id);
      let index = 0;
      for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        if (clientY > rect.top + rect.height / 2) index += 1;
      }
      const from = topIndexOf(layout, current.id);
      const next = [...layout];
      const [item] = next.splice(from, 1);
      next.splice(index, 0, item);
      const edge = index > 0 ? blocks[index - 1].getBoundingClientRect().bottom : (blocks[0]?.getBoundingClientRect().top ?? box.top);
      return { next, line: { top: edge - box.top, indent: false } };
    }

    const listId = current.id;
    const rows = [...container.querySelectorAll<HTMLElement>("[data-drag-row]")].filter((row) => row.dataset.id !== listId);
    let index = 0;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (clientY > rect.top + rect.height / 2) index += 1;
    }
    const prev = rows[index - 1];
    const base = withoutList(layout, listId);
    let next: TaskLayoutItem[];
    let edge = prev ? prev.getBoundingClientRect().bottom : (rows[0]?.getBoundingClientRect().top ?? box.top);
    if (!prev) next = placeList(base, listId, null, 0);
    else if (prev.dataset.kind === "group") {
      const groupId = prev.dataset.id!;
      if (prev.dataset.collapsed === "true") {
        next = placeList(base, listId, null, topIndexOf(base, groupId) + 1);
        edge = blockOf(groupId, "group")?.getBoundingClientRect().bottom ?? edge;
      } else next = placeList(base, listId, groupId, 0);
    } else if (prev.dataset.group) {
      const groupId = prev.dataset.group;
      const group = base.find((item) => "group" in item && item.group === groupId) as { group: string; lists: string[] };
      const position = group.lists.indexOf(prev.dataset.id!);
      const outdent = clientX < box.left + 36;
      if (position === group.lists.length - 1 && outdent) {
        next = placeList(base, listId, null, topIndexOf(base, groupId) + 1);
        edge = blockOf(groupId, "group")?.getBoundingClientRect().bottom ?? edge;
      } else next = placeList(base, listId, groupId, position + 1);
    } else {
      next = placeList(base, listId, null, topIndexOf(base, prev.dataset.id!) + 1);
    }
    const nested = next.some((item) => "group" in item && item.lists.includes(listId));
    return { next, line: { top: edge - box.top, indent: nested } };
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string, kind: DragKind) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Window listeners below keep the drag going without capture.
    }
    handle.focus({ preventScroll: true });
    const scroller = scrollRef.current;
    const first: SidebarDrag = { id, kind, startY: event.clientY, startScroll: scroller?.scrollTop ?? 0, offset: 0, next: null, line: null };
    dragRef.current = first;
    setDrag(first);
    const pointerType = event.pointerType;
    haptic(pointerType, "lift");
    const unlock = lockPageForDrag();
    const name = kind === "group" ? `Group ${data.groups[id]?.name ?? ""}` : listName(id);
    setAnnouncement(`${name} picked up. Move it, then release to drop, or press Escape to cancel.`);

    let frame = 0;
    let lastX = event.clientX;
    let lastY = event.clientY;
    const update = () => {
      frame = 0;
      const current = dragRef.current;
      if (!current) return;
      // Scroll the sidebar when dragging near its edges.
      if (scroller) {
        const bounds = scroller.getBoundingClientRect();
        if (lastY < bounds.top + 36) scroller.scrollTop -= 8;
        else if (lastY > bounds.bottom - 36) scroller.scrollTop += 8;
      }
      const offset = lastY - current.startY + ((scroller?.scrollTop ?? 0) - current.startScroll);
      const next = { ...current, offset, ...dropTarget(current, lastX, lastY) };
      if (next.line && (next.line.top !== current.line?.top || next.line.indent !== current.line?.indent) && current.line) haptic(pointerType);
      dragRef.current = next;
      setDrag(next);
      if (lastY < (scroller?.getBoundingClientRect().top ?? 0) + 36 || lastY > (scroller?.getBoundingClientRect().bottom ?? Infinity) - 36) frame = requestAnimationFrame(update);
    };
    const onMove = (move: globalThis.PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      move.preventDefault();
      lastX = move.clientX;
      lastY = move.clientY;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const finish = (save: boolean) => {
      stopDrag.current?.();
      const current = dragRef.current;
      dragRef.current = null;
      if (!current) return;
      if (save && current.next && !sameLayout(current.next, layout)) {
        const element = blockOf(current.id, current.kind);
        if (element) settle.current = { id: current.id, top: element.getBoundingClientRect().top };
        haptic(pointerType);
        commitLayout(current.next, `${name} dropped.`);
      } else {
        setAnnouncement(save ? `${name} dropped in the same place.` : `Reordering cancelled. ${name} stayed in place.`);
      }
      setDrag(null);
    };
    const onUp = (up: globalThis.PointerEvent) => up.pointerId === pointerId && finish(true);
    const onCancel = (cancel: globalThis.PointerEvent) => cancel.pointerId === pointerId && finish(false);
    const onKey = (key: globalThis.KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      key.stopPropagation();
      finish(false);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    stopDrag.current = () => {
      stopDrag.current = null;
      cancelAnimationFrame(frame);
      unlock();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      try {
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      } catch {
        // Already released.
      }
    };
  }

  // After a drop renders in its new place, glide the row there from where it was let go.
  useLayoutEffect(() => {
    const target = settle.current;
    if (!target || drag) return;
    settle.current = null;
    const kind: DragKind = data.groups[target.id] ? "group" : "list";
    const element = blockOf(target.id, kind);
    if (!element || reducedMotion()) return;
    // Measure without the drag style's leftover transition, then spring from where it was let go.
    element.style.transition = "none";
    const delta = target.top - element.getBoundingClientRect().top;
    element.style.transition = "";
    glide(element, delta, { lifted: true });
  });

  /** The picked-up row follows the pointer; everything else stays put. */
  const dragStyle = (id: string): CSSProperties | undefined =>
    drag?.id === id ? { translate: `0 ${drag.offset}px`, scale: LIFT_SCALE, transition: LIFT_TRANSITION, position: "relative", zIndex: 20 } : undefined;

  function handleKeys(event: KeyboardEvent<HTMLButtonElement>, move: (delta: number) => void) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      move(event.key === "ArrowUp" ? -1 : 1);
    }
  }

  const groups = Object.values(data.groups);

  function listRow(list: TaskList, groupId: string | null, index: number, siblings: number) {
    const path = `/tasks/lists/${list.id}`;
    return (
      <li
        key={list.id}
        data-drag-row
        data-kind="list"
        data-id={list.id}
        data-group={groupId ?? ""}
        data-top-block={groupId ? undefined : ""}
        style={dragStyle(list.id)}
        className="transition-[translate,scale] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
      >
        <NavRow
          id={`tasks-nav-${list.id}`}
          href={path}
          active={isActive(path)}
          onNavigate={navigate}
          icon={<ListGlyph list={list} className="size-4" />}
          accent={list.accent}
          label={list.name}
          count={counts.byList.get(list.id)}
          indent={Boolean(groupId)}
          dragging={dragId === list.id}
          handle={
            <DragHandle
              label={`Reorder ${list.name}`}
              dragging={dragId === list.id}
              onPointerDown={(event) => startDrag(event, list.id, "list")}
              onKeyDown={(event) => handleKeys(event, (delta) => moveList(list.id, delta))}
            />
          }
          menu={
            <RowMenu label={list.name}>
              <DropdownMenuItem onSelect={() => setListDialog({ mode: "edit", list })}>
                <Pencil aria-hidden /> Edit list
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index === 0} onSelect={() => moveList(list.id, -1)}>
                <ArrowUp aria-hidden /> Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index === siblings - 1} onSelect={() => moveList(list.id, 1)}>
                <ArrowDown aria-hidden /> Move down
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput aria-hidden /> Move to group
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem disabled={groupId === null} onSelect={() => moveToGroup(list.id, null)}>
                    No group
                  </DropdownMenuItem>
                  {groups.map((group) => (
                    <DropdownMenuItem key={group.id} disabled={group.id === groupId} onSelect={() => moveToGroup(list.id, group.id)}>
                      {group.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setGroupDialog({ mode: "create", moveListId: list.id })}>
                    <FolderPlus aria-hidden /> New group…
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteList(list)}>
                <Trash2 aria-hidden /> Delete list
              </DropdownMenuItem>
            </RowMenu>
          }
        />
      </li>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pt-3 pb-2">
        <nav aria-label="Smart lists">
          <ul className="space-y-0.5">
            {SMART_VIEWS.map((view) => {
              const path = viewPath({ kind: "smart", id: view.id });
              const Icon = SMART_ICONS[view.id];
              return (
                <li key={view.id}>
                  <NavRow
                    href={path}
                    active={isActive(path)}
                    onNavigate={navigate}
                    icon={<Icon aria-hidden className={cn("size-4", view.id === "my-day" ? "text-warning" : view.id === "important" ? "text-rose" : "text-amethyst")} />}
                    label={view.label}
                    count={counts.smart[view.id]}
                  />
                </li>
              );
            })}
          </ul>
        </nav>

        <div aria-hidden className="mx-3 my-3 h-px bg-border/70" />

        <nav aria-label="Your lists">
          <p id="tasks-reorder-help" className="sr-only">
            Drag the handle to move it, or press the up and down arrow keys. More moves are in the row’s actions menu.
          </p>
          <div ref={containerRef} className={cn("relative", drag && "cursor-grabbing select-none")}>
            <InsertionLine as="div" top={drag?.line?.top ?? null} left={drag?.line?.indent ? 30 : 8} right={4} />
            {shown.length === 0 ? (
              <p className="px-3 py-2 text-xs leading-5 text-muted-foreground">Make lists for anything — groceries, a project, a trip — and group related ones together.</p>
            ) : (
              <ul className="space-y-0.5">
                {shown.map((item, topIndex) => {
                  if ("list" in item) {
                    const list = data.lists[item.list];
                    return list ? listRow(list, null, topIndex, shown.length) : null;
                  }
                  const group = data.groups[item.group];
                  if (!group) return null;
                  const expanded = !group.collapsed;
                  const open = item.lists.reduce((sum, id) => sum + (counts.byList.get(id) ?? 0), 0);
                  return (
                    <li
                      key={group.id}
                      data-top-block
                      data-id={group.id}
                      style={dragStyle(group.id)}
                      className={cn(
                        "rounded-lg pt-1 transition-[translate,scale,background-color,box-shadow] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
                        dragId === group.id && "bg-surface-raised shadow-[0_22px_44px_-18px_rgb(var(--shadow-rgb)/0.9),0_0_0_1px_rgb(var(--accent-rgb)/0.4),0_0_26px_-6px_rgb(var(--accent-rgb)/0.45)]",
                      )}
                    >
                      <div data-drag-row data-kind="group" data-id={group.id} data-collapsed={String(group.collapsed)} className="group/nav flex h-9 items-center gap-1 rounded-md pr-1 pl-1 hover:bg-foreground/[0.04]">
                        <DragHandle
                          label={`Reorder group ${group.name}`}
                          dragging={dragId === group.id}
                          onPointerDown={(event) => startDrag(event, group.id, "group")}
                          onKeyDown={(event) => handleKeys(event, (delta) => moveGroup(group.id, delta))}
                        />
                        <button
                          id={`tasks-group-${group.id}`}
                          type="button"
                          aria-expanded={!group.collapsed}
                          onClick={() => void actions.updateGroup(group.id, { collapsed: !group.collapsed })}
                          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left text-[13px] font-semibold text-foreground/80 transition-[color,scale] duration-150 outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100"
                        >
                          <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none", !group.collapsed && "rotate-90")} />
                          <span className="truncate">{group.name}</span>
                          {group.collapsed && open ? <span className="ml-auto pr-1 text-xs font-normal text-muted-foreground tabular-nums">{open}</span> : null}
                        </button>
                        <RowMenu label={`group ${group.name}`}>
                          <DropdownMenuItem onSelect={() => setListDialog({ mode: "create", groupId: group.id })}>
                            <ListPlus aria-hidden /> New list in group
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setGroupDialog({ mode: "rename", id: group.id, name: group.name })}>
                            <Pencil aria-hidden /> Rename group
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={topIndex === 0} onSelect={() => moveGroup(group.id, -1)}>
                            <ArrowUp aria-hidden /> Move up
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={topIndex === shown.length - 1} onSelect={() => moveGroup(group.id, 1)}>
                            <ArrowDown aria-hidden /> Move down
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteGroup({ id: group.id, name: group.name, lists: item.lists.length })}>
                            <Trash2 aria-hidden /> Delete group
                          </DropdownMenuItem>
                        </RowMenu>
                      </div>
                      {expanded ? (
                        item.lists.length ? (
                          <ul className="relative space-y-0.5 pb-1 before:absolute before:top-0 before:bottom-1 before:left-[1.4rem] before:w-px before:bg-border/70">
                            {item.lists.map((id, inner) => {
                              const list = data.lists[id];
                              return list ? listRow(list, group.id, inner, item.lists.length) : null;
                            })}
                          </ul>
                        ) : (
                          <p className="py-1.5 pr-2 pl-10 text-xs text-muted-foreground">Empty group — drag lists here or use “Move to group”.</p>
                        )
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </nav>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>

      <div className="flex items-center gap-1 border-t border-border/70 p-2">
        <Button variant="ghost" className="h-10 flex-1 justify-start gap-2.5 px-3 text-sm font-medium text-amethyst" onClick={() => setListDialog({ mode: "create", groupId: null })}>
          <Plus aria-hidden className="size-4" /> New list
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" aria-label="More ways to organize" className="text-muted-foreground">
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-48">
            <DropdownMenuItem onSelect={() => setGroupDialog({ mode: "create" })}>
              <FolderPlus aria-hidden /> New group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ListDialog state={listDialog} onClose={() => setListDialog(null)} />
      <GroupDialog state={groupDialog} onClose={() => setGroupDialog(null)} />
      <DeleteListDialog list={deleteList} onClose={() => setDeleteList(null)} />
      <DeleteGroupDialog group={deleteGroup} onClose={() => setDeleteGroup(null)} />
    </div>
  );
}

type DragKind = "list" | "group";
type SidebarDrag = {
  id: string;
  kind: DragKind;
  startY: number;
  startScroll: number;
  /** How far the picked-up row has moved, in px (pointer plus sidebar scroll). */
  offset: number;
  /** The order if dropped now, and the insertion line (relative to the list container). */
  next: TaskLayoutItem[] | null;
  line: { top: number; indent: boolean } | null;
};

/** The six-dot grip: drag it, or focus it and use the arrow keys. Always visible on touch screens. */
function DragHandle({
  label,
  dragging,
  onPointerDown,
  onKeyDown,
}: {
  label: string;
  dragging: boolean;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-describedby="tasks-reorder-help"
      aria-pressed={dragging || undefined}
      title="Drag to reorder"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        "grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground transition-[opacity,color,background-color] duration-150 outline-none select-none",
        "opacity-0 group-hover/nav:opacity-100 hover:bg-foreground/[0.07] hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60",
        "pointer-coarse:h-9 pointer-coarse:w-8 pointer-coarse:opacity-70",
        dragging && "cursor-grabbing bg-amethyst/15 text-amethyst opacity-100",
      )}
    >
      <GripVertical aria-hidden className="size-4" />
    </button>
  );
}

function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${label}`}
          className="shrink-0 text-muted-foreground opacity-0 group-hover/nav:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(event) => event.stopPropagation()}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavRow({
  id,
  href,
  active,
  onNavigate,
  icon,
  accent,
  label,
  count,
  indent,
  dragging,
  handle,
  menu,
}: {
  id?: string;
  href: string;
  active: boolean;
  onNavigate: (path: string) => void;
  icon: ReactNode;
  accent?: string | null;
  label: string;
  count?: number;
  indent?: boolean;
  dragging?: boolean;
  handle?: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <div
      style={accentStyle(accent)}
      className={cn(
        "group/nav relative flex h-10 items-center gap-1 rounded-lg pr-1 transition-[background-color,box-shadow,scale] duration-150 has-[>a:active]:scale-[0.985] motion-reduce:transition-none motion-reduce:has-[>a:active]:scale-100",
        handle ? "pl-1" : "pl-2",
        indent && "pl-6",
        active ? "bg-amethyst/[0.13] shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.25)] hover:bg-amethyst/[0.17]" : "hover:bg-foreground/[0.055]",
        dragging && "bg-surface-raised shadow-[0_22px_44px_-18px_rgb(var(--shadow-rgb)/0.9),0_0_0_1px_rgb(var(--accent-rgb)/0.4),0_0_26px_-6px_rgb(var(--accent-rgb)/0.45)]",
      )}
    >
      {active ? <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-amethyst" /> : null}
      {handle}
      <a
        id={id}
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          onNavigate(href);
        }}
        className="flex h-9 min-w-0 flex-1 items-center gap-3 rounded-md px-1.5 text-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className={cn("grid size-5 shrink-0 place-items-center transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/nav:scale-110 motion-reduce:transition-none motion-reduce:group-hover/nav:scale-100", accent ? "text-[var(--ca)]" : "text-muted-foreground group-hover/nav:text-amethyst", active && !accent && "text-amethyst")}>{icon}</span>
        <span className={cn("min-w-0 flex-1 truncate transition-colors", active ? "font-medium text-foreground" : "text-foreground/85 group-hover/nav:text-foreground")}>{label}</span>
        {count ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span> : null}
      </a>
      {menu}
    </div>
  );
}
