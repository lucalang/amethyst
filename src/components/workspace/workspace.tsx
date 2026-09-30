"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, FilePlus2, FileText, FolderInput, FolderPlus, ListPlus, Loader2, MoreHorizontal, PanelLeft, PanelLeftOpen, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/media/empty-state";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api-client";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { nodeNameSchema } from "@/lib/validation/workspace";
import {
  ancestorsOf,
  buildTree,
  checklistTotals,
  descendantIds,
  nameTaken,
  type ChecklistItem,
  type NodeDetail,
  type NodeKind,
  type WorkspaceNode,
} from "@/lib/workspace/tree";
import { ChecklistEditor } from "./checklist-editor";
import { errorMessage, nodeQueryKey, useLocalStorageValue, writeLocal } from "./client-utils";
import { EntryHeader } from "./entry-header";
import { Explorer, KIND_ICON, focusTreeRow, type EditState } from "./explorer";
import { MoveDialog } from "./move-dialog";
import { NoteEditor, clearDraftBackup } from "./note-editor";

type Entry = Tables<"entries">;

const DESKTOP_QUERY = "(min-width: 768px)";
const HIDDEN_KEY = "archive:explorer-hidden";

export function EntryWorkspace({
  entry: initialEntry,
  initialNodes,
  initialFile,
  imageHosts,
}: {
  entry: Entry;
  initialNodes: WorkspaceNode[];
  initialFile: NodeDetail | null;
  imageHosts: string[];
}) {
  const [entry, setEntry] = useState(initialEntry);
  const [nodes, setNodes] = useState(initialNodes);
  return (
    <div>
      <EntryHeader entry={entry} totals={checklistTotals(nodes)} onEntryChange={setEntry} />
      <Workspace entry={entry} nodes={nodes} setNodes={setNodes} initialFile={initialFile} imageHosts={imageHosts} />
    </div>
  );
}

function Workspace({
  entry,
  nodes,
  setNodes,
  initialFile,
  imageHosts,
}: {
  entry: Entry;
  nodes: WorkspaceNode[];
  setNodes: React.Dispatch<React.SetStateAction<WorkspaceNode[]>>;
  initialFile: NodeDetail | null;
  imageHosts: string[];
}) {
  const queryClient = useQueryClient();
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const [selectedId, setSelectedId] = useState<string | null>(initialFile?.node.id ?? null);
  const [focusedId, setFocusedId] = useState<string | null>(selectedId);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [freshFileId, setFreshFileId] = useState<string | null>(null);

  // Expanded folders and the desktop explorer toggle persist per browser.
  const expandedKey = `archive:ws:${entry.id}:expanded`;
  const storedExpanded = useLocalStorageValue(expandedKey);
  const [userExpanded, setUserExpanded] = useState<Set<string> | null>(null);
  const expanded = useMemo(() => {
    if (userExpanded) return userExpanded;
    const initial = new Set<string>();
    try {
      for (const id of JSON.parse(storedExpanded ?? "[]") as unknown[]) if (typeof id === "string") initial.add(id);
    } catch {
      // Ignore malformed stored state.
    }
    if (selectedId) for (const ancestor of ancestorsOf(nodes, selectedId)) initial.add(ancestor.id);
    return initial;
  }, [userExpanded, storedExpanded, nodes, selectedId]);
  const storedHidden = useLocalStorageValue(HIDDEN_KEY);
  const [userHidden, setUserHidden] = useState<boolean | null>(null);
  const explorerHidden = userHidden ?? storedHidden === "1";

  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  function updateExpanded(change: (next: Set<string>) => void) {
    const next = new Set(expanded);
    change(next);
    setUserExpanded(next);
    writeLocal(expandedKey, JSON.stringify([...next].filter((id) => byId.get(id)?.kind === "folder")));
  }

  function setHidden(hidden: boolean) {
    setUserHidden(hidden);
    writeLocal(HIDDEN_KEY, hidden ? "1" : null);
  }

  function isDesktop() {
    return window.matchMedia(DESKTOP_QUERY).matches;
  }

  /** Make the explorer visible (sheet on small screens, panel on desktop). */
  function revealExplorer() {
    if (isDesktop()) setHidden(false);
    else setSheetOpen(true);
  }

  function openFile(id: string) {
    setSelectedId(id);
    setFocusedId(id);
    setSheetOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("file", id);
    window.history.replaceState(null, "", url);
  }

  function clearSelection() {
    setSelectedId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("file");
    window.history.replaceState(null, "", url);
  }

  function startCreate(kind: NodeKind, parentId?: string | null) {
    let parent = parentId;
    if (parent === undefined) {
      const focused = focusedId ? byId.get(focusedId) : undefined;
      parent = focused ? (focused.kind === "folder" ? focused.id : focused.parentId) : null;
    }
    if (parent) updateExpanded((next) => next.add(parent));
    setEditing({ mode: "create", parentId: parent, kind });
    revealExplorer();
  }

  function startRename(id: string) {
    const ancestors = ancestorsOf(nodes, id);
    if (ancestors.some((ancestor) => !expanded.has(ancestor.id))) {
      updateExpanded((next) => ancestors.forEach((ancestor) => next.add(ancestor.id)));
    }
    setEditing({ mode: "rename", id });
    revealExplorer();
  }

  function cancelEdit() {
    const current = editing;
    setEditing(null);
    if (current?.mode === "rename") requestAnimationFrame(() => focusTreeRow(current.id, isDesktop() ? "desktop" : "mobile"));
  }

  async function submitName(value: string): Promise<string | null> {
    const current = editing;
    if (!current) return null;
    const parsed = nodeNameSchema.safeParse(value);
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid name.";
    const name = parsed.data;
    const parentId = current.mode === "create" ? current.parentId : (byId.get(current.id)?.parentId ?? null);
    if (nameTaken(nodes, parentId, name, current.mode === "rename" ? current.id : undefined)) {
      return `“${name}” already exists in this folder. Choose another name.`;
    }
    try {
      if (current.mode === "create") {
        const { node } = await apiFetch<{ node: WorkspaceNode }>(`/api/entries/${entry.id}/nodes`, {
          method: "POST",
          json: { parentId: current.parentId, kind: current.kind, name },
        });
        setNodes((previous) => [...previous, node]);
        setEditing(null);
        if (node.kind === "folder") {
          setFocusedId(node.id);
          requestAnimationFrame(() => focusTreeRow(node.id, isDesktop() ? "desktop" : "mobile"));
        } else {
          queryClient.setQueryData<NodeDetail>(nodeQueryKey(node.id), { node: { ...node, content: "" }, items: [] });
          setFreshFileId(node.id);
          openFile(node.id);
        }
      } else {
        const { node } = await apiFetch<{ node: WorkspaceNode }>(`/api/nodes/${current.id}`, { method: "PATCH", json: { name } });
        setNodes((previous) => previous.map((candidate) => (candidate.id === node.id ? { ...candidate, name: node.name, updatedAt: node.updatedAt } : candidate)));
        queryClient.setQueryData<NodeDetail>(nodeQueryKey(node.id), (old) => (old ? { ...old, node: { ...old.node, name: node.name } } : old));
        setEditing(null);
        requestAnimationFrame(() => focusTreeRow(node.id, isDesktop() ? "desktop" : "mobile"));
      }
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  async function moveNode(id: string, parentId: string | null) {
    const node = byId.get(id);
    if (!node) return;
    if (nameTaken(nodes, parentId, node.name, id)) {
      const message = `The destination already has an item named “${node.name}”. Rename one of them first.`;
      toast.error(message);
      throw new Error(message);
    }
    try {
      await apiFetch(`/api/nodes/${id}`, { method: "PATCH", json: { parentId } });
      setNodes((previous) => previous.map((candidate) => (candidate.id === id ? { ...candidate, parentId } : candidate)));
      if (parentId) updateExpanded((next) => next.add(parentId));
      toast.success(`Moved “${node.name}” to ${parentId ? `“${byId.get(parentId)?.name}”` : "the workspace root"}.`);
    } catch (error) {
      toast.error(`Could not move “${node.name}”: ${errorMessage(error)}`);
      throw error;
    }
  }

  async function deleteNode(id: string) {
    const node = byId.get(id);
    if (!node) return;
    try {
      await apiFetch(`/api/nodes/${id}`, { method: "DELETE" });
    } catch (error) {
      toast.error(`Could not delete “${node.name}”: ${errorMessage(error)}`);
      return;
    }
    const removed = new Set([id, ...descendantIds(nodes, id)]);
    setNodes((previous) => previous.filter((candidate) => !removed.has(candidate.id)));
    for (const removedId of removed) {
      queryClient.removeQueries({ queryKey: nodeQueryKey(removedId) });
      clearDraftBackup(removedId);
    }
    if (selectedId && removed.has(selectedId)) clearSelection();
    if (focusedId && removed.has(focusedId)) setFocusedId(node.parentId);
    toast.success(`Deleted “${node.name}”.`);
  }

  function onSaved(saved: WorkspaceNode) {
    setNodes((previous) =>
      previous.map((candidate) => (candidate.id === saved.id ? { ...candidate, version: saved.version, updatedAt: saved.updatedAt } : candidate)),
    );
  }

  function onItemsChange(fileId: string, items: ChecklistItem[]) {
    const total = items.length;
    const done = items.filter((item) => item.checked).length;
    queryClient.setQueryData<NodeDetail>(nodeQueryKey(fileId), (old) => (old ? { ...old, items } : old));
    setNodes((previous) =>
      previous.some((candidate) => candidate.id === fileId && (candidate.itemsTotal !== total || candidate.itemsChecked !== done))
        ? previous.map((candidate) => (candidate.id === fileId ? { ...candidate, itemsTotal: total, itemsChecked: done } : candidate))
        : previous,
    );
  }

  const explorerProps = {
    title: entry.title,
    nodes,
    tree,
    expanded,
    selectedId,
    focusedId,
    editing,
    onFocusChange: setFocusedId,
    onToggle: (id: string, open?: boolean) =>
      updateExpanded((next) => {
        if (open ?? !next.has(id)) next.add(id);
        else next.delete(id);
      }),
    onCollapseAll: () => updateExpanded((next) => next.clear()),
    onOpenFile: openFile,
    onStartCreate: startCreate,
    onStartRename: startRename,
    onCancelEdit: cancelEdit,
    onSubmitName: submitName,
    onRequestMove: setMoveId,
    onRequestDelete: setDeleteId,
    onMove: (id: string, parentId: string | null) => void moveNode(id, parentId).catch(() => undefined),
  };

  const deleting = deleteId ? byId.get(deleteId) : undefined;

  return (
    <section aria-label="Workspace" className="mx-auto w-full max-w-7xl md:px-6">
      <div
        className={cn(
          "grid min-h-[calc(100dvh-3.5rem)] grid-cols-1 border-y border-border bg-card md:rounded-lg md:border",
          !explorerHidden && "md:grid-cols-[15rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]",
        )}
      >
        {!explorerHidden ? (
          <aside aria-label="Explorer" className="hidden border-r border-border md:block">
            {/* Leaves room for main's bottom padding so the panel never slides under the top bar. */}
            <div className="sticky top-14 h-[calc(100dvh-6rem)]">
              <Explorer scope="desktop" {...explorerProps} onHide={() => setHidden(true)} />
            </div>
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-col">
          <FilePane
            key={selectedId ?? "none"}
            fileId={selectedId}
            node={selected}
            path={selectedId ? ancestorsOf(nodes, selectedId) : []}
            hasNodes={nodes.length > 0}
            initialFile={initialFile}
            imageHosts={imageHosts}
            explorerHidden={explorerHidden}
            autoFocus={freshFileId !== null && freshFileId === selectedId}
            onShowExplorer={() => setHidden(false)}
            onOpenFiles={() => setSheetOpen(true)}
            onCreate={(kind) => startCreate(kind, null)}
            onRename={startRename}
            onMove={setMoveId}
            onDelete={setDeleteId}
            onSaved={onSaved}
            onItemsChange={onItemsChange}
          />
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[88vw] max-w-sm gap-0 p-0"
          onOpenAutoFocus={(event) => {
            // Start in the tree (on the open file) rather than on the first toolbar button.
            const row = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]');
            if (row) {
              event.preventDefault();
              row.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            // Escape cancels an inline create/rename without closing the sheet.
            if (editing) event.preventDefault();
          }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Files</SheetTitle>
            <SheetDescription>Folders, notes and checklists in {entry.title}.</SheetDescription>
          </SheetHeader>
          <Explorer scope="mobile" {...explorerProps} onClose={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>

      <MoveDialog nodes={nodes} movingId={moveId} onClose={() => setMoveId(null)} onMove={moveNode} />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>{deleting ? deleteDescription(deleting, nodes) : null}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) void deleteNode(deleting.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function deleteDescription(node: WorkspaceNode, nodes: readonly WorkspaceNode[]): string {
  if (node.kind === "folder") {
    const inside = [...descendantIds(nodes, node.id)].map((id) => nodes.find((candidate) => candidate.id === id)!);
    const folders = inside.filter((candidate) => candidate.kind === "folder").length;
    const files = inside.length - folders;
    if (inside.length === 0) return "This empty folder will be permanently deleted.";
    const parts = [files ? `${files} ${files === 1 ? "file" : "files"}` : null, folders ? `${folders} ${folders === 1 ? "folder" : "folders"}` : null].filter(Boolean);
    return `This folder and everything in it (${parts.join(" and ")}) will be permanently deleted.`;
  }
  if (node.kind === "checklist") {
    return `This checklist and its ${node.itemsTotal} ${node.itemsTotal === 1 ? "item" : "items"} will be permanently deleted.`;
  }
  return "This note and its text will be permanently deleted.";
}

function FilePane({
  fileId,
  node,
  path,
  hasNodes,
  initialFile,
  imageHosts,
  explorerHidden,
  autoFocus,
  onShowExplorer,
  onOpenFiles,
  onCreate,
  onRename,
  onMove,
  onDelete,
  onSaved,
  onItemsChange,
}: {
  fileId: string | null;
  node: WorkspaceNode | null;
  path: WorkspaceNode[];
  hasNodes: boolean;
  initialFile: NodeDetail | null;
  imageHosts: string[];
  explorerHidden: boolean;
  autoFocus: boolean;
  onShowExplorer: () => void;
  onOpenFiles: () => void;
  onCreate: (kind: NodeKind) => void;
  onRename: (id: string) => void;
  onMove: (id: string) => void;
  onDelete: (id: string) => void;
  onSaved: (node: WorkspaceNode) => void;
  onItemsChange: (fileId: string, items: ChecklistItem[]) => void;
}) {
  const query = useQuery({
    queryKey: nodeQueryKey(fileId ?? "none"),
    queryFn: () => apiFetch<NodeDetail>(`/api/nodes/${fileId}`),
    enabled: Boolean(fileId),
    initialData: fileId && initialFile?.node.id === fileId ? initialFile : undefined,
    staleTime: Infinity,
  });
  const Icon = node ? KIND_ICON[node.kind] : FileText;

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-14 z-20 flex h-11 items-center gap-1.5 border-b border-border bg-card px-2 md:px-4">
        <Button variant="ghost" size="sm" className="md:hidden" onClick={onOpenFiles}>
          <PanelLeft aria-hidden /> Files
        </Button>
        {explorerHidden ? (
          <Button variant="ghost" size="icon-sm" className="hidden md:inline-flex" aria-label="Show explorer" onClick={onShowExplorer}>
            <PanelLeftOpen aria-hidden />
          </Button>
        ) : null}
        {node ? (
          <>
            <nav aria-label="File path" className="flex min-w-0 flex-1 items-center gap-1 text-sm">
              <ol className="flex min-w-0 items-center gap-1">
                {path.map((folder) => (
                  <li key={folder.id} className="flex min-w-0 shrink items-center gap-1 text-muted-foreground max-md:hidden">
                    <span className="truncate">{folder.name}</span>
                    <ChevronRight aria-hidden className="size-3.5 shrink-0" />
                  </li>
                ))}
                <li className="flex min-w-0 items-center gap-1.5 font-medium" aria-current="page">
                  <Icon aria-hidden className={cn("size-4 shrink-0", node.kind === "checklist" ? "text-coral/90" : "text-muted-foreground")} />
                  <span className="truncate">{node.name}</span>
                </li>
              </ol>
            </nav>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`File actions for ${node.name}`}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44" onCloseAutoFocus={(event) => event.preventDefault()}>
                <DropdownMenuItem onSelect={() => onRename(node.id)}>
                  <Pencil aria-hidden /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onMove(node.id)}>
                  <FolderInput aria-hidden /> Move to…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(node.id)}>
                  <Trash2 aria-hidden /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <p className="flex-1 truncate px-1 text-sm text-muted-foreground">No file open</p>
        )}
      </div>

      {!fileId || !node ? (
        <div className="p-4 md:p-8">
          <EmptyState
            icon={FileText}
            title={hasNodes ? "Open a file" : "Start your workspace"}
            description={
              hasNodes
                ? "Pick a note or checklist in the explorer, or create a new one."
                : "Create notes for anything you want to write down, checklists for arcs or goals, and folders to organize them."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => onCreate("note")}>
                  <FilePlus2 aria-hidden /> New note
                </Button>
                <Button variant="outline" onClick={() => onCreate("checklist")}>
                  <ListPlus aria-hidden /> New checklist
                </Button>
                <Button variant="outline" onClick={() => onCreate("folder")}>
                  <FolderPlus aria-hidden /> New folder
                </Button>
              </div>
            }
          />
        </div>
      ) : query.isPending ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground" role="status">
          <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> Loading {node.name}…
        </div>
      ) : query.isError ? (
        <div role="alert" className="m-4 flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm md:m-8">
          <AlertTriangle aria-hidden className="size-4 text-destructive" />
          <span className="flex-1">Could not open {node.name}: {errorMessage(query.error)}</span>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : node.kind === "note" ? (
        <NoteEditor detail={query.data} imageHosts={imageHosts} autoFocus={autoFocus} onSaved={onSaved} />
      ) : node.kind === "checklist" ? (
        <ChecklistEditor detail={query.data} autoFocus={autoFocus} onItemsChange={onItemsChange} />
      ) : null}
    </div>
  );
}
