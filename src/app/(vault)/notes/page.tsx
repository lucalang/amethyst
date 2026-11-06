import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { FileText, NotebookPen } from "lucide-react";
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
        icon={NotebookPen}
        actions={<NewQuickNoteButton />}
      />
      {notes.length ? (
        <ul aria-label="Quick notes" className="grid gap-2.5">
          {notes.map((note, index) => (
            <li key={note.id} className="enter" style={{ "--enter-index": index + 1 } as CSSProperties}>
              <Link
                href={`/notes/${note.id}`}
                className="ui-card group/note grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3.5 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <span aria-hidden className="ui-icon ui-icon-sm row-span-2 sm:row-span-1">
                  <FileText className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold transition-colors group-hover/note:text-(--tone)">{note.name}</span>
                <NoteTime iso={note.updatedAt} className="col-start-2 text-xs text-muted-foreground tabular-nums sm:col-start-auto" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="ui-empty enter flex flex-col items-center gap-3 px-5 py-10 text-center" style={{ "--enter-index": 1 } as CSSProperties}>
          <span aria-hidden className="ui-icon">
            <NotebookPen className="size-4" />
          </span>
          <p className="text-sm text-muted-foreground">No quick notes yet. Start one here, or capture a thought from Home.</p>
        </div>
      )}
    </PageContainer>
  );
}
