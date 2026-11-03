"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FolderInput, Frame, Loader2, MoreHorizontal, Palette, Pencil, Pin, PinOff, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CategorySelect } from "@/components/categories/category-picker";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import { CoverArtworkField } from "@/components/media/cover-artwork-field";
import { FramePicker, frameChoice, type FrameChoice } from "@/components/media/frame-picker";
import { useSettings } from "@/components/layout/settings-context";
import { ImageUrlField } from "@/components/media/image-url-field";
import { MediaImage } from "@/components/media/media-image";
import { usePinToggle } from "@/components/media/pin-button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import { CATEGORY_PARAM, parseCategoryIds, sortCategories, type Category } from "@/lib/categories";
import { accentStyle } from "@/lib/collection-identity";
import { collectionPath, entryPath, type LibraryCategory } from "@/lib/collections";
import type { CoverShape } from "@/lib/cover-shape";
import { resolveFrame, type ArtworkFrameId } from "@/lib/frames";
import { DEFAULT_PROGRESS_LABEL, MAX_PROGRESS_LABEL_LENGTH } from "@/lib/progress/label";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { errorMessage } from "./client-utils";
import { WorkspaceThemeDialog } from "./workspace-theme-dialog";

type Entry = Tables<"entries">;

/**
 * Artwork and title. Part of the normal page flow (never sticky): as it scrolls
 * away it shrinks and fades via a scroll-driven animation.
 */
export function EntryHeader({
  collection,
  collections,
  entry,
  categories,
  categoryIds,
  totals,
  pinned,
  onEntryChange,
}: {
  collection: LibraryCategory;
  collections: LibraryCategory[];
  entry: Entry;
  categories: Category[];
  categoryIds: string[];
  totals: { total: number; checked: number };
  pinned: boolean;
  onEntryChange: (entry: Entry) => void;
}) {
  const router = useRouter();
  const { artworkFrame } = useSettings();
  const [editOpen, setEditOpen] = useState(false);
  const [frameOpen, setFrameOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [savedCategories, setSavedCategories] = useState<Category[] | null>(null);
  const pin = usePinToggle(entry.id, entry.title, pinned);
  const accent = accentStyle(collection.accent_color);
  const resolvedFrame = resolveFrame(entry.frame, artworkFrame);
  const banner = entry.banner_url ?? collection.banner_url ?? entry.cover_url;
  const hasDedicatedBanner = Boolean(entry.banner_url || collection.banner_url);
  // Names always come from the latest server list, so renames show up here too.
  const assigned = sortCategories(
    (savedCategories ?? categoryIds.map((id) => ({ id, name: "" }))).flatMap((category) => {
      const current = categories.find((candidate) => candidate.id === category.id);
      return current ? [current] : category.name ? [category] : [];
    }),
  );

  return (
    <header data-testid="entry-header" className="header-scroll-exit relative border-b border-white/[0.06]" style={accent}>
      <div aria-hidden className="relative h-48 overflow-hidden sm:h-60 md:h-76 lg:h-88">
        {banner ? (
          <MediaImage
            src={banner}
            alt=""
            sizes={hasDedicatedBanner ? "100vw" : "200px"}
            priority
            className={cn(
              hasDedicatedBanner
                ? cn("object-[50%_30%]", entry.banner_url ? "opacity-90" : "opacity-65")
                : "scale-110 opacity-45 blur-2xl saturate-125",
            )}
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,var(--ca-glow,rgb(var(--accent-rgb)/0.26)),transparent_62%),radial-gradient(ellipse_at_90%_10%,rgb(var(--rose-rgb)/0.1),transparent_55%)]" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(65%_85%_at_16%_100%,var(--ca-soft,rgb(var(--accent-rgb)/0.2)),transparent_70%)]" />
        <div className="absolute inset-0 bg-linear-to-b from-black/15 via-black/30 via-52% to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_60%_at_18%_100%,rgb(var(--shadow-rgb)/calc(0.65*var(--shadow-alpha))),transparent_72%)]" />
      </div>
      <div className="mx-auto max-w-[88rem] px-4 md:px-6">
        <div className="relative -mt-24 flex flex-col gap-4 pb-7 sm:-mt-28 md:-mt-40 md:flex-row md:items-end md:gap-7 lg:-mt-44 lg:gap-8">
          <ArtworkFrame
            frame={resolvedFrame}
            className={cn(
              "enter enter-card shrink-0",
              entry.cover_shape === "square" ? "w-32 sm:w-36 md:w-48 lg:w-56" : "w-28 sm:w-32 md:w-44 lg:w-48",
            )}
            style={{ "--enter-index": 0 } as React.CSSProperties}
          >
            <div
              className={cn(
                "relative overflow-hidden rounded-lg bg-secondary shadow-[0_28px_70px_-24px_var(--ca-glow,rgb(var(--accent-rgb)/0.6)),0_12px_40px_-12px_rgb(var(--shadow-rgb)/calc(0.9*var(--shadow-alpha)))]",
                entry.cover_shape === "square" ? "aspect-square" : "aspect-[2/3]",
                resolvedFrame === "none" && "ring-1 ring-white/12",
              )}
            >
              <MediaImage src={entry.cover_url} alt={`${entry.title} cover`} sizes="(min-width: 1024px) 224px, (min-width: 768px) 192px, 144px" priority fallbackLabel={entry.title} />
            </div>
          </ArtworkFrame>
          <div className="enter min-w-0 flex-1 pb-1" style={{ "--enter-index": 1 } as React.CSSProperties}>
            <Link
              href={collectionPath(collection)}
              className={cn(
                "text-[11px] font-semibold tracking-[0.16em] break-words uppercase [text-shadow:0_1px_10px_rgb(var(--shadow-rgb)/calc(0.85*var(--shadow-alpha)))]",
                accent ? "text-[var(--ca)]" : "text-amethyst",
              )}
            >
              {collection.name}
            </Link>
            <h1 className="mt-1.5 text-2xl leading-tight font-semibold tracking-tight break-words [text-shadow:0_2px_18px_rgb(var(--shadow-rgb)/calc(0.75*var(--shadow-alpha)))] md:text-[2.1rem] lg:text-[2.5rem]">{entry.title}</h1>
            {entry.platform ? <p className="mt-1 text-sm text-muted-foreground">{entry.platform}</p> : null}
            {assigned.length ? (
              <ul aria-label="Labels" className="mt-2.5 flex flex-wrap gap-1.5">
                {assigned.map((category) => (
                  <li key={category.id} className="min-w-0">
                    <Link
                      href={`${collectionPath(collection)}?${CATEGORY_PARAM}=${category.id}`}
                      title={`Show entries in “${category.name}”`}
                      className={cn(
                        "group/cat inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground/90 ring-1 backdrop-blur-sm transition-[background-color,box-shadow,color,translate] duration-200 outline-none hover:-translate-y-px hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                        accent
                          ? "bg-[var(--ca-soft)] ring-[var(--ca-line)] hover:ring-[var(--ca)] hover:shadow-[0_6px_18px_-8px_var(--ca-glow)]"
                          : "bg-amethyst/[0.12] ring-amethyst/25 hover:bg-amethyst/20 hover:ring-amethyst/60 hover:shadow-[0_6px_18px_-8px_rgb(var(--accent-rgb)/0.8)]",
                      )}
                    >
                      <Tag aria-hidden className={cn("size-3 shrink-0 transition-transform duration-200 group-hover/cat:-rotate-12", accent ? "text-[var(--ca)]" : "text-amethyst")} />
                      <span className="max-w-[14rem] truncate">{category.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {totals.total > 0 ? (
              <div className="mt-3 max-w-sm">
                <ProgressMeter done={totals.checked} total={totals.total} label={entry.progress_label?.trim() || "tasks done"} />
              </div>
            ) : null}
          </div>
          <div className="enter flex gap-2 pb-1" style={{ "--enter-index": 2 } as React.CSSProperties}>
            <Button variant="secondary" className="h-9 border border-white/[0.08] bg-surface/80 px-3 backdrop-blur-md hover:bg-surface-raised" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit details
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-9 bg-surface/75 backdrop-blur-md" aria-label="More entry actions">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
                <DropdownMenuItem disabled={pin.pending} onSelect={() => void pin.toggle()}>
                  {pin.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />} {pin.pinned ? "Unpin from Home" : "Pin to Home"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setFrameOpen(true)}>
                  <Frame aria-hidden /> Change artwork frame
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setThemeOpen(true)}>
                  <Palette aria-hidden /> Workspace theme
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { setMoveTarget(""); setMoveError(null); setMoveOpen(true); }}>
                  <FolderInput aria-hidden /> Move to collection
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden /> Delete entry
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
            values.coverShape !== entry.cover_shape ||
            (values.bannerUrl.trim() || null) !== entry.banner_url ||
            (values.progressLabel.trim() || null) !== entry.progress_label;
          if (detailsChanged) {
            const { entry: updated } = await apiFetch<{ entry: Entry }>(`/api/entries/${entry.id}`, {
              method: "PATCH",
              json: { ...values, expectedVersion: entry.version },
            });
            onEntryChange(updated);
            // A rename gives the entry a new readable address; the old one keeps redirecting.
            if (updated.slug !== entry.slug) router.replace(`${entryPath(updated)}${window.location.search}`);
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

      <WorkspaceThemeDialog open={themeOpen} onOpenChange={setThemeOpen} entry={entry} onEntryChange={onEntryChange} />

      <ChangeFrameDialog
        open={frameOpen}
        onOpenChange={setFrameOpen}
        entry={entry}
        accountFrame={artworkFrame}
        onSave={async (nextFrame) => {
          if (nextFrame !== (entry.frame ?? null)) {
            const { entry: updated } = await apiFetch<{ entry: Entry }>(`/api/entries/${entry.id}`, {
              method: "PATCH",
              json: { frame: nextFrame, expectedVersion: entry.version },
            });
            onEntryChange(updated);
            router.refresh();
          }
          toast.success("Artwork frame saved.");
        }}
      />

      <Dialog open={moveOpen} onOpenChange={(open) => { if (!moving) setMoveOpen(open); }}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Move to collection</DialogTitle>
            <DialogDescription>Workspace content, progress and labels stay with this entry.</DialogDescription>
          </DialogHeader>
          {collections.some((item) => item.id !== entry.collection_id) ? (
            <div className="space-y-2">
              <Label htmlFor="move-entry-category">Destination</Label>
              <Select value={moveTarget} onValueChange={setMoveTarget} disabled={moving}>
                <SelectTrigger id="move-entry-category" className="w-full"><SelectValue placeholder="Choose a collection" /></SelectTrigger>
                <SelectContent>{collections.filter((item) => item.id !== entry.collection_id).map((item) => <SelectItem key={item.id} value={item.id} className="break-all">{item.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : <p className="text-sm text-muted-foreground">No other collections.</p>}
          {moveError ? <p role="alert" className="text-sm text-rose">{moveError}</p> : null}
          <DialogFooter>
            <Button variant="outline" disabled={moving} onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button disabled={moving || !moveTarget} onClick={async () => {
              setMoving(true);
              setMoveError(null);
              try {
                const { entry: updated } = await apiFetch<{ entry: Entry }>(`/api/entries/${entry.id}`, { method: "PATCH", json: { collectionId: moveTarget, expectedVersion: entry.version } });
                onEntryChange(updated);
                setSavedCategories(null);
                setMoveOpen(false);
                router.replace(`${entryPath(updated)}${window.location.search}`);
                router.refresh();
                toast.success("Entry moved.");
              } catch (error) { setMoveError(errorMessage(error)); }
              finally { setMoving(false); }
            }}>{moving ? <Loader2 aria-hidden className="animate-spin" /> : <FolderInput aria-hidden />}Move entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  router.push(collectionPath(collection));
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

function ChangeFrameDialog({
  open,
  onOpenChange,
  entry,
  accountFrame,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: Entry;
  accountFrame: ArtworkFrameId;
  onSave: (frame: ArtworkFrameId | null) => Promise<void>;
}) {
  const [choice, setChoice] = useState<FrameChoice>(() => frameChoice(entry.frame));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownKey, setShownKey] = useState(`${entry.id}-${entry.frame ?? "default"}-${open}`);
  const currentKey = `${entry.id}-${entry.frame ?? "default"}-${open}`;
  if (shownKey !== currentKey) {
    setShownKey(currentKey);
    setChoice(frameChoice(entry.frame));
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change artwork frame</DialogTitle>
          <DialogDescription>Choose a decorative frame for “{entry.title}” or follow your account default.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            try {
              await onSave(choice === "default" ? null : choice);
              onOpenChange(false);
            } catch (saveError) {
              setError(errorMessage(saveError));
            } finally {
              setPending(false);
            }
          }}
          className="space-y-4"
        >
          <FramePicker
            value={choice}
            onChange={setChoice}
            accountFrame={accountFrame}
            coverUrl={entry.cover_url}
            coverShape={entry.cover_shape}
            title={entry.title}
            disabled={pending}
          />
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
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null} Save frame
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  onSave: (values: { title: string; coverUrl: string; coverShape: CoverShape; bannerUrl: string; progressLabel: string }, categories: Category[]) => Promise<void>;
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
                  coverShape: formData.get("coverShape") as CoverShape,
                  bannerUrl: String(formData.get("bannerUrl") ?? ""),
                  progressLabel: String(formData.get("progressLabel") ?? ""),
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
            collectionId={entry.collection_id}
            categories={categories}
            defaultSelected={assigned.map((category) => category.id)}
            onSelectionChange={(selected) => selected.forEach((category) => created.current.set(category.id, category))}
          />
          <CoverArtworkField
            id="edit-cover"
            defaultShape={entry.cover_shape}
            defaultValue={entry.cover_url}
          />
          <ImageUrlField id="edit-banner" name="bannerUrl" label="Banner image URL" hint="Optional wide artwork for the header." defaultValue={entry.banner_url} shape="banner" />
          <div className="space-y-1.5">
            <Label htmlFor="edit-progress-label">Progress name</Label>
            <Input
              id="edit-progress-label"
              name="progressLabel"
              defaultValue={entry.progress_label ?? ""}
              placeholder={DEFAULT_PROGRESS_LABEL}
              maxLength={MAX_PROGRESS_LABEL_LENGTH}
              aria-describedby="edit-progress-label-hint"
              className="h-10"
            />
            <p id="edit-progress-label-hint" className="text-xs text-muted-foreground">
              What checklist items are called in this entry’s progress, like “quests” or “episodes”. Leave empty for “{DEFAULT_PROGRESS_LABEL}”.
            </p>
          </div>
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
