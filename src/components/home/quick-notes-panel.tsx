"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, FileText, Loader2, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { MAX_QUICK_CAPTURE_LENGTH, type QuickNoteSummary } from "@/lib/validation/quick-notes";

const stamp = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Home's Quick Notes: capture a thought into a new note and jump back into recent ones. */
export function QuickNotesPanel({ notes }: { notes: QuickNoteSummary[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();
  const empty = text.trim() === "";

  async function capture() {
    if (empty || saving) return;
    setSaving(true);
    try {
      await apiFetch("/api/quick-notes", { method: "POST", json: { content: text } });
      setText("");
      toast.success("Saved to Quick Notes");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn’t save the note. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-6">
      <form
        className="flex min-w-0 flex-col rounded-xl border border-white/[0.08] bg-surface/40 p-3 shadow-[inset_0_1px_0_rgb(var(--ink-rgb)/0.04)] focus-within:border-amethyst/45 focus-within:shadow-[0_18px_44px_-30px_rgb(var(--accent-rgb)/0.9)]"
        onSubmit={(event) => {
          event.preventDefault();
          void capture();
        }}
      >
        <label htmlFor="quick-capture" className="sr-only">
          Quick note
        </label>
        <textarea
          id="quick-capture"
          value={text}
          maxLength={MAX_QUICK_CAPTURE_LENGTH}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void capture();
            }
          }}
          rows={4}
          placeholder="Capture a thought… The first line becomes the note’s name."
          className="min-h-28 w-full flex-1 resize-none bg-transparent px-1.5 py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground/80"
        />
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2.5">
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            <kbd className="rounded border border-white/[0.12] px-1 font-sans text-[11px]">Ctrl</kbd> +{" "}
            <kbd className="rounded border border-white/[0.12] px-1 font-sans text-[11px]">Enter</kbd> to save
          </p>
          <Button type="submit" size="sm" disabled={empty || saving} className="ml-auto h-8 gap-1.5 px-3">
            {saving ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <NotebookPen aria-hidden className="size-3.5" />}
            Save note
          </Button>
        </div>
      </form>

      <div className="flex min-w-0 flex-col">
        <h3 className="mb-1.5 px-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Recent notes</h3>
        {notes.length ? (
          <ul aria-label="Recent quick notes" className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {notes.map((note) => (
              <li key={note.id}>
                <Link
                  href={`/notes/${note.id}`}
                  className="group/note flex min-w-0 items-center gap-3 px-2 py-2.5 transition-colors outline-none hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.045] focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FileText aria-hidden className="size-4 shrink-0 text-amethyst/80" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm transition-colors group-hover/note:text-amethyst">{note.name}</span>
                    {note.snippet ? <span className="block truncate text-xs text-muted-foreground">{note.snippet}</span> : null}
                  </span>
                  <time dateTime={note.updatedAt} suppressHydrationWarning className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {stamp.format(new Date(note.updatedAt))}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-white/[0.1] px-4 py-3.5 text-sm text-muted-foreground">No quick notes yet. Anything you capture lands here.</p>
        )}
        <Link
          href="/notes"
          className="mt-3 inline-flex items-center gap-1.5 self-start rounded-md px-1 text-sm font-medium text-foreground/85 outline-none hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open Quick Notes <ArrowRight aria-hidden className="size-4 text-amethyst" />
        </Link>
      </div>
    </div>
  );
}
