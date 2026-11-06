import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { NewQuickNoteButton, NoteTime } from "@/components/notes/quick-note-actions";
import { loadQuickNoteList } from "@/lib/data/quick-notes";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Quick Notes" };

export default async function QuickNotesPage() {
  const ctx = await requireUser();
  const notes = await loadQuickNoteList(ctx);
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader
        title="Quick Notes"
        description="Notes that aren’t tied to any entry. Capture from Home or start one here."
        actions={<NewQuickNoteButton />}
      />
      {notes.length ? (
        <ul aria-label="Quick notes" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface/30">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/notes/${note.id}`}
                className="group/note grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors outline-none hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.045] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <FileText aria-hidden className="size-4 shrink-0 text-amethyst/80" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium transition-colors group-hover/note:text-amethyst">{note.name}</span>
                <NoteTime iso={note.updatedAt} className="col-start-2 text-xs text-muted-foreground tabular-nums sm:col-start-auto" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
          No quick notes yet. Start one here, or capture a thought from Home.
        </p>
      )}
    </PageContainer>
  );
}
