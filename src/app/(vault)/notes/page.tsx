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
        <ul aria-label="Quick notes" className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-surface/30">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/notes/${note.id}`}
                className="group/note flex min-w-0 items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-foreground/[0.035] focus-visible:bg-foreground/[0.045] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <FileText aria-hidden className="size-4 shrink-0 text-amethyst/80" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium transition-colors group-hover/note:text-amethyst">{note.name}</span>
                <NoteTime iso={note.updatedAt} className="shrink-0 text-xs text-muted-foreground tabular-nums" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-white/[0.1] px-5 py-8 text-center text-sm text-muted-foreground">
          No quick notes yet. Start one here, or capture a thought from Home.
        </p>
      )}
    </PageContainer>
  );
}
