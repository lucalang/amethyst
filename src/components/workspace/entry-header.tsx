"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Loader2, MoreHorizontal, Pencil, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CategorySelect } from "@/components/categories/category-picker";
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
import { CATEGORY_PARAM, parseCategoryIds, sortCategories, type Category } from "@/lib/categories";
import { collectionForKind, type Collection } from "@/lib/collections";
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
  categories,
  categoryIds,
  totals,
  onEntryChange,
}: {
  collection: Collection;
  entry: Entry;
  categories: Category[];
  categoryIds: string[];
  totals: { total: number; checked: number };
  onEntryChange: (entry: Entry) => void;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [savedCategories, setSavedCategories] = useState<Category[] | null>(null);
  const banner = entry.banner_url ?? entry.cover_url;
  const kindLabel = capitalize(collection.singular);
  // Names always come from the latest server list, so renames show up here too.
  const assigned = sortCategories(
    (savedCategories ?? categoryIds.map((id) => ({ id, name: "" }))).flatMap((category) => {
      const current = categories.find((candidate) => candidate.id === category.id);
      return current ? [current] : category.name ? [category] : [];
    }),
  );

  return (
    <header data-testid="entry-header" className="header-scroll-exit">
      <div aria-hidden className="relative h-32 overflow-hidden md:h-48">
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
            className={`enter enter-card relative ${entry.kind === "game" ? "aspect-square w-28 md:w-36" : "aspect-[2/3] w-24 md:w-32"} shrink-0 overflow-hidden rounded-lg bg-secondary shadow-[0_24px_60px_-24px_rgb(165_124_255/0.55)] ring-1 ring-white/10`}
            style={{ "--enter-index": 0 } as React.CSSProperties}
          >
            <MediaImage src={entry.cover_url} alt={`${entry.title} cover`} priority fallbackLabel={entry.title} />
          </div>
          <div className="enter min-w-0 flex-1 pb-1" style={{ "--enter-index": 1 } as React.CSSProperties}>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-amethyst uppercase">{kindLabel}</p>
            <h1 className="mt-1.5 text-2xl leading-tight font-semibold tracking-tight break-words md:text-[2.1rem]">{entry.title}</h1>
            {entry.platform ? <p className="mt-1 text-sm text-muted-foreground">{entry.platform}</p> : null}
            {assigned.length ? (
              <ul aria-label="Categories" className="mt-2.5 flex flex-wrap gap-1.5">
                {assigned.map((category) => (
                  <li key={category.id} className="min-w-0">
                    <Link
                      href={`/${collection.slug}?${CATEGORY_PARAM}=${category.id}`}
                      title={`Show ${collection.label.toLowerCase()} in “${category.name}”`}
                      className="group/cat inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-amethyst/[0.1] px-2.5 text-xs font-medium text-foreground/90 ring-1 ring-amethyst/25 transition-[background-color,box-shadow,color,translate] duration-200 outline-none hover:-translate-y-px hover:bg-amethyst/20 hover:text-foreground hover:ring-amethyst/60 hover:shadow-[0_6px_18px_-8px_rgb(165_124_255/0.8)] focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Tag aria-hidden className="size-3 shrink-0 text-amethyst transition-transform duration-200 group-hover/cat:-rotate-12" />
                      <span className="max-w-[14rem] truncate">{category.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {totals.total > 0 ? (
              <div className="mt-3 max-w-sm">
                <ProgressMeter done={totals.checked} total={totals.total} label="tasks done" />
              </div>
            ) : null}
          </div>
          <div className="enter flex gap-2 pb-1" style={{ "--enter-index": 2 } as React.CSSProperties}>
            <Button variant="secondary" className="h-9 px-3" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit details
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-9" aria-label={`More ${collection.singular} actions`}>
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
        categories={categories}
        assigned={assigned}
        onSave={async (values, selected) => {
          const detailsChanged =
            values.title.trim() !== entry.title ||
            (values.coverUrl.trim() || null) !== entry.cover_url ||
            (values.bannerUrl.trim() || null) !== entry.banner_url;
          if (detailsChanged) {
            const { entry: updated } = await apiFetch<{ entry: Entry }>(`/api/entries/${entry.id}`, {
              method: "PATCH",
              json: { ...values, expectedVersion: entry.version },
            });
            onEntryChange(updated);
          }
          const before = assigned.map((category) => category.id).sort().join();
          if (selected.map((category) => category.id).sort().join() !== before) {
            // Categories are saved separately so the entry and its workspace stay untouched.
            await apiFetch(`/api/entries/${entry.id}/categories`, { method: "PUT", json: { categoryIds: selected.map((category) => category.id) } });
            setSavedCategories(selected);
          }
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
  categories,
  assigned,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: Entry;
  categories: Category[];
  assigned: Category[];
  onSave: (values: { title: string; coverUrl: string; bannerUrl: string }, categories: Category[]) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Categories created inside this dialog are not in the server list until the next refresh.
  const created = useRef(new Map<string, Category>());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>Artwork can be any public image link. A preview appears once the link is checked.</DialogDescription>
        </DialogHeader>
        <form
          key={`${entry.id}-${open}`}
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setPending(true);
            setError(null);
            try {
              await onSave(
                {
                  title: String(formData.get("title") ?? ""),
                  coverUrl: String(formData.get("coverUrl") ?? ""),
                  bannerUrl: String(formData.get("bannerUrl") ?? ""),
                },
                parseCategoryIds(formData.getAll("categoryIds")).flatMap((id) => {
                  const category =
                    categories.find((candidate) => candidate.id === id) ?? assigned.find((candidate) => candidate.id === id) ?? created.current.get(id);
                  return category ? [category] : [];
                }),
              );
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
            <Input id="edit-title" name="title" defaultValue={entry.title} required maxLength={300} className="h-10" />
          </div>
          <CategorySelect
            kind={collectionForKind(entry.kind).kind}
            categories={categories}
            defaultSelected={assigned.map((category) => category.id)}
            onSelectionChange={(selected) => selected.forEach((category) => created.current.set(category.id, category))}
          />
          <ImageUrlField
            id="edit-cover"
            name="coverUrl"
            label="Cover image URL"
            hint={entry.kind === "game" ? "Square artwork (1:1) works best." : "Portrait artwork (2:3) works best."}
            defaultValue={entry.cover_url}
            shape={entry.kind === "game" ? "square" : "poster"}
          />
          <ImageUrlField id="edit-banner" name="bannerUrl" label="Banner image URL" hint="Optional wide artwork for the header." defaultValue={entry.banner_url} shape="banner" />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)} className="h-10">
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="h-10">
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
