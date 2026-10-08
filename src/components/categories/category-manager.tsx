"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { MAX_CATEGORY_NAME_LENGTH, categoryNameSchema, sortCategories, type Category } from "@/lib/categories";
import { errorMessage } from "@/components/workspace/client-utils";
import type { EntryKind } from "@/lib/validation/entries";

const usageLabel = (count: number) => (count === 0 ? "Not used yet" : `${count} ${count === 1 ? "entry" : "entries"}`);

/** Create, rename and delete the account's categories. */
export function CategoryManager({ categories: initial, usage, kind }: { categories: Category[]; usage: Record<string, number>; kind: EntryKind }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initial);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; error?: string } | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const parsed = categoryNameSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid name.");
      return;
    }
    setAdding(true);
    try {
      const { category, created } = await apiFetch<{ category: Category; created: boolean }>("/api/categories", { method: "POST", json: { name: parsed.data, kind } });
      if (created) {
        setCategories((current) => sortCategories([...current, category]));
        setDraft("");
        router.refresh();
      } else {
        toast.info(`“${category.name}” already exists.`);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setAdding(false);
    }
  }

  async function rename() {
    if (!editing) return;
    const parsed = categoryNameSchema.safeParse(editing.name);
    if (!parsed.success) {
      setEditing({ ...editing, error: parsed.error.issues[0]?.message });
      return;
    }
    const current = categories.find((category) => category.id === editing.id);
    if (!current || current.name === parsed.data) {
      setEditing(null);
      return;
    }
    try {
      const { category } = await apiFetch<{ category: Category }>(`/api/categories/${editing.id}`, { method: "PATCH", json: { name: parsed.data } });
      setCategories((list) => sortCategories(list.map((item) => (item.id === category.id ? category : item))));
      setEditing(null);
      router.refresh();
    } catch (error) {
      setEditing({ ...editing, error: errorMessage(error) });
    }
  }

  async function remove(category: Category) {
    try {
      await apiFetch(`/api/categories/${category.id}`, { method: "DELETE" });
      setCategories((list) => list.filter((item) => item.id !== category.id));
      toast.success(`Deleted “${category.name}”. Its entries were kept.`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          placeholder="New category, e.g. Romance"
          aria-label="New category name"
          className="h-10 min-w-0 flex-1"
        />
        <Button type="submit" className="h-10 shrink-0 px-4" disabled={adding || !draft.trim()}>
          {adding ? <Loader2 aria-hidden className="animate-spin" /> : <Plus aria-hidden />} Add
        </Button>
      </form>

      {categories.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/[0.1] px-4 py-6 text-center text-sm text-muted-foreground">
          No categories yet. Create one here, or while creating or editing an entry.
        </p>
      ) : (
        <ul aria-label="Your categories" className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.08]">
          {categories.map((category) => {
            const count = usage[category.id] ?? 0;
            const isEditing = editing?.id === category.id;
            return (
              <li key={category.id} className="group/row flex min-h-14 items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[0.025]">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-amethyst/10 text-amethyst ring-1 ring-amethyst/25 transition-transform duration-200 group-hover/row:-rotate-12">
                  <Tag aria-hidden className="size-3.5" />
                </span>
                {isEditing ? (
                  <form
                    className="flex min-w-0 flex-1 flex-col gap-1"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void rename();
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <Input
                        autoFocus
                        value={editing.name}
                        maxLength={MAX_CATEGORY_NAME_LENGTH}
                        aria-label={`New name for ${category.name}`}
                        aria-invalid={Boolean(editing.error)}
                        onChange={(event) => setEditing({ id: category.id, name: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setEditing(null);
                        }}
                        className="h-9 min-w-0 flex-1"
                      />
                      <Button type="submit" size="icon" className="size-9 shrink-0" aria-label="Save name">
                        <Check aria-hidden />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label="Cancel rename" onClick={() => setEditing(null)}>
                        <X aria-hidden />
                      </Button>
                    </div>
                    {editing.error ? (
                      <p role="alert" className="text-xs text-rose">
                        {editing.error}
                      </p>
                    ) : null}
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={category.name}>
                        {category.name}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">{usageLabel(count)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 text-muted-foreground"
                      aria-label={`Rename ${category.name}`}
                      onClick={() => setEditing({ id: category.id, name: category.name })}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${category.name}`}
                      onClick={() => setDeleting(category)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && usage[deleting.id]
                ? `It will be removed from ${usageLabel(usage[deleting.id])}. The entries themselves are not deleted.`
                : "No entries use this category. Entries are never deleted with a category."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) void remove(deleting);
              }}
            >
              Delete category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
