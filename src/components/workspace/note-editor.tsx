"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Eye, PenLine } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/media/markdown";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { MAX_NOTE_LENGTH } from "@/lib/validation/workspace";
import type { NodeDetail, WorkspaceNode } from "@/lib/workspace/tree";
import { errorMessage, nodeQueryKey, readLocal, useHydrated, writeLocal } from "./client-utils";
import { SaveStatus, type SaveState } from "./save-status";

const AUTOSAVE_DELAY_MS = 700;
const MODE_KEY = "archive:note-mode";

type Backup = { content: string; baseVersion: number };
type Mode = "write" | "preview";
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

const textareaClass =
  "block min-h-[50vh] w-full flex-1 resize-none bg-transparent px-4 py-5 font-sans text-[15px] leading-7 text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/70 md:px-8";

/**
 * Markdown note with autosave. Drafts are mirrored to localStorage until the
 * server confirms them, saves are serialized, and version conflicts are
 * surfaced instead of silently overwriting another tab's changes.
 */
export function NoteEditor(props: {
  detail: NodeDetail;
  imageHosts: readonly string[];
  autoFocus?: boolean;
  onSaved: (node: WorkspaceNode) => void;
}) {
  // localStorage (drafts, mode) is only readable after hydration.
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="h-10 border-b border-border" />
        <textarea readOnly aria-label={`Contents of ${props.detail.node.name}`} value={props.detail.node.content} className={textareaClass} />
      </div>
    );
  }
  return <LiveNoteEditor {...props} />;
}

function LiveNoteEditor({
  detail,
  imageHosts,
  autoFocus,
  onSaved,
}: {
  detail: NodeDetail;
  imageHosts: readonly string[];
  autoFocus?: boolean;
  onSaved: (node: WorkspaceNode) => void;
}) {
  const fileId = detail.node.id;
  const name = detail.node.name;
  const queryClient = useQueryClient();

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
  const [mode, setMode] = useState<Mode>(() => (readLocal(MODE_KEY) === "preview" ? "preview" : "write"));

  const draftRef = useRef(initial.draft);
  const savedRef = useRef({ content: detail.node.content, version: detail.node.version });
  const conflictRef = useRef<{ content: string; version: number } | null>(
    initial.conflict ? { content: detail.node.content, version: detail.node.version } : null,
  );
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function remember(content: string, version: number, updatedAt: string) {
    savedRef.current = { content, version };
    queryClient.setQueryData<NodeDetail>(nodeQueryKey(fileId), (old) =>
      old ? { ...old, node: { ...old.node, content, version, updatedAt } } : old,
    );
  }

  async function handleConflict() {
    const latest = await apiFetch<NodeDetail>(`/api/nodes/${fileId}`);
    if (latest.node.content === draftRef.current) {
      // Our own earlier save (for example from before a file switch) already landed.
      remember(latest.node.content, latest.node.version, latest.node.updatedAt);
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
      remember(content, node.version, node.updatedAt);
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
    draftRef.current = theirs.content;
    setDraft(theirs.content);
    clearDraftBackup(fileId);
    setState({ kind: "saved" });
  }

  function switchMode(next: Mode) {
    setMode(next);
    writeLocal(MODE_KEY, next);
  }

  const autosave = useEffectEvent(() => {
    void save();
  });
  useEffect(() => {
    const timer = window.setTimeout(autosave, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const flushOnUnmount = useEffectEvent(() => {
    mountedRef.current = false;
    if (draftRef.current !== savedRef.current.content) void save();
  });
  useEffect(() => {
    mountedRef.current = true;
    return () => flushOnUnmount();
  }, []);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

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
      <div className="sticky top-[6.25rem] z-10 flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-1.5 md:px-8">
        <SaveStatus state={state} onRetry={state.kind === "error" ? () => void save() : undefined} />
        <div role="group" aria-label="Editor mode" className="flex rounded-md border border-border bg-surface p-0.5">
          <ModeButton active={mode === "write"} onClick={() => switchMode("write")} icon={PenLine} label="Write" />
          <ModeButton active={mode === "preview"} onClick={() => switchMode("preview")} icon={Eye} label="Preview" />
        </div>
      </div>

      {state.kind === "conflict" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-coral/30 bg-coral/10 px-4 py-2.5 text-sm md:px-8">
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

      {mode === "write" ? (
        <textarea
          ref={textareaRef}
          aria-label={`Contents of ${name}`}
          value={draft}
          maxLength={MAX_NOTE_LENGTH}
          spellCheck
          placeholder={"Start writing…\n\nMarkdown works here: # Heading, **bold**, - list, [link](https://…)"}
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key.toLowerCase() === "s" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void save();
            }
          }}
          onBlur={() => {
            if (draftRef.current !== savedRef.current.content) void save();
          }}
          className={textareaClass}
        />
      ) : (
        <div className="min-h-[50vh] flex-1 px-4 py-5 md:px-8">
          {draft.trim() ? (
            <Markdown content={draft} imageHosts={imageHosts} className="max-w-3xl text-[15px] leading-7" />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing written yet. Switch to Write to start.</p>
          )}
        </div>
      )}
      <p className="border-t border-border px-4 py-2 text-right text-[11px] text-muted-foreground tabular-nums md:px-8">
        {draft.length.toLocaleString("en")} / {MAX_NOTE_LENGTH.toLocaleString("en")} characters · Markdown
      </p>
    </div>
  );
}

function ModeButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof Eye; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-9",
        active && "bg-secondary text-foreground",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </button>
  );
}
