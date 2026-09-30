"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MediaImage } from "@/components/media/media-image";
import { ProgressMeter } from "@/components/media/progress-meter";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import type { Tables } from "@/lib/supabase/database.types";
import { ENTRY_KIND_LABELS, type EntryKind } from "@/lib/validation/entries";
import { errorMessage } from "./client-utils";

type Entry = Tables<"entries">;

/** Artwork and title. Part of the normal page flow, so it scrolls away with the page. */
export function EntryHeader({
  entry,
  totals,
  onEntryChange,
}: {
  entry: Entry;
  totals: { total: number; checked: number };
  onEntryChange: (entry: Entry) => void;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const banner = entry.banner_url ?? entry.cover_url;
  const kindLabel = ENTRY_KIND_LABELS[entry.kind as EntryKind] ?? "Entry";

  return (
    <header data-testid="entry-header">
      <div aria-hidden className="relative h-32 overflow-hidden md:h-48">
        {banner ? (
          <MediaImage src={banner} alt="" sizes="100vw" className={entry.banner_url ? "opacity-50" : "scale-110 opacity-40 blur-2xl"} />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/60 to-background" />
      </div>
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="relative -mt-16 flex flex-col gap-4 pb-6 md:-mt-24 md:flex-row md:items-end md:gap-5">
          <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary shadow-2xl md:w-32">
            <MediaImage src={entry.cover_url} alt={`${entry.title} cover`} sizes="128px" priority fallbackLabel={entry.title} />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-xs font-medium tracking-wide text-jade uppercase">{kindLabel}</p>
            <h1 className="mt-1 text-2xl leading-tight font-semibold break-words md:text-3xl">{entry.title}</h1>
            {entry.platform ? <p className="mt-1 text-sm text-muted-foreground">{entry.platform}</p> : null}
            {totals.total > 0 ? (
              <div className="mt-3 max-w-sm">
                <ProgressMeter done={totals.checked} total={totals.total} label="checklist items done" />
              </div>
            ) : null}
          </div>
          <div className="flex gap-2 pb-1">
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit details
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="More entry actions">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden /> Delete {kindLabel.toLowerCase()}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <EditDetailsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        entry={entry}
        onSave={async (values) => {
          const { entry: updated } = await apiFetch<{ entry: Entry }>(`/api/entries/${entry.id}`, {
            method: "PATCH",
            json: { ...values, expectedVersion: entry.version },
          });
          onEntryChange(updated);
          toast.success("Details saved.");
          router.refresh();
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entry.title}?</AlertDialogTitle>
            <AlertDialogDescription>All folders, notes and checklists in this workspace are permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await apiFetch(`/api/entries/${entry.id}`, { method: "DELETE" });
                  router.push("/");
                  router.refresh();
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}

function EditDetailsDialog({
  open,
  onOpenChange,
  entry,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: Entry;
  onSave: (values: { title: string; coverUrl: string; bannerUrl: string; platform?: string }) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isGame = entry.kind === "game";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>Artwork must be an https URL on an allowed image host.</DialogDescription>
        </DialogHeader>
        <form
          key={`${entry.id}-${entry.version}-${open}`}
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setPending(true);
            setError(null);
            try {
              await onSave({
                title: String(formData.get("title") ?? ""),
                coverUrl: String(formData.get("coverUrl") ?? ""),
                bannerUrl: String(formData.get("bannerUrl") ?? ""),
                ...(isGame ? { platform: String(formData.get("platform") ?? "") } : {}),
              });
              onOpenChange(false);
            } catch (saveError) {
              setError(errorMessage(saveError));
            } finally {
              setPending(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" name="title" defaultValue={entry.title} required maxLength={300} />
          </div>
          {isGame ? (
            <div className="space-y-1.5">
              <Label htmlFor="edit-platform">Platform</Label>
              <Input id="edit-platform" name="platform" defaultValue={entry.platform ?? ""} maxLength={80} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="edit-cover">Cover image URL</Label>
            <Input id="edit-cover" name="coverUrl" type="url" defaultValue={entry.cover_url ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-banner">Banner image URL</Label>
            <Input id="edit-banner" name="bannerUrl" type="url" defaultValue={entry.banner_url ?? ""} />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
