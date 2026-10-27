"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronRight,
  CircleCheckBig,
  FolderInput,
  FolderPlus,
  GripVertical,
  Inbox,
  InfinityIcon,
  List,
  ListPlus,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Star,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { ClientCollectionIcon } from "@/components/categories/collection-identity-fields";
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
  all: InfinityIcon,
  completed: CircleCheckBig,
};

export function ListGlyph({ list, className }: { list: Pick<TaskList, "icon" | "isInbox">; className?: string }) {
  if (list.icon) return <ClientCollectionIcon icon={list.icon} className={className} />;
  return list.isInbox ? <Inbox aria-hidden className={className} /> : <List aria-hidden className={className} />;
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

/** Sidebar of smart views, the Inbox and the account's groups and lists. */
export function TasksSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { sidebar, inbox, allTasks, today, data, actions } = useTasks();
  const nav = useTasksNav();
  const [preview, setPreview] = useState<TaskLayoutItem[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [listDialog, setListDialog] = useState<ListDialogState>(null);
  const [groupDialog, setGroupDialog] = useState<GroupDialogState>(null);
  const [deleteList, setDeleteList] = useState<TaskList | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<{ id: string; name: string; lists: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => toLayout(sidebar), [sidebar]);
  const shown = preview ?? layout;

  const counts = useMemo(() => {
    const open = allTasks.filter((task) => !task.completedAt);
    const byList = new Map<string, number>();
    for (const task of open) byList.set(task.listId, (byList.get(task.listId) ?? 0) + 1);
    const smart: Partial<Record<SmartViewId, number>> = {};
    for (const view of SMART_VIEWS) {
      if (view.id === "completed") continue;
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
  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragId(id);
    setPreview(layout);
  }

  function dragList(event: PointerEvent<HTMLButtonElement>, listId: string) {
    if (dragId !== listId || !preview || !containerRef.current) return;
    const container = containerRef.current;
    const rows = [...container.querySelectorAll<HTMLElement>("[data-drag-row]")].filter((row) => row.dataset.id !== listId);
    let index = 0;
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height / 2) index += 1;
    }
    const prev = rows[index - 1];
    const base = withoutList(preview, listId);
    let next: TaskLayoutItem[];
    if (!prev) next = placeList(base, listId, null, 0);
    else if (prev.dataset.kind === "group") {
      const groupId = prev.dataset.id!;
      next = prev.dataset.collapsed === "true" ? placeList(base, listId, null, topIndexOf(base, groupId) + 1) : placeList(base, listId, groupId, 0);
    } else if (prev.dataset.group) {
      const groupId = prev.dataset.group;
      const group = base.find((item) => "group" in item && item.group === groupId) as { group: string; lists: string[] };
      const position = group.lists.indexOf(prev.dataset.id!);
      const outdent = event.clientX < container.getBoundingClientRect().left + 36;
      next =
        position === group.lists.length - 1 && outdent
          ? placeList(base, listId, null, topIndexOf(base, groupId) + 1)
          : placeList(base, listId, groupId, position + 1);
    } else {
      next = placeList(base, listId, null, topIndexOf(base, prev.dataset.id!) + 1);
    }
    if (!sameLayout(next, preview)) setPreview(next);
  }

  function dragGroup(event: PointerEvent<HTMLButtonElement>, groupId: string) {
    if (dragId !== groupId || !preview || !containerRef.current) return;
    const blocks = [...containerRef.current.querySelectorAll<HTMLElement>("[data-top-block]")].filter((block) => block.dataset.id !== groupId);
    let index = 0;
    for (const block of blocks) {
      const rect = block.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height / 2) index += 1;
    }
    const current = topIndexOf(preview, groupId);
    if (current === index) return;
    const next = [...preview];
    const [item] = next.splice(current, 1);
    next.splice(index, 0, item);
    setPreview(next);
  }

  function endDrag(id: string) {
    if (dragId !== id) return;
    const next = preview;
    setDragId(null);
    setPreview(null);
    if (next) commitLayout(next, "Order saved.");
  }

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
      <li key={list.id} data-drag-row data-kind="list" data-id={list.id} data-group={groupId ?? ""} data-top-block={groupId ? undefined : ""} className={cn(dragId === list.id && "opacity-80")}>
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
            <button
              type="button"
              aria-label={`Reorder ${list.name}. Drag, or use the arrow keys.`}
              onPointerDown={(event) => startDrag(event, list.id)}
              onPointerMove={(event) => dragList(event, list.id)}
              onPointerUp={() => endDrag(list.id)}
              onPointerCancel={() => endDrag(list.id)}
              onLostPointerCapture={() => endDrag(list.id)}
              onKeyDown={(event) => handleKeys(event, (delta) => moveList(list.id, delta))}
              className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/60 opacity-0 outline-none group-hover/nav:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 active:cursor-grabbing pointer-coarse:opacity-100"
            >
              <GripVertical aria-hidden className="size-3.5" />
            </button>
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
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-3 pb-2 [scrollbar-width:thin]">
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
                    icon={<Icon aria-hidden className={cn("size-4", view.id === "my-day" ? "text-amber-300" : view.id === "important" ? "text-rose" : "text-amethyst")} />}
                    label={view.label}
                    count={counts.smart[view.id]}
                  />
                </li>
              );
            })}
            {inbox ? (
              <li>
                <NavRow
                  href="/tasks/inbox"
                  active={nav.view?.kind === "list" && nav.view.id === inbox.id}
                  onNavigate={navigate}
                  icon={<ListGlyph list={inbox} className="size-4" />}
                  accent={inbox.accent}
                  label="Inbox"
                  count={counts.byList.get(inbox.id)}
                  menu={
                    <RowMenu label="Inbox">
                      <DropdownMenuItem onSelect={() => setListDialog({ mode: "edit", list: inbox })}>
                        <Palette aria-hidden /> Icon and color
                      </DropdownMenuItem>
                    </RowMenu>
                  }
                />
              </li>
            ) : null}
          </ul>
        </nav>

        <div aria-hidden className="mx-2 my-3 h-px bg-white/[0.07]" />

        <nav aria-label="Your lists">
          <div ref={containerRef}>
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
                  const expanded = !group.collapsed || dragId === group.id;
                  const open = item.lists.reduce((sum, id) => sum + (counts.byList.get(id) ?? 0), 0);
                  return (
                    <li key={group.id} data-top-block data-id={group.id} className={cn("rounded-lg", dragId === group.id && "bg-white/[0.04] opacity-90")}>
                      <div data-drag-row data-kind="group" data-id={group.id} data-collapsed={String(group.collapsed)} className="group/nav flex h-9 items-center gap-1 rounded-md pr-1 pl-1 hover:bg-white/[0.04]">
                        <button
                          type="button"
                          aria-label={`Reorder group ${group.name}. Drag, or use the arrow keys.`}
                          onPointerDown={(event) => startDrag(event, group.id)}
                          onPointerMove={(event) => dragGroup(event, group.id)}
                          onPointerUp={() => endDrag(group.id)}
                          onPointerCancel={() => endDrag(group.id)}
                          onLostPointerCapture={() => endDrag(group.id)}
                          onKeyDown={(event) => handleKeys(event, (delta) => moveGroup(group.id, delta))}
                          className="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded text-muted-foreground/60 opacity-0 outline-none group-hover/nav:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 active:cursor-grabbing pointer-coarse:opacity-100"
                        >
                          <GripVertical aria-hidden className="size-3.5" />
                        </button>
                        <button
                          id={`tasks-group-${group.id}`}
                          type="button"
                          aria-expanded={!group.collapsed}
                          onClick={() => void actions.updateGroup(group.id, { collapsed: !group.collapsed })}
                          className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 transition-transform duration-200", !group.collapsed && "rotate-90")} />
                          <span className="truncate">{group.name}</span>
                          {group.collapsed && open ? <span className="ml-auto pr-1 font-normal tracking-normal tabular-nums normal-case">{open}</span> : null}
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
                          <ul className="space-y-0.5 pb-1">
                            {item.lists.map((id, inner) => {
                              const list = data.lists[id];
                              return list ? listRow(list, group.id, inner, item.lists.length) : null;
                            })}
                          </ul>
                        ) : (
                          <p className="py-1.5 pr-2 pl-10 text-xs text-muted-foreground/80">Empty group — drag lists here or use “Move to group”.</p>
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

      <div className="flex items-center gap-1 border-t border-white/[0.07] p-2">
        <Button variant="ghost" className="h-10 flex-1 justify-start gap-2.5 px-3 text-sm font-medium text-amethyst" onClick={() => setListDialog({ mode: "create", groupId: null })}>
          <Plus aria-hidden className="size-4" /> New list
        </Button>
        <Button variant="ghost" size="icon-lg" aria-label="New group" title="New group" className="text-muted-foreground" onClick={() => setGroupDialog({ mode: "create" })}>
          <FolderPlus aria-hidden />
        </Button>
      </div>

      <ListDialog state={listDialog} onClose={() => setListDialog(null)} />
      <GroupDialog state={groupDialog} onClose={() => setGroupDialog(null)} />
      <DeleteListDialog list={deleteList} onClose={() => setDeleteList(null)} />
      <DeleteGroupDialog group={deleteGroup} onClose={() => setDeleteGroup(null)} />
    </div>
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
        "group/nav relative flex h-10 items-center gap-1 rounded-md pr-1 transition-[background-color,box-shadow] duration-150",
        handle ? "pl-1" : "pl-2",
        indent && "pl-5",
        active ? "bg-amethyst/[0.13] shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.22)]" : "hover:bg-white/[0.05]",
        dragging && "bg-surface-raised shadow-[0_10px_30px_-12px_rgb(var(--shadow-rgb)/0.8),inset_0_0_0_1px_rgb(var(--accent-rgb)/0.4)]",
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
        className="flex h-9 min-w-0 flex-1 items-center gap-3 rounded-md px-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <span className={cn("grid size-5 shrink-0 place-items-center", accent ? "text-[var(--ca)]" : "text-muted-foreground", active && !accent && "text-amethyst")}>{icon}</span>
        <span className={cn("min-w-0 flex-1 truncate", active ? "font-medium text-foreground" : "text-foreground/85")}>{label}</span>
        {count ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span> : null}
      </a>
      {menu}
    </div>
  );
}
