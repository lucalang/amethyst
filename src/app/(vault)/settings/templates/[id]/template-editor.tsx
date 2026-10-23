"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, ChevronRight, FilePlus2, FolderInput, FolderPlus, ListPlus, Loader2, PanelLeft, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { LiveMarkdownEditor, type EditorStatus, type LiveMarkdownEditorHandle } from "@/components/editor/live-markdown-editor";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/components/workspace/client-utils";
import { Explorer, KIND_ICON, focusTreeRow, type EditState } from "@/components/workspace/explorer";
import { MoveDialog } from "@/components/workspace/move-dialog";
import { apiFetch } from "@/lib/api-client";
import { markdownTaskCounts } from "@/lib/progress/markdown";
import { MAX_TEMPLATE_TASKS, templatePatchSchema, templateExplorerNodes, type TemplateNode, type WorkspaceTemplate } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { itemLabelSchema, MAX_NOTE_LENGTH, nodeNameSchema } from "@/lib/validation/workspace";
import { ancestorsOf, buildTree, descendantIds, nameTaken, type NodeKind } from "@/lib/workspace/tree";

const DESKTOP_QUERY = "(min-width: 768px)";

/** What gets saved (task counts are derived on the server). */
function snapshot(name: string, nodes: readonly TemplateNode[]) {
  return JSON.stringify({
    name: name.trim(),
    nodes: nodes.map(({ id, parentId, kind, name: nodeName, content, includeInCoverProgress, tasks }) =>
      kind === "folder" ? { id, parentId, kind, name: nodeName } : kind === "note" ? { id, parentId, kind, name: nodeName, includeInCoverProgress, content: content ?? "" } : { id, parentId, kind, name: nodeName, includeInCoverProgress, tasks: tasks ?? [] },
    ),
  });
}

/** Template contents, edited with the same explorer as entry workspaces. Nothing is saved until "Save template". */
export function TemplateEditor({ template }: { template: WorkspaceTemplate }) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [nodes, setNodes] = useState<TemplateNode[]>(template.structure.nodes);
  const [saved, setSaved] = useState(() => snapshot(template.name, template.structure.nodes));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [freshFileId, setFreshFileId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(template.structure.nodes.filter((node) => node.kind === "folder").map((node) => node.id)));

  const explorerNodes = useMemo(() => templateExplorerNodes({ nodes }), [nodes]);
  const tree = useMemo(() => buildTree(explorerNodes), [explorerNodes]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const dirty = snapshot(name, nodes) !== saved;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const isDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;
  const scope = () => (isDesktop() ? "desktop" : "mobile");

  function update(id: string, change: Partial<TemplateNode>) {
    setNodes((previous) => previous.map((node) => (node.id === id ? { ...node, ...change } : node)));
    setSaveError(null);
  }

  function expand(id: string, open?: boolean) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openFile(id: string) {
    setSelectedId(id);
    setFocusedId(id);
    setSheetOpen(false);
  }

  function startCreate(kind: NodeKind, parentId?: string | null) {
    let parent = parentId;
    if (parent === undefined) {
      const focused = focusedId ? byId.get(focusedId) : undefined;
      parent = focused ? (focused.kind === "folder" ? focused.id : focused.parentId) : null;
    }
    if (parent) expand(parent, true);
    setEditing({ mode: "create", parentId: parent, kind });
    if (!isDesktop()) setSheetOpen(true);
  }

  function startRename(id: string) {
    for (const ancestor of ancestorsOf(explorerNodes, id)) expand(ancestor.id, true);
    setEditing({ mode: "rename", id });
    if (!isDesktop()) setSheetOpen(true);
  }

  async function submitName(value: string, includeInCoverProgress?: boolean): Promise<string | null> {
    const current = editing;
    if (!current) return null;
    const parsed = nodeNameSchema.safeParse(value);
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid name.";
    const nodeName = parsed.data;
    const parentId = current.mode === "create" ? current.parentId : (byId.get(current.id)?.parentId ?? null);
    if (nameTaken(explorerNodes, parentId, nodeName, current.mode === "rename" ? current.id : undefined)) {
      return `“${nodeName}” already exists in this folder. Choose another name.`;
    }
    setSaveError(null);
    if (current.mode === "rename") {
      update(current.id, { name: nodeName });
      setEditing(null);
      requestAnimationFrame(() => focusTreeRow(current.id, scope()));
      return null;
    }
    const node: TemplateNode = {
      id: crypto.randomUUID(),
      parentId: current.parentId,
      kind: current.kind,
      name: nodeName,
      ...(current.kind === "note" ? { content: "", includeInCoverProgress: includeInCoverProgress ?? false } : {}),
      ...(current.kind === "checklist" ? { tasks: [], includeInCoverProgress: includeInCoverProgress ?? true } : {}),
    };
    setNodes((previous) => [...previous, node]);
    setEditing(null);
    if (node.kind === "folder") {
      expand(node.id, true);
      setFocusedId(node.id);
      requestAnimationFrame(() => focusTreeRow(node.id, scope()));
    } else {
      setFreshFileId(node.id);
      openFile(node.id);
    }
    return null;
  }

  async function moveNode(id: string, parentId: string | null) {
    const node = byId.get(id);
    if (!node) return;
    if (nameTaken(explorerNodes, parentId, node.name, id)) {
      const message = `The destination already has an item named “${node.name}”. Rename one of them first.`;
      toast.error(message);
      throw new Error(message);
    }
    update(id, { parentId });
    if (parentId) expand(parentId, true);
  }

  function deleteNode(id: string) {
    const removed = new Set([id, ...descendantIds(explorerNodes, id)]);
    setNodes((previous) => previous.filter((node) => !removed.has(node.id)));
    if (selectedId && removed.has(selectedId)) setSelectedId(null);
    if (focusedId && removed.has(focusedId)) setFocusedId(byId.get(id)?.parentId ?? null);
    setSaveError(null);
  }

  async function save() {
    const parsed = templatePatchSchema.safeParse({ name: name.trim(), structure: { nodes } });
    if (!parsed.success) {
      setSaveError(parsed.error.issues[0]?.message ?? "Check the template contents.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await apiFetch<{ template: WorkspaceTemplate }>(`/api/templates/${template.id}`, { method: "PATCH", json: parsed.data });
      setName(result.template.name);
      setSaved(snapshot(result.template.name, nodes));
      toast.success(`Saved “${result.template.name}”.`);
      router.refresh();
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const explorerProps = {
    title: name || "template",
    nodes: explorerNodes,
    tree,
    expanded,
    selectedId,
    focusedId,
    editing,
    onFocusChange: setFocusedId,
    onToggle: expand,
    onCollapseAll: () => setExpanded(new Set()),
    onOpenFile: openFile,
    onStartCreate: startCreate,
    onStartRename: startRename,
    onCancelEdit: () => {
      const current = editing;
      setEditing(null);
      if (current?.mode === "rename") requestAnimationFrame(() => focusTreeRow(current.id, scope()));
    },
    onSubmitName: submitName,
    onRequestMove: setMoveId,
    onRequestDelete: setDeleteId,
    onMove: (id: string, parentId: string | null) => void moveNode(id, parentId).catch(() => undefined),
  };

  const deleting = deleteId ? byId.get(deleteId) : undefined;
  const deletingInside = deleting?.kind === "folder" ? descendantIds(explorerNodes, deleting.id).size : 0;
  const nameError = name.trim() ? null : "Enter a template name.";

  return (
    <div className="enter space-y-5">
      <Link href="/settings/templates" className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-amethyst">
        <ArrowLeft aria-hidden className="size-3.5" /> All templates
      </Link>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="min-w-0 flex-1 basis-60 space-y-2">
          <Label htmlFor="template-name" className="text-xs font-medium text-muted-foreground">Template name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(event) => { setName(event.target.value); setSaveError(null); }}
            maxLength={80}
            autoComplete="off"
            className="h-11 border-white/[0.12] bg-black/50 text-base font-semibold"
            aria-invalid={Boolean(nameError)}
          />
        </div>
        <div className="flex items-center gap-3">
          <p role="status" className="text-xs text-muted-foreground">{saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}</p>
          <Button type="submit" className="h-11 gap-2 px-4" disabled={saving || !dirty || Boolean(nameError)}>
            {saving ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />} Save template
          </Button>
        </div>
      </form>
      {saveError ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-rose/20 bg-rose/[0.06] px-3 py-2.5 text-xs leading-5 text-rose">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          Couldn’t save the template: {saveError}
        </p>
      ) : null}

      <div className="grid h-[min(46rem,calc(100dvh-14rem))] min-h-[28rem] grid-cols-1 overflow-hidden rounded-xl border border-border bg-black md:grid-cols-[14rem_minmax(0,1fr)]">
        <aside aria-label="Template explorer" className="hidden min-h-0 border-r border-border bg-surface md:block">
          <Explorer scope="desktop" {...explorerProps} />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2 md:hidden">
            <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={() => setSheetOpen(true)}>
              <PanelLeft aria-hidden /> Files
            </Button>
          </div>
          {selected && selected.kind !== "folder" ? (
            <TemplateFilePane
              key={selected.id}
              node={selected}
              path={ancestorsOf(explorerNodes, selected.id).map((ancestor) => ancestor.name)}
              autoFocus={freshFileId === selected.id}
              onChange={(change) => update(selected.id, change)}
              onRename={() => startRename(selected.id)}
              onMove={() => setMoveId(selected.id)}
              onDelete={() => setDeleteId(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center">
              <div className="max-w-sm space-y-3">
                <p className="text-sm font-medium">{nodes.length ? "Select a file to edit its starting content." : "This template is empty."}</p>
                <p className="text-xs leading-5 text-muted-foreground">Notes start with the Markdown you write here. Checklists start with your tasks, unchecked. New entries get their own copy.</p>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => startCreate("note", null)}><FilePlus2 aria-hidden /> Note</Button>
                  <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => startCreate("checklist", null)}><ListPlus aria-hidden /> Checklist</Button>
                  <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => startCreate("folder", null)}><FolderPlus aria-hidden /> Folder</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[88vw] max-w-sm gap-0 p-0"
          onOpenAutoFocus={(event) => {
            const input = (event.currentTarget as HTMLElement).querySelector<HTMLInputElement>("[data-name-input]");
            if (input) {
              event.preventDefault();
              input.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (editing) event.preventDefault();
          }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Template files</SheetTitle>
            <SheetDescription>Folders, notes and checklists in {name || "this template"}.</SheetDescription>
          </SheetHeader>
          <Explorer scope="mobile" {...explorerProps} onClose={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>

      <MoveDialog nodes={explorerNodes} movingId={moveId} onClose={() => setMoveId(null)} onMove={moveNode} />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleting?.name}” from the template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingInside ? `Everything inside it (${deletingInside} ${deletingInside === 1 ? "item" : "items"}) is removed too. ` : ""}
              Entries already created from this template keep their files. Nothing changes until you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleting) deleteNode(deleting.id); }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateFilePane({
  node,
  path,
  autoFocus,
  onChange,
  onRename,
  onMove,
  onDelete,
  onClose,
}: {
  node: TemplateNode;
  path: string[];
  autoFocus: boolean;
  onChange: (change: Partial<TemplateNode>) => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const Icon = KIND_ICON[node.kind];
  const coverId = `template-cover-${node.id}`;
  const include = node.includeInCoverProgress ?? node.kind === "checklist";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Icon aria-hidden className="size-4 shrink-0 text-amethyst" />
          <p className="flex min-w-0 items-center gap-1 text-sm">
            {path.map((part, index) => (
              <span key={`${part}-${index}`} className="flex min-w-0 items-center gap-1 text-muted-foreground">
                <span className="max-w-24 truncate">{part}</span>
                <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-60" />
              </span>
            ))}
            <span className="truncate font-medium" title={node.name}>{node.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id={coverId} checked={include} onCheckedChange={(checked) => onChange({ includeInCoverProgress: checked })} />
          <Label htmlFor={coverId} className="text-xs font-normal text-muted-foreground">Counts toward cover progress</Label>
        </div>
        <div className="flex items-center">
          <PaneButton label={`Rename ${node.name}`} onClick={onRename}><Pencil aria-hidden /></PaneButton>
          <PaneButton label={`Move ${node.name}`} onClick={onMove}><FolderInput aria-hidden /></PaneButton>
          <PaneButton label={`Remove ${node.name}`} onClick={onDelete}><Trash2 aria-hidden /></PaneButton>
          <PaneButton label="Close file" onClick={onClose}><X aria-hidden /></PaneButton>
        </div>
      </div>
      {node.kind === "note" ? (
        <TemplateNoteEditor node={node} autoFocus={autoFocus} onChange={onChange} />
      ) : (
        <StarterTasks node={node} autoFocus={autoFocus} onChange={onChange} />
      )}
    </div>
  );
}

function PaneButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick} className="text-muted-foreground hover:text-amethyst pointer-coarse:size-9">
      {children}
    </Button>
  );
}

function TemplateNoteEditor({ node, autoFocus, onChange }: { node: TemplateNode; autoFocus: boolean; onChange: (change: Partial<TemplateNode>) => void }) {
  const editorRef = useRef<LiveMarkdownEditorHandle>(null);
  const [status, setStatus] = useState<EditorStatus>({ canUndo: false, canRedo: false, heading: 0 });
  const length = node.content?.length ?? 0;
  return (
    <>
      <div className="flex min-h-11 shrink-0 items-center border-b border-border px-3 md:px-4">
        <EditorToolbar getView={() => editorRef.current?.view() ?? null} status={status} onInsertImages={(files) => editorRef.current?.insertImages(files)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 md:px-8">
        <LiveMarkdownEditor
          ref={editorRef}
          initialValue={node.content ?? ""}
          ariaLabel={`Starting contents of ${node.name}`}
          placeholder="Starting text for this note… Type # for a heading, - [ ] for a task."
          autoFocus={autoFocus}
          onChange={(content) => {
            const counts = markdownTaskCounts(content);
            onChange({ content, tasksTotal: counts.total, tasksChecked: counts.checked });
          }}
          onStatus={setStatus}
          onImageError={(message) => toast.error(message)}
        />
      </div>
      <p className={cn("shrink-0 border-t border-border px-4 py-2 text-right text-[11px] tabular-nums", length > MAX_NOTE_LENGTH ? "text-rose" : "text-muted-foreground")}>
        {length.toLocaleString("en")} / {MAX_NOTE_LENGTH.toLocaleString("en")} characters · Markdown
      </p>
    </>
  );
}

function StarterTasks({ node, autoFocus, onChange }: { node: TemplateNode; autoFocus: boolean; onChange: (change: Partial<TemplateNode>) => void }) {
  const tasks = node.tasks ?? [];
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addId = `template-task-${node.id}`;

  function setTasks(next: string[]) {
    onChange({ tasks: next });
  }

  function add() {
    const lines = draft.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    if (tasks.length + lines.length > MAX_TEMPLATE_TASKS) {
      setError(`A checklist can start with at most ${MAX_TEMPLATE_TASKS} tasks.`);
      return;
    }
    for (const line of lines) {
      const parsed = itemLabelSchema.safeParse(line);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check the task text.");
        return;
      }
    }
    setTasks([...tasks, ...lines]);
    setDraft("");
    setError(null);
  }

  function move(index: number, by: number) {
    const target = index + by;
    if (target < 0 || target >= tasks.length) return;
    const next = [...tasks];
    [next[index], next[target]] = [next[target], next[index]];
    setTasks(next);
    requestAnimationFrame(() => document.getElementById(`${addId}-${target}-${by < 0 ? "up" : "down"}`)?.focus());
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
      <p className="mb-3 text-xs text-muted-foreground">Starter tasks are created unchecked in every new entry.</p>
      {tasks.length ? (
        <ol aria-label={`Starter tasks in ${node.name}`} className="mb-4 space-y-1.5">
          {tasks.map((task, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <span aria-hidden className="size-4 shrink-0 rounded-full border border-white/25" />
              <Input
                value={task}
                aria-label={`Task ${index + 1}`}
                maxLength={500}
                onChange={(event) => setTasks(tasks.map((value, position) => (position === index ? event.target.value : value)))}
                className="h-9 min-w-0 flex-1 border-transparent bg-transparent px-2 hover:border-white/[0.08] focus-visible:border-ring"
              />
              <Button id={`${addId}-${index}-up`} type="button" variant="ghost" size="icon-sm" aria-label={`Move task ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)} className="text-muted-foreground pointer-coarse:size-9"><ArrowUp aria-hidden /></Button>
              <Button id={`${addId}-${index}-down`} type="button" variant="ghost" size="icon-sm" aria-label={`Move task ${index + 1} down`} disabled={index === tasks.length - 1} onClick={() => move(index, 1)} className="text-muted-foreground pointer-coarse:size-9"><ArrowDown aria-hidden /></Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove task ${index + 1}`} onClick={() => setTasks(tasks.filter((_, position) => position !== index))} className="text-muted-foreground hover:text-rose pointer-coarse:size-9"><Trash2 aria-hidden /></Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-4 rounded-md border border-dashed border-white/[0.1] px-3 py-4 text-sm text-muted-foreground">No starter tasks yet. The checklist will start empty.</p>
      )}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Label htmlFor={addId} className="text-xs font-medium text-muted-foreground">Add tasks <span className="font-normal text-muted-foreground/70">(one per line)</span></Label>
        <div className="flex items-start gap-2">
          <textarea
            id={addId}
            value={draft}
            rows={2}
            autoFocus={autoFocus}
            onChange={(event) => { setDraft(event.target.value); setError(null); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                add();
              }
            }}
            placeholder="e.g. Finish the tutorial"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${addId}-error` : `${addId}-hint`}
            className="min-h-11 min-w-0 flex-1 resize-y rounded-md border border-white/[0.12] bg-black/50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <Button type="submit" className="h-11 gap-2" disabled={!draft.trim()}><Plus aria-hidden /> Add</Button>
        </div>
        {error ? (
          <p id={`${addId}-error`} role="alert" className="text-xs text-rose">{error}</p>
        ) : (
          <p id={`${addId}-hint`} className="text-xs text-muted-foreground">Enter adds, Shift+Enter starts a new line.</p>
        )}
      </form>
    </div>
  );
}
