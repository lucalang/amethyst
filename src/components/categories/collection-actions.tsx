"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FolderPlus, LibraryBig, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import { categoryNameSchema, MAX_CATEGORY_NAME_LENGTH } from "@/lib/categories";
import type { LibraryCategory } from "@/lib/collections";
import { cn } from "@/lib/utils";

function CategoryNameDialog({ open, onOpenChange, collection }: { open: boolean; onOpenChange: (open: boolean) => void; collection?: LibraryCategory }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setError(null); onOpenChange(next); } }}>
      <DialogContent className="gap-6 rounded-lg border border-white/[0.08] bg-surface p-6 shadow-[0_24px_90px_rgb(0_0_0/0.75)] sm:max-w-[27rem]">
        <DialogHeader className="flex-row items-center gap-3.5">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-lg border border-amethyst/25 bg-amethyst/10 text-amethyst">
            {collection ? <Pencil className="size-5" /> : <FolderPlus className="size-5" />}
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-lg leading-6 font-semibold tracking-normal">{collection ? "Rename category" : "New category"}</DialogTitle>
            {collection ? <p className="mt-0.5 truncate text-xs text-muted-foreground" title={collection.name}>{collection.name}</p> : null}
            <DialogDescription className="sr-only">{collection ? "Entries and workspaces will stay in this category." : "Choose a name for your category."}</DialogDescription>
          </div>
        </DialogHeader>
        <form key={`${collection?.id ?? "new"}-${open}`} className="space-y-5" onSubmit={async (event) => {
          event.preventDefault();
          const parsed = categoryNameSchema.safeParse(new FormData(event.currentTarget).get("name"));
          if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Invalid name."); return; }
          setPending(true);
          setError(null);
          try {
            const result = await apiFetch<{ collection: LibraryCategory }>(collection ? `/api/collections/${collection.id}` : "/api/collections", {
              method: collection ? "PATCH" : "POST", json: { name: parsed.data },
            });
            onOpenChange(false);
            if (!collection) router.push(`/${result.collection.id}`);
            router.refresh();
          } catch (saveError) { setError(errorMessage(saveError)); }
          finally { setPending(false); }
        }}>
          <div className="space-y-2">
            <Label htmlFor={`category-name-${collection?.id ?? "new"}`} className="text-xs font-medium text-muted-foreground">Category name</Label>
            <Input
              id={`category-name-${collection?.id ?? "new"}`}
              name="name"
              defaultValue={collection?.name}
              placeholder="e.g. Reading"
              className="h-11 border-white/[0.12] bg-black/50 px-3.5 text-sm placeholder:text-muted-foreground/50"
              autoComplete="off"
              autoFocus
              required
              maxLength={MAX_CATEGORY_NAME_LENGTH}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `category-error-${collection?.id ?? "new"}` : undefined}
              disabled={pending}
            />
          </div>
          {error ? <p id={`category-error-${collection?.id ?? "new"}`} role="alert" className="flex items-start gap-2 rounded-md border border-rose/20 bg-rose/[0.06] px-3 py-2.5 text-xs leading-5 text-rose"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
          <DialogFooter className="-mx-6 -mb-6 gap-2 rounded-b-lg border-white/[0.07] bg-white/[0.015] px-6 py-4">
            <Button type="button" variant="ghost" className="h-10 px-4 text-muted-foreground" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="h-10 gap-2 px-4" disabled={pending}>{pending ? <Loader2 aria-hidden className="animate-spin" /> : collection ? <Pencil aria-hidden /> : <FolderPlus aria-hidden />}{collection ? "Save name" : "Create category"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewCategoryButton() {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" size="sm" className="h-9 shrink-0 gap-2 border-white/[0.12] bg-white/[0.025] px-3 shadow-none hover:translate-y-0 hover:border-amethyst/40 hover:bg-amethyst/[0.08] hover:shadow-none [&_svg]:text-amethyst" onClick={() => setOpen(true)}><FolderPlus aria-hidden className="size-4" />New category</Button>
    <CategoryNameDialog open={open} onOpenChange={setOpen} />
  </>;
}

export function CollectionActions({ collection, className }: { collection: LibraryCategory; className?: string }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className={cn("size-9 shrink-0 border border-white/[0.08] bg-black/20 text-muted-foreground hover:border-amethyst/30 hover:bg-amethyst/[0.08] data-[state=open]:border-amethyst/30 data-[state=open]:bg-amethyst/[0.08]", className)} aria-label={`Manage ${collection.name}`} title={`Manage ${collection.name}`}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56 border border-white/[0.08] bg-surface-raised p-1.5 shadow-xl shadow-black/50">
        <DropdownMenuLabel className="flex min-w-0 items-center gap-2 px-2 py-2 text-xs font-medium text-muted-foreground"><LibraryBig aria-hidden className="size-3.5 shrink-0 text-amethyst" /><span className="truncate">{collection.name}</span></DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-0 my-1 bg-white/[0.07]" />
        <DropdownMenuItem className="min-h-9 gap-2.5" onSelect={() => setRenaming(true)}><Pencil aria-hidden />Rename category</DropdownMenuItem>
        <DropdownMenuItem className="min-h-9 gap-2.5" variant="destructive" onSelect={() => { setError(null); setDeleting(true); }}><Trash2 aria-hidden />Delete category</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <CategoryNameDialog open={renaming} onOpenChange={setRenaming} collection={collection} />
    <AlertDialog open={deleting} onOpenChange={(open) => { if (!pending) setDeleting(open); }}>
      <AlertDialogContent className="gap-5 rounded-lg border border-white/[0.08] bg-surface p-6 sm:max-w-[27rem]">
        <AlertDialogHeader className="text-left">
          <span aria-hidden className="mb-2 grid size-11 place-items-center rounded-lg border border-destructive/20 bg-destructive/[0.08] text-destructive"><Trash2 className="size-5" /></span>
          <AlertDialogTitle className="text-lg leading-7 font-semibold tracking-normal break-words">Delete &quot;{collection.name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6">Move any entries to another category first. This action never deletes entries or their workspaces.</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="flex items-start gap-2 rounded-md border border-rose/20 bg-rose/[0.06] px-3 py-2.5 text-xs leading-5 text-rose"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
        <AlertDialogFooter className="gap-2 border-t border-white/[0.07] pt-4">
          <AlertDialogCancel className="h-10 px-4" disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" className="h-10 gap-2 px-4" disabled={pending} onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await apiFetch(`/api/collections/${collection.id}`, { method: "DELETE" });
              setDeleting(false);
              router.push("/");
              router.refresh();
            } catch (deleteError) { setError(errorMessage(deleteError)); }
            finally { setPending(false); }
          }}>{pending ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}Delete category</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}