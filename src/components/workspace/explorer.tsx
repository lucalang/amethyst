"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  ChevronRight,
  ChevronsDownUp,
  FilePlus2,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  ListChecks,
  ListPlus,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { canMoveTo, visibleRows, type NodeKind, type TreeNode, type WorkspaceNode } from "@/lib/workspace/tree";

export type EditState = { mode: "create"; parentId: string | null; kind: NodeKind } | { mode: "rename"; id: string };

const INDENT = 14;
const BASE_PADDING = 6;
const DND_TYPE = "application/x-archive-node";

export const treeRowId = (id: string, scope: string) => `${scope}-node-${id}`;

export function focusTreeRow(id: string, scope: string) {
  document.getElementById(treeRowId(id, scope))?.focus();
}

export const KIND_ICON = { folder: Folder, note: FileText, checklist: ListChecks } as const;
export const KIND_LABEL = { folder: "folder", note: "note", checklist: "checklist" } as const;

type ExplorerProps = {
  /** Distinguishes DOM ids when the explorer renders in more than one place. */
  scope: string;
  title: string;
  nodes: readonly WorkspaceNode[];
  tree: readonly TreeNode[];
  expanded: ReadonlySet<string>;
  selectedId: string | null;
  focusedId: string | null;
  editing: EditState | null;
  onFocusChange: (id: string) => void;
  onToggle: (id: string, open?: boolean) => void;
  onCollapseAll: () => void;
  onOpenFile: (id: string) => void;
  onStartCreate: (kind: NodeKind, parentId?: string | null) => void;
  onStartRename: (id: string) => void;
  onCancelEdit: () => void;
  onSubmitName: (value: string) => Promise<string | null>;
  onRequestMove: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onMove: (id: string, parentId: string | null) => void;
  onHide?: () => void;
  onClose?: () => void;
};

type TreeContext = ExplorerProps & {
  menuFor: string | null;
  setMenuFor: (id: string | null) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  dropTarget: string | null | undefined;
  setDropTarget: (id: string | null | undefined) => void;
};

/** VS Code-style explorer: nested folders, notes and checklists. */
export function Explorer(props: ExplorerProps) {
  const { tree, nodes, expanded, focusedId, editing, scope } = props;
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined);
  const ctx: TreeContext = { ...props, menuFor, setMenuFor, dragId, setDragId, dropTarget, setDropTarget };
  const creatingAtRoot = editing?.mode === "create" && editing.parentId === null;
  const rows = visibleRows(tree, expanded);
  const tabStop = rows.some((row) => row.id === focusedId) ? focusedId : (rows[0]?.id ?? null);

  function moveFocus(id: string | undefined) {
    if (!id) return;
    props.onFocusChange(id);
    focusTreeRow(id, scope);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const target = event.target as HTMLElement;
    if (target.getAttribute("role") !== "treeitem") return;
    const index = rows.findIndex((row) => row.id === focusedId);
    const row = rows[index];
    if (!row) return;
    const isFolder = row.kind === "folder";
    const open = isFolder && expanded.has(row.id);
    let handled = true;
    switch (event.key) {
      case "ArrowDown":
        moveFocus(rows[index + 1]?.id);
        break;
      case "ArrowUp":
        moveFocus(rows[index - 1]?.id);
        break;
      case "Home":
        moveFocus(rows[0]?.id);
        break;
      case "End":
        moveFocus(rows.at(-1)?.id);
        break;
      case "ArrowRight":
        if (isFolder && !open) props.onToggle(row.id, true);
        else if (isFolder && row.children[0]) moveFocus(row.children[0].id);
        break;
      case "ArrowLeft":
        if (open) props.onToggle(row.id, false);
        else if (row.parentId) moveFocus(row.parentId);
        break;
      case "Enter":
      case " ":
        if (isFolder) props.onToggle(row.id);
        else props.onOpenFile(row.id);
        break;
      case "F2":
        props.onStartRename(row.id);
        break;
      case "Delete":
        props.onRequestDelete(row.id);
        break;
      case "ContextMenu":
        setMenuFor(row.id);
        break;
      default:
        if (event.key === "F10" && event.shiftKey) setMenuFor(row.id);
        else handled = false;
    }
    if (handled) event.preventDefault();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border pr-1.5 pl-3">
        <h2 className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Files</h2>
        <ToolbarButton label="New note" onClick={() => props.onStartCreate("note")}>
          <FilePlus2 aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="New checklist" onClick={() => props.onStartCreate("checklist")}>
          <ListPlus aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="New folder" onClick={() => props.onStartCreate("folder")}>
          <FolderPlus aria-hidden />
        </ToolbarButton>
        <ToolbarButton label="Collapse all folders" onClick={props.onCollapseAll}>
          <ChevronsDownUp aria-hidden />
        </ToolbarButton>
        {props.onHide ? (
          <ToolbarButton label="Hide explorer" onClick={props.onHide}>
            <PanelLeftClose aria-hidden />
          </ToolbarButton>
        ) : null}
        {props.onClose ? (
          <ToolbarButton label="Close files" onClick={props.onClose}>
            <X aria-hidden />
          </ToolbarButton>
        ) : null}
      </div>

      <div
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain py-1", dropTarget === null && "bg-jade/5")}
        onDragOver={(event) => {
          if (dragId && canMoveTo(nodes, dragId, null)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTarget(null);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const id = dragId;
          setDragId(null);
          setDropTarget(undefined);
          if (id && canMoveTo(nodes, id, null)) props.onMove(id, null);
        }}
      >
        {tree.length === 0 && !creatingAtRoot ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            <p>This workspace is empty.</p>
            <p className="mt-1">Create a note, checklist or folder with the buttons above.</p>
          </div>
        ) : null}
        <ul role="tree" aria-label={`Files in ${props.title}`} onKeyDown={onKeyDown} className="pb-6">
          {creatingAtRoot ? <NameInput ctx={ctx} depth={0} kind={editing.kind} initial="" /> : null}
          {tree.map((node) => (
            <TreeItem key={node.id} node={node} ctx={ctx} tabStop={tabStop} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ToolbarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:size-9 [&_svg]:size-4"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TreeItem({ node, ctx, tabStop }: { node: TreeNode; ctx: TreeContext; tabStop: string | null }) {
  const isFolder = node.kind === "folder";
  const open = isFolder && ctx.expanded.has(node.id);
  const selected = ctx.selectedId === node.id;
  const renaming = ctx.editing?.mode === "rename" && ctx.editing.id === node.id;
  const creatingHere = ctx.editing?.mode === "create" && ctx.editing.parentId === node.id;
  const padding = BASE_PADDING + node.depth * INDENT;
  const dropHere = isFolder && ctx.dropTarget === node.id;
  // Brighter guide line for the folder that contains the open file.
  const containsSelection = isFolder && open && node.children.some((child) => child.id === ctx.selectedId);
  const Icon = isFolder ? (open ? FolderOpen : Folder) : KIND_ICON[node.kind];
  const dropParent = isFolder ? node.id : node.parentId;
  const label =
    node.kind === "checklist" ? `${node.name}, checklist, ${node.itemsChecked} of ${node.itemsTotal} done` : `${node.name}, ${KIND_LABEL[node.kind]}`;

  return (
    <li
      role="treeitem"
      id={treeRowId(node.id, ctx.scope)}
      aria-level={node.depth + 1}
      aria-expanded={isFolder ? open : undefined}
      aria-selected={selected}
      aria-label={label}
      tabIndex={tabStop === node.id ? 0 : -1}
      className="outline-none [&:focus-visible>div:first-child]:ring-1 [&:focus-visible>div:first-child]:ring-ring [&:focus-visible>div:first-child]:ring-inset"
      onFocus={(event) => {
        if (event.target === event.currentTarget) ctx.onFocusChange(node.id);
      }}
    >
      {renaming ? (
        <NameInput ctx={ctx} depth={node.depth} kind={node.kind} initial={node.name} />
      ) : (
        <div
          className={cn(
            "group relative flex h-7 cursor-pointer items-center gap-1.5 pr-1 text-[13px] select-none pointer-coarse:h-10",
            selected ? "bg-secondary text-foreground shadow-[inset_2px_0_0_var(--jade)]" : "text-foreground/85 hover:bg-secondary/50",
            dropHere && "bg-jade/15 ring-1 ring-jade/50 ring-inset",
            ctx.dragId === node.id && "opacity-50",
          )}
          style={{ paddingLeft: padding }}
          draggable
          onClick={(event) => {
            event.currentTarget.parentElement?.focus();
            ctx.onFocusChange(node.id);
            if (isFolder) ctx.onToggle(node.id);
            else ctx.onOpenFile(node.id);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            ctx.onFocusChange(node.id);
            ctx.setMenuFor(node.id);
          }}
          onDragStart={(event) => {
            event.dataTransfer.setData(DND_TYPE, node.id);
            event.dataTransfer.effectAllowed = "move";
            ctx.setDragId(node.id);
          }}
          onDragEnd={() => {
            ctx.setDragId(null);
            ctx.setDropTarget(undefined);
          }}
          onDragOver={(event) => {
            if (ctx.dragId && canMoveTo(ctx.nodes, ctx.dragId, dropParent)) {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              ctx.setDropTarget(dropParent);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const id = ctx.dragId;
            ctx.setDragId(null);
            ctx.setDropTarget(undefined);
            if (id && canMoveTo(ctx.nodes, id, dropParent)) ctx.onMove(id, dropParent);
          }}
        >
          {isFolder ? (
            <ChevronRight aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          ) : (
            <span aria-hidden className="size-4 shrink-0" />
          )}
          <Icon
            aria-hidden
            className={cn("size-4 shrink-0", isFolder ? "text-jade/90" : node.kind === "checklist" ? "text-coral/90" : "text-muted-foreground")}
          />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {node.kind === "checklist" && node.itemsTotal > 0 ? (
            <span
              aria-hidden
              className={cn(
                "shrink-0 text-[11px] tabular-nums",
                node.itemsChecked === node.itemsTotal ? "text-jade" : "text-muted-foreground",
              )}
            >
              {node.itemsChecked}/{node.itemsTotal}
            </span>
          ) : null}
          <RowMenu node={node} ctx={ctx} visible={selected} />
        </div>
      )}
      {isFolder && open ? (
        <ul role="group" className="relative">
          <span
            aria-hidden
            className={cn("pointer-events-none absolute inset-y-0 w-px", containsSelection ? "bg-white/25" : "bg-white/10")}
            style={{ left: padding + 7.5 }}
          />
          {creatingHere ? <NameInput ctx={ctx} depth={node.depth + 1} kind={ctx.editing!.mode === "create" ? (ctx.editing as { kind: NodeKind }).kind : "note"} initial="" /> : null}
          {node.children.map((child) => (
            <TreeItem key={child.id} node={child} ctx={ctx} tabStop={tabStop} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RowMenu({ node, ctx, visible }: { node: TreeNode; ctx: TreeContext; visible: boolean }) {
  const isFolder = node.kind === "folder";
  return (
    <DropdownMenu modal={false} open={ctx.menuFor === node.id} onOpenChange={(open) => ctx.setMenuFor(open ? node.id : null)}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Actions for ${node.name}`}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background/60 hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:size-9 pointer-coarse:opacity-100",
            visible && "opacity-100",
          )}
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52"
        // The menu is portaled, but React events still bubble to the row's click handler.
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => {
            if (document.activeElement === document.body) focusTreeRow(node.id, ctx.scope);
          });
        }}
      >
        {isFolder ? (
          <>
            <DropdownMenuItem onSelect={() => ctx.onStartCreate("note", node.id)}>
              <FilePlus2 aria-hidden /> New note
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => ctx.onStartCreate("checklist", node.id)}>
              <ListPlus aria-hidden /> New checklist
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => ctx.onStartCreate("folder", node.id)}>
              <FolderPlus aria-hidden /> New folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onSelect={() => ctx.onStartRename(node.id)}>
          <Pencil aria-hidden /> Rename <DropdownMenuShortcut>F2</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => ctx.onRequestMove(node.id)}>
          <FolderInput aria-hidden /> Move to…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => ctx.onRequestDelete(node.id)}>
          <Trash2 aria-hidden /> Delete <DropdownMenuShortcut>Del</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NameInput({ ctx, depth, kind, initial }: { ctx: TreeContext; depth: number; kind: NodeKind; initial: string }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const settled = useRef(false);
  const Icon = KIND_ICON[kind];
  const errorId = `${ctx.scope}-name-error`;
  const creating = initial === "";

  function cancel() {
    settled.current = true;
    ctx.onCancelEdit();
  }

  async function commit() {
    if (busy || settled.current) return;
    const name = value.trim();
    if (!name || name === initial) {
      cancel();
      return;
    }
    setBusy(true);
    const message = await ctx.onSubmitName(name);
    setBusy(false);
    if (message) setError(message);
    else settled.current = true;
  }

  const input = (
    <div className="py-0.5 pr-2" style={{ paddingLeft: BASE_PADDING + depth * INDENT }}>
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="size-4 shrink-0" />
        <Icon aria-hidden className={cn("size-4 shrink-0", kind === "folder" ? "text-jade/90" : kind === "checklist" ? "text-coral/90" : "text-muted-foreground")} />
        <input
          autoFocus
          value={value}
          readOnly={busy}
          aria-busy={busy}
          maxLength={200}
          aria-label={creating ? `Name for the new ${KIND_LABEL[kind]}` : "New name"}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          placeholder={creating ? `${kind === "folder" ? "Folder" : kind === "checklist" ? "Checklist" : "Note"} name` : undefined}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              void commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          onBlur={() => {
            if (error) cancel();
            else void commit();
          }}
          className="h-6 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1.5 text-[13px] outline-none aria-invalid:border-destructive pointer-coarse:h-9"
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 ml-[22px] rounded-sm bg-destructive/15 px-1.5 py-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
  // A new item renders as its own row; renames replace the existing row's content.
  return creating ? <li role="none">{input}</li> : input;
}
