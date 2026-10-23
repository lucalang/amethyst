"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, GripVertical, LibraryBig, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import type { LibraryCategory } from "@/lib/collections";
import { cn } from "@/lib/utils";

const EDGE = 36;

/** Opens a dialog to reorder collections by dragging or with move buttons / arrow keys. */
export function ArrangeCollectionsButton({ collections, compact, className }: { collections: LibraryCategory[]; compact?: boolean; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState(collections);
  const [dragId, setDragId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const changed = order.length !== collections.length || order.some((item, index) => item.id !== collections[index]?.id);

  function show() {
    setOrder(collections);
    setDragId(null);
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

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    setDragId(id);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (dragId !== id || !listRef.current) return;
    const scroller = scrollRef.current;
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      if (event.clientY < bounds.top + EDGE) scroller.scrollBy({ top: -10 });
      else if (event.clientY > bounds.bottom - EDGE) scroller.scrollBy({ top: 10 });
    }
    // Target index = how many other rows have their midpoint above the pointer.
    let target = 0;
    for (const row of listRef.current.querySelectorAll<HTMLElement>("[data-arrange-id]")) {
      if (row.dataset.arrangeId === id) continue;
      const rect = row.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height / 2) target += 1;
    }
    setOrder((current) => relocate(current, id, target));
  }

  function onPointerEnd(id: string) {
    if (dragId !== id) return;
    setDragId(null);
    announce(order, id);
  }

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
        className={cn("h-9 shrink-0 gap-2 border-white/[0.12] bg-white/[0.025] px-3 shadow-none hover:translate-y-0 hover:border-amethyst/40 hover:bg-amethyst/[0.08] hover:shadow-none [&_svg]:text-amethyst", className)}
        onClick={show}
      >
        <ArrowUpDown aria-hidden className="size-4" />
        Arrange
      </Button>
    )}
    <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
      <DialogContent className="gap-5 rounded-lg border border-white/[0.08] bg-surface p-6 shadow-[0_24px_90px_rgb(0_0_0/0.75)] sm:max-w-[28rem]">
        <DialogHeader className="flex-row items-center gap-3.5">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-lg border border-amethyst/25 bg-amethyst/10 text-amethyst">
            <ArrowUpDown className="size-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-lg leading-6 font-semibold tracking-normal">Arrange collections</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5">
              The first collection comes first in the navigation and on Home. Drag a row by its handle, or use the arrows.
            </DialogDescription>
          </div>
        </DialogHeader>
        <p id="arrange-instructions" className="sr-only">Press the up or down arrow key on a handle to move that collection.</p>
        <div ref={scrollRef} className="-mx-2 max-h-[55vh] overflow-y-auto px-2 py-1">
          <ol ref={listRef} aria-label="Collection order" className={cn("space-y-1.5", dragId && "select-none")}>
            {order.map((item, index) => {
              const dragging = dragId === item.id;
              return (
                <li
                  key={item.id}
                  data-arrange-id={item.id}
                  className={cn(
                    "flex min-w-0 items-center gap-1.5 rounded-md border py-1 pr-1 pl-1 transition-[background-color,border-color,box-shadow] duration-150",
                    dragging ? "relative z-10 border-amethyst/45 bg-amethyst/[0.1] shadow-lg shadow-black/50" : "border-white/[0.07] bg-black/30",
                  )}
                >
                  <button
                    type="button"
                    id={`arrange-${item.id}-handle`}
                    aria-label={`Reorder ${item.name}`}
                    aria-describedby="arrange-instructions"
                    className={cn(
                      "grid size-9 shrink-0 touch-none place-items-center rounded text-muted-foreground transition-colors outline-none hover:bg-amethyst/[0.08] hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring",
                      dragging ? "cursor-grabbing text-amethyst" : "cursor-grab",
                    )}
                    disabled={pending}
                    onPointerDown={(event) => onPointerDown(event, item.id)}
                    onPointerMove={(event) => onPointerMove(event, item.id)}
                    onPointerUp={() => onPointerEnd(item.id)}
                    onPointerCancel={() => onPointerEnd(item.id)}
                    onLostPointerCapture={() => onPointerEnd(item.id)}
                    onKeyDown={(event) => onHandleKey(event, item.id)}
                  >
                    <GripVertical aria-hidden className="size-4" />
                  </button>
                  <span aria-hidden className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                  <LibraryBig aria-hidden className="ml-1 size-3.5 shrink-0 text-amethyst/70" />
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
          <p role="alert" className="flex items-start gap-2 rounded-md border border-rose/20 bg-rose/[0.06] px-3 py-2.5 text-xs leading-5 text-rose">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}
        <DialogFooter className="-mx-6 -mb-6 gap-2 rounded-b-lg border-white/[0.07] bg-white/[0.015] px-6 py-4">
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
