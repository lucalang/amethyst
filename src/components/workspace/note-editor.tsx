"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { LiveMarkdownEditor, type EditorStatus, type LiveMarkdownEditorHandle } from "@/components/editor/live-markdown-editor";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { MAX_NOTE_LENGTH } from "@/lib/validation/workspace";
import { markdownTaskCounts } from "@/lib/progress/markdown";
import type { NodeDetail, WorkspaceNode } from "@/lib/workspace/tree";
import { errorMessage, nodeQueryKey, readLocal, useHydrated, writeLocal } from "./client-utils";
import { SaveStatus, type SaveState } from "./save-status";

const AUTOSAVE_DELAY_MS = 700;

type Backup = { content: string; baseVersion: number };
const backupKey = (fileId: string) => `archive:draft:${fileId}`;

function readBackup(fileId: string): Backup | null {
  const raw = readLocal(backupKey(fileId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Backup>;
    return typeof parsed.content === "string" && typeof parsed.baseVersion === "number"
      ? { content: parsed.content, baseVersion: parsed.baseVersion }
      : null;
  } catch {
    return null;
  }
}

const writeBackup = (fileId: string, backup: Backup) => writeLocal(backupKey(fileId), JSON.stringify(backup));
export const clearDraftBackup = (fileId: string) => writeLocal(backupKey(fileId), null);

const TOOLBAR_ROW = "sticky top-[6.25rem] z-10 flex min-h-11 items-center justify-between gap-3 border-b border-border bg-black/90 px-3 backdrop-blur md:px-6";
const PAGE = "px-5 md:px-10 lg:px-14";

/**
 * Markdown note with Obsidian-style live preview and autosave. Drafts are
 * mirrored to localStorage until the server confirms them, saves are
 * serialized, and version conflicts are surfaced instead of overwriting
 * another tab's changes.
 */
export function NoteEditor(props: { detail: NodeDetail; autoFocus?: boolean; onSaved: (node: WorkspaceNode) => void; onTaskCountsChange: (counts: { total: number; checked: number }) => void }) {
  // The editor and local drafts only exist in the browser.
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <div className="flex flex-1 flex-col">
        <div className={TOOLBAR_ROW} />
        <div className={`${PAGE} flex-1 py-6 text-base leading-[1.75] whitespace-pre-wrap text-foreground/90`} aria-busy="true">
          {props.detail.node.content}
        </div>
      </div>
    );
  }
  return <LiveNoteEditor {...props} />;
}

function LiveNoteEditor({ detail, autoFocus, onSaved, onTaskCountsChange }: { detail: NodeDetail; autoFocus?: boolean; onSaved: (node: WorkspaceNode) => void; onTaskCountsChange: (counts: { total: number; checked: number }) => void }) {
  const fileId = detail.node.id;
  const name = detail.node.name;
  const queryClient = useQueryClient();
  const editorRef = useRef<LiveMarkdownEditorHandle>(null);

  const [initial] = useState(() => {
    const backup = readBackup(fileId);
    if (backup && backup.content !== detail.node.content) {
      return { draft: backup.content, restored: true, conflict: backup.baseVersion !== detail.node.version };
    }
    if (backup) clearDraftBackup(fileId);
    return { draft: detail.node.content, restored: false, conflict: false };
  });
  const [draft, setDraft] = useState(initial.draft);
  const [state, setState] = useState<SaveState>(initial.conflict ? { kind: "conflict" } : initial.restored ? { kind: "dirty" } : { kind: "saved" });
  const [editorStatus, setEditorStatus] = useState<EditorStatus>({ canUndo: false, canRedo: false, heading: 0 });

  const draftRef = useRef(initial.draft);
  const savedRef = useRef({ content: detail.node.content, version: detail.node.version });
  const conflictRef = useRef<{ content: string; version: number } | null>(
    initial.conflict ? { content: detail.node.content, version: detail.node.version } : null,
  );
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  function remember(content: string, node: WorkspaceNode) {
    savedRef.current = { content, version: node.version };
    queryClient.setQueryData<NodeDetail>(nodeQueryKey(fileId), (old) =>
      old ? { ...old, node: { ...old.node, ...node, content } } : old,
    );
  }

  async function handleConflict() {
    const latest = await apiFetch<NodeDetail>(`/api/nodes/${fileId}`);
    if (latest.node.content === draftRef.current) {
      // Our own earlier save (for example from before a file switch) already landed.
      remember(latest.node.content, latest.node);
      onSaved(latest.node);
      clearDraftBackup(fileId);
      setState({ kind: "saved" });
      return;
    }
    conflictRef.current = { content: latest.node.content, version: latest.node.version };
    setState({ kind: "conflict" });
  }

  async function saveNow() {
    const content = draftRef.current;
    const base = savedRef.current;
    if (content === base.content || conflictRef.current) return;
    setState({ kind: "saving" });
    try {
      const { node } = await apiFetch<{ node: WorkspaceNode }>(`/api/nodes/${fileId}`, {
        method: "PATCH",
        json: { content, expectedVersion: base.version },
      });
      remember(content, node);
      onSaved(node);
      if (draftRef.current === content) {
        clearDraftBackup(fileId);
        setState({ kind: "saved" });
      } else {
        writeBackup(fileId, { content: draftRef.current, baseVersion: node.version });
        setState({ kind: "dirty" });
      }
    } catch (error) {
      try {
        if (error instanceof ApiError && error.status === 409) return await handleConflict();
        throw error;
      } catch (failure) {
        const message = errorMessage(failure);
        setState({ kind: "error", message });
        if (!mountedRef.current) {
          toast.error(`“${name}” was not saved: ${message}`, { description: "Your text is kept in this browser. Reopen the file to retry." });
        }
      }
    }
  }

  /** Queue a save of the newest draft behind any save already running. */
  function save(): Promise<void> {
    const run = chainRef.current.then(saveNow);
    chainRef.current = run.catch(() => undefined);
    return run;
  }

  function change(value: string) {
    setDraft(value);
    draftRef.current = value;
    if (conflictRef.current) {
      writeBackup(fileId, { content: value, baseVersion: savedRef.current.version });
      return;
    }
    if (value === savedRef.current.content) {
      clearDraftBackup(fileId);
      setState({ kind: "saved" });
    } else {
      writeBackup(fileId, { content: value, baseVersion: savedRef.current.version });
      setState({ kind: "dirty" });
    }
  }

  function keepMine() {
    const theirs = conflictRef.current;
    if (!theirs) return;
    savedRef.current = theirs;
    conflictRef.current = null;
    void save();
  }

  function loadTheirs() {
    const theirs = conflictRef.current;
    if (!theirs) return;
    conflictRef.current = null;
    savedRef.current = theirs;
    editorRef.current?.setContent(theirs.content);
    draftRef.current = theirs.content;
    setDraft(theirs.content);
    clearDraftBackup(fileId);
    setState({ kind: "saved" });
  }

  const autosave = useEffectEvent(() => {
    void save();
  });
  useEffect(() => {
    const timer = window.setTimeout(autosave, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const reportTasks = useEffectEvent(() => onTaskCountsChange(markdownTaskCounts(draft)));
  useEffect(() => reportTasks(), [draft]);

  const flushOnUnmount = useEffectEvent(() => {
    mountedRef.current = false;
    if (draftRef.current !== savedRef.current.content) void save();
  });
  useEffect(() => {
    mountedRef.current = true;
    return () => flushOnUnmount();
  }, []);

  const announceRestore = useEffectEvent(() => {
    if (initial.restored) toast.info(`Restored unsaved changes to “${name}” from this browser.`);
  });
  useEffect(() => announceRestore(), []);

  const unsaved = state.kind !== "saved";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const sendBeacon = () => {
      if (draftRef.current === savedRef.current.content || conflictRef.current) return;
      const body = JSON.stringify({ content: draftRef.current, expectedVersion: savedRef.current.version });
      if (body.length > 60_000) return; // keepalive requests are capped at 64 KiB
      void fetch(`/api/nodes/${fileId}`, {
        method: "PATCH",
        keepalive: true,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
      }).catch(() => undefined);
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", sendBeacon);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", sendBeacon);
    };
  }, [unsaved, fileId]);

  return (
    <div className="flex flex-1 flex-col">
      <div className={TOOLBAR_ROW}>
        <EditorToolbar
          getView={() => editorRef.current?.view() ?? null}
          status={editorStatus}
          onInsertImages={(files) => editorRef.current?.insertImages(files)}
        />
        <SaveStatus state={state} onRetry={state.kind === "error" ? () => void save() : undefined} className="shrink-0" />
      </div>

      {state.kind === "conflict" ? (
        <div role="alert" className={`flex flex-wrap items-center gap-3 border-b border-rose/30 bg-rose/10 py-2.5 text-sm ${PAGE}`}>
          <p className="min-w-0 flex-1">This note was changed somewhere else (another tab or device) while you were editing.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={keepMine}>
              Keep my version
            </Button>
            <Button size="sm" variant="outline" onClick={loadTheirs}>
              Load the other version
            </Button>
          </div>
        </div>
      ) : null}

      <div className={`enter enter-soft flex-1 ${PAGE}`}>
        <LiveMarkdownEditor
          ref={editorRef}
          initialValue={initial.draft}
          ariaLabel={`Contents of ${name}`}
          placeholder="Start writing… Type # for a heading, **bold**, - for a list."
          autoFocus={autoFocus}
          onChange={change}
          onSave={() => void save()}
          onBlur={() => {
            if (draftRef.current !== savedRef.current.content) void save();
          }}
          onStatus={setEditorStatus}
          onImageError={(message) => toast.error(message)}
        />
      </div>
      <p className={`border-t border-border py-2 text-right text-[11px] text-muted-foreground tabular-nums ${PAGE}`}>
        {draft.length.toLocaleString("en")} / {MAX_NOTE_LENGTH.toLocaleString("en")} characters · Markdown
      </p>
    </div>
  );
}
