"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, FolderPlus, ImageIcon, Loader2, MoreHorizontal, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ImageUrlField } from "@/components/media/image-url-field";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import { MAX_CATEGORY_NAME_LENGTH } from "@/lib/categories";
import { accentStyle } from "@/lib/collection-identity";
import { collectionInputSchema, collectionPath, MAX_COLLECTION_DESCRIPTION_LENGTH, type LibraryCategory } from "@/lib/collections";
import { DEFAULT_PROGRESS_LABEL, MAX_PROGRESS_LABEL_LENGTH } from "@/lib/progress/label";
import { NO_TEMPLATE, type TemplateSummary } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { AccentPicker, ClientCollectionIcon, IconPicker } from "./collection-identity-fields";
import { CollectionCoverDialog } from "./collection-cover-dialog";

function CollectionDialog({ open, onOpenChange, collection }: { open: boolean; onOpenChange: (open: boolean) => void; collection?: LibraryCategory }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptionLength, setDescriptionLength] = useState(collection?.description?.length ?? 0);
  const [icon, setIcon] = useState(collection?.icon ?? null);
  const [accent, setAccent] = useState(collection?.accent_color ?? null);
  const [template, setTemplate] = useState(collection?.default_template_id ?? NO_TEMPLATE);
  const [shownOpen, setShownOpen] = useState(open);
  if (shownOpen !== open) {
    setShownOpen(open);
    setDescriptionLength(collection?.description?.length ?? 0);
    setIcon(collection?.icon ?? null);
    setAccent(collection?.accent_color ?? null);
    setTemplate(collection?.default_template_id ?? NO_TEMPLATE);
  }
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: ({ signal }) => apiFetch<{ templates: TemplateSummary[] }>("/api/templates", { signal }),
    enabled: open,
    staleTime: 30_000,
  });
  const key = collection?.id ?? "new";
  const fieldClass = "h-11 border-white/[0.16] bg-black/50 px-3.5 text-sm placeholder:text-muted-foreground/75";
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setError(null); onOpenChange(next); } }}>
      <DialogContent className="max-h-[92dvh] gap-6 overflow-y-auto rounded-lg border border-white/[0.08] bg-surface p-6 shadow-[0_24px_90px_rgb(var(--shadow-rgb)/calc(0.75*var(--shadow-alpha)))] sm:max-w-[34rem]">
        <DialogHeader className="flex-row items-center gap-3.5">
          <span aria-hidden style={accentStyle(accent)} className={cn("grid size-11 shrink-0 place-items-center rounded-lg border", accent ? "border-[var(--ca-line)] bg-[var(--ca-soft)] text-[var(--ca)]" : "border-amethyst/25 bg-amethyst/10 text-amethyst")}>
            {icon ? <ClientCollectionIcon icon={icon} className="size-5" /> : collection ? <Pencil className="size-5" /> : <FolderPlus className="size-5" />}
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-lg leading-6 font-semibold tracking-normal">{collection ? "Edit collection" : "New collection"}</DialogTitle>
            {collection ? <p className="mt-0.5 truncate text-xs text-muted-foreground" title={collection.name}>{collection.name}</p> : null}
            <DialogDescription className="sr-only">{collection ? "Entries and workspaces will stay in this collection." : "Choose a name and an optional description for your collection."}</DialogDescription>
          </div>
        </DialogHeader>
        <form key={`${key}-${open}`} className="space-y-5" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const parsed = collectionInputSchema.safeParse({
            name: form.get("name") ?? "",
            description: form.get("description") ?? "",
            icon,
            accentColor: accent,
            bannerUrl: String(form.get("bannerUrl") ?? ""),
            progressLabel: String(form.get("progressLabel") ?? ""),
            defaultTemplateId: template === NO_TEMPLATE ? null : template,
          });
          if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the collection details."); return; }
          setPending(true);
          setError(null);
          try {
            const result = await apiFetch<{ collection: LibraryCategory }>(collection ? `/api/collections/${collection.id}` : "/api/collections", {
              method: collection ? "PATCH" : "POST", json: parsed.data,
            });
            onOpenChange(false);
            if (!collection) router.push(collectionPath(result.collection));
            else if (result.collection.slug !== collection.slug) {
              // Renamed: move to the new readable address (the old one keeps redirecting).
              const current = collectionPath(collection);
              const { pathname, search } = window.location;
              if (pathname === current || pathname.startsWith(`${current}/`)) {
                router.replace(`${collectionPath(result.collection)}${pathname.slice(current.length)}${search}`);
              }
            }
            router.refresh();
          } catch (saveError) { setError(errorMessage(saveError)); }
          finally { setPending(false); }
        }}>
          <div className="space-y-2">
            <Label htmlFor={`collection-name-${key}`} className="text-xs font-medium text-muted-foreground">Name</Label>
            <Input
              id={`collection-name-${key}`}
              name="name"
              defaultValue={collection?.name}
              placeholder="e.g. Reading"
              className={fieldClass}
              autoComplete="off"
              autoFocus
              required
              maxLength={MAX_CATEGORY_NAME_LENGTH}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `collection-error-${key}` : undefined}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor={`collection-description-${key}`} className="text-xs font-medium text-muted-foreground">
                Description <span className="font-normal text-muted-foreground/85">(optional)</span>
              </Label>
              <span aria-hidden className={cn("text-[11px] tabular-nums text-muted-foreground", descriptionLength > MAX_COLLECTION_DESCRIPTION_LENGTH * 0.9 && "text-rose")}>
                {descriptionLength}/{MAX_COLLECTION_DESCRIPTION_LENGTH}
              </span>
            </div>
            <Textarea
              id={`collection-description-${key}`}
              name="description"
              defaultValue={collection?.description ?? ""}
              placeholder="What lives here? A sentence or two helps future you."
              rows={3}
              maxLength={MAX_COLLECTION_DESCRIPTION_LENGTH}
              onChange={(event) => setDescriptionLength(event.target.value.length)}
              className="max-h-64 min-h-20 resize-y border-white/[0.16] bg-black/50 px-3.5 py-2.5 text-sm leading-6 placeholder:text-muted-foreground/75"
              disabled={pending}
            />
          </div>

          <fieldset className="space-y-4 border-t border-white/[0.07] pt-5">
            <legend className="float-left mb-1 w-full text-sm font-medium">Look</legend>
            <div className="clear-both space-y-2">
              <Label htmlFor={`collection-icon-${key}`} className="text-xs font-medium text-muted-foreground">Icon</Label>
              <IconPicker id={`collection-icon-${key}`} value={icon} onChange={setIcon} accent={accent} disabled={pending} />
            </div>
            <div className="space-y-2">
              <Label id={`collection-accent-${key}-label`} htmlFor={`collection-accent-${key}`} className="text-xs font-medium text-muted-foreground">Accent color</Label>
              <AccentPicker id={`collection-accent-${key}`} value={accent} onChange={setAccent} disabled={pending} />
            </div>
            <ImageUrlField id={`collection-banner-${key}`} name="bannerUrl" label="Banner" hint="Optional wide artwork for the collection page and its Home card." defaultValue={collection?.banner_url} shape="banner" />
          </fieldset>

          <fieldset className="space-y-4 border-t border-white/[0.07] pt-5">
            <legend className="float-left mb-1 w-full text-sm font-medium">New entries</legend>
            <div className="clear-both space-y-2">
              <Label htmlFor={`collection-template-${key}`} className="text-xs font-medium text-muted-foreground">Default template</Label>
              <Select value={template} onValueChange={setTemplate} disabled={pending}>
                <SelectTrigger id={`collection-template-${key}`} className="h-11 w-full border-white/[0.12] bg-black/50" aria-describedby={`collection-template-${key}-hint`}>
                  <SelectValue placeholder="No template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>No template</SelectItem>
                  {templates.data?.templates.map((item) => <SelectItem key={item.id} value={item.id} className="break-all">{item.name}</SelectItem>)}
                  {template !== NO_TEMPLATE && !templates.data?.templates.some((item) => item.id === template) ? (
                    <SelectItem value={template}>{templates.isPending ? "Loading…" : "Current template"}</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              <p id={`collection-template-${key}-hint`} className="text-xs text-muted-foreground">
                {templates.isError
                  ? "Couldn’t load your templates. The current choice is kept."
                  : templates.data && templates.data.templates.length === 0
                    ? <>You don’t have any templates yet. <Link href="/settings/templates" className="text-amethyst underline-offset-4 hover:underline" onClick={() => onOpenChange(false)}>Create one in Settings</Link>.</>
                    : "Applied automatically when you add an entry here. You can pick another or none while creating."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`collection-progress-${key}`} className="text-xs font-medium text-muted-foreground">
                Progress name <span className="font-normal text-muted-foreground/85">(optional)</span>
              </Label>
              <Input
                id={`collection-progress-${key}`}
                name="progressLabel"
                defaultValue={collection?.progress_label ?? ""}
                placeholder={DEFAULT_PROGRESS_LABEL}
                maxLength={MAX_PROGRESS_LABEL_LENGTH}
                aria-describedby={`collection-progress-${key}-hint`}
                className={fieldClass}
                autoComplete="off"
                disabled={pending}
              />
              <p id={`collection-progress-${key}-hint`} className="text-xs text-muted-foreground">
                What new entries call their checklist progress, like “quests”. Existing entries keep their own.
              </p>
            </div>
          </fieldset>

          {error ? <p id={`collection-error-${key}`} role="alert" className="flex items-start gap-2 rounded-md border border-rose/20 bg-rose/[0.06] px-3 py-2.5 text-xs leading-5 text-rose"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
          <DialogFooter className="-mx-6 -mb-6 gap-2 rounded-b-lg border-white/[0.07] bg-white/[0.015] px-6 py-4">
            <Button type="button" variant="ghost" className="h-10 px-4 text-muted-foreground" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="h-10 gap-2 px-4" disabled={pending}>{pending ? <Loader2 aria-hidden className="animate-spin" /> : collection ? <Pencil aria-hidden /> : <FolderPlus aria-hidden />}{collection ? "Save changes" : "Create collection"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewCategoryButton({ className, label = "New collection" }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" size="sm" className={cn("h-9 shrink-0 gap-2 border-white/[0.12] bg-white/[0.025] px-3 shadow-none hover:translate-y-0 hover:border-amethyst/40 hover:bg-amethyst/[0.08] hover:shadow-none [&_svg]:text-amethyst", className)} onClick={() => setOpen(true)}><FolderPlus aria-hidden className="size-4" />{label}</Button>
    <CollectionDialog open={open} onOpenChange={setOpen} />
  </>;
}

const CONFIRM_PHRASE = "I understand";

export function CollectionActions({ collection, entryCount, className }: { collection: LibraryCategory; entryCount: number; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [renaming, setRenaming] = useState(false);
  const [choosingCovers, setChoosingCovers] = useState(false);
  // "confirm": first question; "final": typed confirmation for collections that still have entries.
  const [step, setStep] = useState<"confirm" | "final" | null>(null);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState(collection.id);
  if (shownFor !== collection.id) {
    setShownFor(collection.id);
    setStep(null);
    setTyped("");
    setError(null);
  }
  // If the entry count changes while the dialog is open, confirm again with the new number.
  const [shownCount, setShownCount] = useState(entryCount);
  if (shownCount !== entryCount) {
    setShownCount(entryCount);
    setTyped("");
    if (step === "final") setStep("confirm");
  }
  const populated = entryCount > 0;
  const entriesLabel = `${entryCount.toLocaleString("en")} ${entryCount === 1 ? "entry" : "entries"}`;
  const confirmed = typed === CONFIRM_PHRASE;

  function closeDelete() {
    if (pending) return;
    setStep(null);
    setTyped("");
    setError(null);
  }

  async function remove() {
    if (pending || (populated && !confirmed)) return;
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/api/collections/${collection.id}`, { method: "DELETE", json: { expectedEntries: entryCount } });
      setStep(null);
      setTyped("");
      toast.success(populated ? `Deleted “${collection.name}” and ${entriesLabel}` : `Deleted “${collection.name}”`);
      const current = collectionPath(collection);
      if (pathname === current || pathname.startsWith(`${current}/`)) router.push("/");
      router.refresh();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
      router.refresh();
    } finally { setPending(false); }
  }

  const errorBox = error ? <p role="alert" className="flex items-start gap-2 rounded-md border border-rose/20 bg-rose/[0.06] px-3 py-2.5 text-xs leading-5 text-rose"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />{error}</p> : null;

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={cn("size-9 shrink-0 border border-white/[0.08] bg-black/20 text-muted-foreground hover:border-amethyst/30 hover:bg-amethyst/[0.08] data-[state=open]:border-amethyst/30 data-[state=open]:bg-amethyst/[0.08]", className)} aria-label={`Manage ${collection.name}`} title={`Manage ${collection.name}`}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56 border border-white/[0.08] bg-surface-raised p-1.5 shadow-xl shadow-black/50">
        <DropdownMenuLabel className="flex min-w-0 items-center gap-2 px-2 py-2 text-xs font-medium text-muted-foreground"><span aria-hidden style={accentStyle(collection.accent_color)} className={cn("size-3.5 shrink-0", collection.accent_color ? "text-[var(--ca)]" : "text-amethyst")}><ClientCollectionIcon icon={collection.icon} className="size-full" /></span><span className="truncate">{collection.name}</span></DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-0 my-1 bg-white/[0.07]" />
        <DropdownMenuItem className="min-h-9 gap-2.5" onSelect={() => setRenaming(true)}><Pencil aria-hidden />Edit collection</DropdownMenuItem>
        <DropdownMenuItem className="min-h-9 gap-2.5" onSelect={() => setChoosingCovers(true)}><ImageIcon aria-hidden />Choose cover art</DropdownMenuItem>
        <DropdownMenuItem className="min-h-9 gap-2.5" variant="destructive" onSelect={() => { setError(null); setTyped(""); setStep("confirm"); }}><Trash2 aria-hidden />Delete collection</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <CollectionDialog open={renaming} onOpenChange={setRenaming} collection={collection} />
    <CollectionCoverDialog open={choosingCovers} onOpenChange={setChoosingCovers} collection={collection} />
    <AlertDialog open={step !== null} onOpenChange={(open) => { if (!open) closeDelete(); }}>
      <AlertDialogContent className="gap-5 rounded-lg border border-white/[0.08] bg-surface p-6 sm:max-w-[28rem]">
        {step === "final" ? <>
          <AlertDialogHeader className="text-left">
            <span aria-hidden className="mb-2 grid size-11 place-items-center rounded-lg border border-destructive/25 bg-destructive/[0.1] text-destructive"><TriangleAlert className="size-5" /></span>
            <AlertDialogTitle className="text-lg leading-7 font-semibold tracking-normal break-words">Permanently delete everything in &quot;{collection.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-6">
              The collection, its {entriesLabel}, and all of their workspace content (folders, notes, checklists and tasks) will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-md border border-destructive/20 bg-destructive/[0.05] px-3.5 py-3 text-xs">
            <dt className="text-muted-foreground">Collection</dt>
            <dd className="truncate font-medium text-foreground" title={collection.name}>{collection.name}</dd>
            <dt className="text-muted-foreground">Entries</dt>
            <dd className="font-medium text-foreground tabular-nums">{entriesLabel}</dd>
          </dl>
          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void remove(); }}>
            <Label htmlFor={`delete-confirm-${collection.id}`} className="text-xs leading-5 font-medium text-muted-foreground">
              Type <span className="font-semibold text-foreground">{CONFIRM_PHRASE}</span> to confirm
            </Label>
            <Input
              id={`delete-confirm-${collection.id}`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="h-11 border-white/[0.12] bg-black/50 px-3.5 text-sm"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              disabled={pending}
            />
          </form>
          {errorBox}
          <AlertDialogFooter className="gap-2 border-t border-white/[0.07] pt-4">
            <AlertDialogCancel className="h-10 px-4" disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" className="h-10 gap-2 px-4" disabled={pending || !confirmed} onClick={() => void remove()}>{pending ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}Delete collection and entries</Button>
          </AlertDialogFooter>
        </> : <>
          <AlertDialogHeader className="text-left">
            <span aria-hidden className="mb-2 grid size-11 place-items-center rounded-lg border border-destructive/20 bg-destructive/[0.08] text-destructive"><Trash2 className="size-5" /></span>
            <AlertDialogTitle className="text-lg leading-7 font-semibold tracking-normal break-words">Delete &quot;{collection.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-6">
              {populated
                ? <>This collection contains <span className="font-medium text-foreground">{entriesLabel}</span>. Deleting it also deletes those entries and their workspaces. To keep them, move them to another collection first.</>
                : "This empty collection will be permanently deleted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorBox}
          <AlertDialogFooter className="gap-2 border-t border-white/[0.07] pt-4">
            <AlertDialogCancel className="h-10 px-4" disabled={pending}>Cancel</AlertDialogCancel>
            {populated
              ? <Button variant="destructive" className="h-10 gap-2 px-4" onClick={() => { setError(null); setTyped(""); setStep("final"); }}>Continue<ArrowRight aria-hidden /></Button>
              : <Button variant="destructive" className="h-10 gap-2 px-4" disabled={pending} onClick={() => void remove()}>{pending ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}Delete collection</Button>}
          </AlertDialogFooter>
        </>}
      </AlertDialogContent>
    </AlertDialog>
  </>;
}