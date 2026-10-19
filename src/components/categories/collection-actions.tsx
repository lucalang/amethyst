"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import { categoryNameSchema, MAX_CATEGORY_NAME_LENGTH } from "@/lib/categories";
import type { LibraryCategory } from "@/lib/collections";

function CategoryNameDialog({ open, onOpenChange, collection }: { open: boolean; onOpenChange: (open: boolean) => void; collection?: LibraryCategory }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setError(null); onOpenChange(next); } }}>
      <DialogContent className="rounded-lg">
        <DialogHeader>
          <DialogTitle>{collection ? "Rename category" : "New category"}</DialogTitle>
          <DialogDescription>{collection ? "Entries and workspaces will stay in this category." : "Choose a name for your category."}</DialogDescription>
        </DialogHeader>
        <form key={`${collection?.id ?? "new"}-${open}`} className="space-y-4" onSubmit={async (event) => {
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
            <Label htmlFor={`category-name-${collection?.id ?? "new"}`}>Name</Label>
            <Input id={`category-name-${collection?.id ?? "new"}`} name="name" defaultValue={collection?.name} autoFocus required maxLength={MAX_CATEGORY_NAME_LENGTH} aria-invalid={Boolean(error)} aria-describedby={error ? `category-error-${collection?.id ?? "new"}` : undefined} disabled={pending} />
          </div>
          {error ? <p id={`category-error-${collection?.id ?? "new"}`} role="alert" className="text-sm text-rose">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 aria-hidden className="animate-spin" /> : collection ? <Pencil aria-hidden /> : <Plus aria-hidden />}{collection ? "Save name" : "Create category"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewCategoryButton() {
  const [open, setOpen] = useState(false);
  return <>
    <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}><Plus aria-hidden />New category</Button>
    <CategoryNameDialog open={open} onOpenChange={setOpen} />
  </>;
}

export function CollectionActions({ collection }: { collection: LibraryCategory }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" aria-label={`Manage ${collection.name}`} title={`Manage ${collection.name}`}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setRenaming(true)}><Pencil aria-hidden />Rename category</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => { setError(null); setDeleting(true); }}><Trash2 aria-hidden />Delete category</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <CategoryNameDialog open={renaming} onOpenChange={setRenaming} collection={collection} />
    <AlertDialog open={deleting} onOpenChange={(open) => { if (!pending) setDeleting(open); }}>
      <AlertDialogContent className="rounded-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Delete &quot;{collection.name}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>Only empty categories can be deleted. Move any entries to another category first. Entries and workspaces will never be deleted by this action.</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-sm text-rose">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={async () => {
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