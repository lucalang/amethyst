"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ImageUrlField } from "@/components/media/image-url-field";
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
import type { Collection } from "@/lib/collections";
import type { Tables } from "@/lib/supabase/database.types";
import { errorMessage } from "./client-utils";

type Entry = Tables<"entries">;

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Artwork and title. Part of the normal page flow (never sticky): as it scrolls
 * away it shrinks and fades via a scroll-driven animation.
 */
export function EntryHeader({
  collection,
  entry,
  totals,
  onEntryChange,
}: {
  collection: Collection;
  entry: Entry;
  totals: { total: number; checked: number };
  onEntryChange: (entry: Entry) => void;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const banner = entry.banner_url ?? entry.cover_url;
  const kindLabel = capitalize(collection.singular);

  return (
    <header data-testid="entry-header" className="header-scroll-exit">
      <div aria-hidden className="relative h-36 overflow-hidden md:h-56">
        {banner ? (
          <MediaImage src={banner} alt="" className={entry.banner_url ? "opacity-55" : "scale-110 opacity-40 blur-2xl"} />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgb(165_124_255/0.22),transparent_60%),radial-gradient(ellipse_at_90%_10%,rgb(244_114_168/0.08),transparent_55%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black" />
      </div>
      <div className="mx-auto max-w-[88rem] px-4 md:px-6">
        <div className="relative -mt-16 flex flex-col gap-4 pb-7 md:-mt-24 md:flex-row md:items-end md:gap-6">
          <div
            className="enter relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg bg-secondary shadow-[0_24px_60px_-24px_rgb(165_124_255/0.5)] ring-1 ring-white/10 md:w-32"
            style={{ "--enter-index": 0 } as React.CSSProperties}
          >
            <MediaImage src={entry.cover_url} alt={`${entry.title} cover`} priority fallbackLabel={entry.title} />
          </div>
          <div className="enter min-w-0 flex-1 pb-1" style={{ "--enter-index": 1 } as React.CSSProperties}>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-amethyst uppercase">{kindLabel}</p>
            <h1 className="mt-1.5 text-2xl leading-tight font-semibold tracking-tight break-words md:text-[2.1rem]">{entry.title}</h1>
            {entry.platform ? <p className="mt-1 text-sm text-muted-foreground">{entry.platform}</p> : null}
            {totals.total > 0 ? (
              <div className="mt-3 max-w-sm">
                <ProgressMeter done={totals.checked} total={totals.total} label="tasks done" />
              </div>
            ) : null}
          </div>
          <div className="enter flex gap-2 pb-1" style={{ "--enter-index": 2 } as React.CSSProperties}>
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit details
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label={`More ${collection.singular} actions`}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden /> Delete {collection.singular}
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
                  router.push(`/${collection.slug}`);
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>Artwork can be any public image link. A preview appears once the link is checked.</DialogDescription>
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
          <ImageUrlField id="edit-cover" name="coverUrl" label="Cover image URL" hint="Portrait artwork (2:3) works best." defaultValue={entry.cover_url} shape="poster" />
          <ImageUrlField id="edit-banner" name="bannerUrl" label="Banner image URL" hint="Optional wide artwork for the header." defaultValue={entry.banner_url} shape="banner" />
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
