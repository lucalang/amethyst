"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropSlot, sortRowClass, useListDrag } from "@/components/ui/list-drag";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import { accentStyle } from "@/lib/collection-identity";
import type { LibraryCategory } from "@/lib/collections";
import { cn } from "@/lib/utils";
import { ClientCollectionIcon } from "./collection-identity-fields";

/** Opens a dialog to reorder collections by dragging or with move buttons / arrow keys. */
export function ArrangeCollectionsButton({ collections, compact, className }: { collections: LibraryCategory[]; compact?: boolean; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState(collections);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const changed = order.length !== collections.length || order.some((item, index) => item.id !== collections[index]?.id);

  function show() {
    setOrder(collections);
    setAnnouncement("");
    setError(null);
    setOpen(true);
  }

  function relocate(list: LibraryCategory[], id: string, target: number) {
    const from = list.findIndex((item) => item.id === id);
    const to = Math.max(0, Math.min(list.length - 1, target));
    if (from < 0 || from === to) return list;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }

  function announce(list: LibraryCategory[], id: string) {
    const index = list.findIndex((item) => item.id === id);
    if (index >= 0) setAnnouncement(`${list[index].name}, position ${index + 1} of ${list.length}.`);
  }

  function move(id: string, delta: number, focus: "button" | "handle") {
    const index = order.findIndex((item) => item.id === id);
    const next = relocate(order, id, index + delta);
    if (next === order) return;
    setOrder(next);
    announce(next, id);
    requestAnimationFrame(() => {
      const button = document.getElementById(`arrange-${id}-${delta < 0 ? "up" : "down"}`) as HTMLButtonElement | null;
      if (focus === "button" && button && !button.disabled) button.focus();
      else document.getElementById(`arrange-${id}-handle`)?.focus();
    });
  }

  const { dragId, slot, startDrag, rowStyle } = useListDrag({
    ids: order.map((item) => item.id),
    containerRef: listRef,
    scrollRef,
    label: (id) => order.find((item) => item.id === id)?.name ?? "Collection",
    onAnnounce: setAnnouncement,
    onDrop: (id, to) => setOrder((current) => relocate(current, id, to)),
  });

  function onHandleKey(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(id, -1, "handle");
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      move(id, 1, "handle");
    }
  }

  async function save() {
    if (pending) return;
    if (!changed) {
      setOpen(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/collections/order", { method: "PUT", json: { ids: order.map((item) => item.id) } });
      setOpen(false);
      toast.success("Collection order saved");
      router.refresh();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setPending(false);
    }
  }

  return <>
    {compact ? (
      <Button
        variant="ghost"
        size="icon"
        className={cn("size-9 shrink-0 text-muted-foreground hover:bg-amethyst/[0.08] hover:text-amethyst", className)}
        aria-label="Arrange collections"
        title="Arrange collections"
        onClick={show}
      >
        <ArrowUpDown aria-hidden className="size-4" />
      </Button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        className={cn("h-9 shrink-0 gap-2 px-3 [&_svg]:text-amethyst", className)}
        onClick={show}
      >
        <ArrowUpDown aria-hidden className="size-4" />
        Arrange
      </Button>
    )}
    <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
      <DialogContent className="gap-5 rounded-2xl border border-border bg-card p-6 shadow-[0_24px_90px_rgb(var(--shadow-rgb)/calc(0.75*var(--shadow-alpha)))] sm:max-w-[28rem]">
        <DialogHeader className="flex-row items-center gap-3.5">
          <span aria-hidden className="ui-hero-icon">
            <ArrowUpDown className="size-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-lg leading-6 font-semibold tracking-normal">Arrange collections</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5">
              The first collection comes first in the navigation and on Home. Drag a row by its handle, or use the arrows.
            </DialogDescription>
          </div>
        </DialogHeader>
        <p id="arrange-instructions" className="sr-only">Drag the handle, or press the up or down arrow key on it to move that collection. Escape cancels a drag.</p>
        <div ref={scrollRef} className="-mx-2 max-h-[55vh] overflow-y-auto px-2 py-1">
          <ol ref={listRef} aria-label="Collection order" className={cn("relative space-y-1.5", dragId && "cursor-grabbing select-none")}>
            <DropSlot slot={slot} className="rounded-xl" />
            {order.map((item, index) => {
              const dragging = dragId === item.id;
              return (
                <li
                  key={item.id}
                  data-sort-id={item.id}
                  style={rowStyle(item.id)}
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 rounded-xl border py-1 pr-1 pl-1",
                    sortRowClass(dragging),
                    !dragging && "border-border bg-[rgb(var(--ink-rgb)/0.025)] hover:border-amethyst/30",
                  )}
                >
                  <button
                    type="button"
                    id={`arrange-${item.id}-handle`}
                    aria-label={`Reorder ${item.name}`}
                    aria-describedby="arrange-instructions"
                    className={cn(
                      "grid size-9 shrink-0 touch-none place-items-center rounded-lg text-muted-foreground transition-colors outline-none select-none hover:bg-amethyst/[0.08] hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring",
                      dragging ? "cursor-grabbing bg-amethyst/15 text-amethyst" : "cursor-grab",
                    )}
                    disabled={pending}
                    title="Drag to reorder"
                    onPointerDown={(event) => startDrag(event, item.id)}
                    onContextMenu={(event) => event.preventDefault()}
                    onKeyDown={(event) => onHandleKey(event, item.id)}
                  >
                    <GripVertical aria-hidden className="size-4" />
                  </button>
                  <span aria-hidden className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                  <span aria-hidden style={item.accent_color ? { ...accentStyle(item.accent_color), "--tone": "var(--ca)" } as CSSProperties : undefined} className="ui-icon ui-icon-sm ml-1">
                    <ClientCollectionIcon icon={item.icon} className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" title={item.name}>{item.name}</span>
                  <Button
                    id={`arrange-${item.id}-up`}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-amethyst pointer-coarse:size-9"
                    aria-label={`Move ${item.name} up`}
                    title="Move up"
                    disabled={pending || index === 0}
                    onClick={() => move(item.id, -1, "button")}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    id={`arrange-${item.id}-down`}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-amethyst pointer-coarse:size-9"
                    aria-label={`Move ${item.name} down`}
                    title="Move down"
                    disabled={pending || index === order.length - 1}
                    onClick={() => move(item.id, 1, "button")}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ol>
        </div>
        <p aria-live="polite" className="sr-only">{announcement}</p>
        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose/25 bg-rose/[0.07] px-3 py-2.5 text-xs leading-5 text-rose">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}
        <DialogFooter className="-mx-6 -mb-6 gap-2 rounded-b-2xl border-border bg-[rgb(var(--ink-rgb)/0.02)] px-6 py-4">
          <Button type="button" variant="ghost" className="h-10 px-4 text-muted-foreground" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" className="h-10 gap-2 px-4" disabled={pending || !changed} onClick={() => void save()}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <ArrowUpDown aria-hidden />}
            Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
