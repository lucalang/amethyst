"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clearDraftBackup, NoteEditor } from "@/components/workspace/note-editor";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { QuickNote, QuickNoteDetail } from "@/lib/data/quick-notes";

const stamp = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const failure = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);

/** Timestamp in the viewer's own time zone. */
export function NoteTime({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning className={className}>
      {stamp.format(new Date(iso))}
    </time>
  );
}

export function NewQuickNoteButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      className="gap-1.5"
      onClick={async () => {
        setBusy(true);
        try {
          const { node } = await apiFetch<{ node: QuickNote }>("/api/quick-notes", { method: "POST", json: { name: "Untitled note" } });
          router.push(`/notes/${node.id}`);
        } catch (error) {
          toast.error(failure(error, "Couldn’t create the note. Try again."));
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
      New note
    </Button>
  );
}

/** One quick note: rename, delete and the shared Markdown editor with autosave. */
export function QuickNoteWorkspace({ detail }: { detail: QuickNoteDetail }) {
  const router = useRouter();
  const id = detail.node.id;
  const [name, setName] = useState(detail.node.name);
  const [savedName, setSavedName] = useState(detail.node.name);
  const [deleting, setDeleting] = useState(false);

  async function rename() {
    const next = name.trim();
    if (!next || next === savedName) {
      setName(savedName);
      return;
    }
    try {
      const { node } = await apiFetch<{ node: QuickNote }>(`/api/quick-notes/${id}`, { method: "PATCH", json: { name: next } });
      setName(node.name);
      setSavedName(node.name);
    } catch (error) {
      setName(savedName);
      toast.error(failure(error, "Couldn’t rename the note."));
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${savedName}”? This can’t be undone.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/quick-notes/${id}`, { method: "DELETE" });
      clearDraftBackup(id);
      toast.success("Note deleted");
      router.replace("/notes");
      router.refresh();
    } catch (error) {
      toast.error(failure(error, "Couldn’t delete the note."));
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[88rem] flex-wrap items-center gap-2 px-4 pt-5 pb-3 md:px-6 md:pt-7">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
          <Link href="/notes">
            <ArrowLeft aria-hidden className="size-4" />
            Quick Notes
          </Link>
        </Button>
        <Button variant="ghost" size="sm" disabled={deleting} onClick={remove} className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive">
          {deleting ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Trash2 aria-hidden className="size-4" />}
          Delete
        </Button>
        <label htmlFor="quick-note-name" className="sr-only">
          Note name
        </label>
        <input
          id="quick-note-name"
          value={name}
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
          onBlur={rename}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setName(savedName);
              requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
            }
          }}
          className="w-full basis-full rounded-md bg-transparent px-1 py-1 text-2xl font-extrabold tracking-tight outline-none hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring md:text-3xl"
        />
      </div>
      <NoteEditor<QuickNote> detail={detail} endpoint={`/api/quick-notes/${id}`} toolbarClassName="top-14" onSaved={() => {}} />
    </div>
  );
}
