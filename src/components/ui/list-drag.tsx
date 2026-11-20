"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from "react";
import { cn } from "@/lib/utils";

/** The easing every reorder motion shares: quick to start, soft to land. */
export const SORT_EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** A gentle spring (slight overshoot) for a row settling into its new place. */
export const SETTLE_EASE = "cubic-bezier(0.25, 1.25, 0.4, 1)";
/** How much a picked-up row grows. */
export const LIFT_SCALE = "1.025";
/** Transition for a picked-up row: it follows the pointer instantly, but grows and gains its shadow smoothly. */
export const LIFT_TRANSITION = `scale 180ms ${SORT_EASE}, box-shadow 180ms ${SORT_EASE}, background-color 180ms ${SORT_EASE}, border-color 180ms ${SORT_EASE}`;

export function reducedMotion() {
  return document.documentElement.dataset.motion === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A tiny vibration on touch devices that support it (picking up, crossing a row, dropping). */
export function haptic(pointerType: string, strength: "tick" | "lift" = "tick") {
  if (pointerType === "mouse" || reducedMotion()) return;
  try {
    navigator.vibrate?.(strength === "lift" ? 12 : 6);
  } catch {
    // Not supported.
  }
}

/** While dragging, the whole page shows the grabbing cursor and text can't be selected. Returns the undo. */
export function lockPageForDrag() {
  const root = document.documentElement;
  const previous = { cursor: root.style.cursor, select: root.style.userSelect };
  root.style.cursor = "grabbing";
  root.style.userSelect = "none";
  return () => {
    root.style.cursor = previous.cursor;
    root.style.userSelect = previous.select;
  };
}

/**
 * Plays a FLIP glide: `element` was at `delta` px from where it now is, and slides home. A dropped row also
 * shrinks from its lifted size while its shadow fades, with a slight spring at the end.
 */
export function glide(element: HTMLElement, delta: number, { lifted = false }: { lifted?: boolean } = {}) {
  if (Math.abs(delta) < 1 && !lifted) return;
  // The shadow/background may fade normally; only position and size jump to the starting point.
  element.style.transition = lifted ? `box-shadow 320ms ${SORT_EASE}, background-color 320ms ${SORT_EASE}, border-color 320ms ${SORT_EASE}` : "none";
  element.style.translate = `0 ${delta}px`;
  if (lifted) element.style.scale = LIFT_SCALE;
  void element.getBoundingClientRect();
  const motion = `translate 340ms ${SETTLE_EASE}, scale 340ms ${SETTLE_EASE}, box-shadow 320ms ${SORT_EASE}, background-color 320ms ${SORT_EASE}, border-color 320ms ${SORT_EASE}`;
  element.style.transition = motion;
  element.style.translate = "";
  element.style.scale = "";
  const clear = (event: TransitionEvent) => {
    if (event.target !== element || event.propertyName !== "translate") return;
    element.removeEventListener("transitionend", clear);
    // Leave it alone if a new drag has already taken over the row's style.
    if (element.style.transition === motion) element.style.transition = "";
  };
  element.addEventListener("transitionend", clear);
}

/** The nearest ancestor that scrolls vertically (a dialog body or panel), for auto-scrolling while dragging. */
function scrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/** A row's on-screen top relative to its container, in the container's own px (undoing a dialog's zoom-in scale). */
function localTop(container: HTMLElement, row: HTMLElement) {
  const box = container.getBoundingClientRect();
  const scale = container.offsetHeight ? box.height / container.offsetHeight : 1;
  return (row.getBoundingClientRect().top - box.top) / (scale || 1);
}

type Slot = { top: number; height: number };
type DragState = { id: string; from: number; to: number; offset: number; shift: number; slot: Slot };

/**
 * Drag-to-reorder for a flat vertical list. Rows are elements with `data-sort-id` inside `containerRef` (which must
 * be `position: relative`). The picked-up row lifts and follows the pointer, the rows it passes slide aside to
 * open a gap, and a soft slot marks where it will land. Moves are tracked on the window, so re-rendering, leaving
 * the handle or scrolling can't end a drag early; it ends on release (`onDrop`), on pointer cancel or with Escape
 * (no change). Every order change, dragged or not (arrow buttons, keys), glides rows into their new places.
 */
export function useListDrag({
  ids,
  containerRef,
  scrollRef,
  onDrop,
  onAnnounce,
  label,
}: {
  /** Row ids in their current order. */
  ids: readonly string[];
  containerRef: RefObject<HTMLElement | null>;
  /** The scrolling ancestor, scrolled while dragging near its edges. */
  scrollRef?: RefObject<HTMLElement | null>;
  onDrop: (id: string, to: number) => void;
  onAnnounce?: (message: string) => void;
  label: (id: string) => string;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const stop = useRef<(() => void) | null>(null);
  /** Each row's top (relative to the container) as last laid out, to glide rows when the order changes. */
  const positions = useRef(new Map<string, number>());
  /** Where rows visually were when a drop happened, used instead of `positions` for that one change. */
  const dropped = useRef<{ id: string; tops: Map<string, number> } | null>(null);
  const latest = useRef({ ids, onDrop, onAnnounce, label });
  useLayoutEffect(() => {
    latest.current = { ids, onDrop, onAnnounce, label };
  });
  useEffect(() => () => stop.current?.(), []);

  const rowsOf = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("[data-sort-id]")];

  function startDrag(event: PointerEvent<HTMLElement>, id: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const container = containerRef.current;
    if (dragRef.current || !container) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const pointerType = event.pointerType;
    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // The window listeners keep the drag going without capture.
    }
    handle.focus({ preventScroll: true });
    const scroller = scrollRef?.current ?? scrollParent(container);

    // Measure the resting layout once; the gap and slot positions all come from it.
    const startBox = container.getBoundingClientRect();
    const layout = rowsOf(container).map((row) => {
      const rect = row.getBoundingClientRect();
      return { id: row.dataset.sortId!, top: rect.top - startBox.top, height: rect.height };
    });
    const from = layout.findIndex((row) => row.id === id);
    if (from < 0) return;
    const self = layout[from];
    const gap = layout.length > 1 ? Math.max(0, layout[1].top - (layout[0].top + layout[0].height)) : 0;
    const startY = event.clientY - startBox.top;
    const first: DragState = { id, from, to: from, offset: 0, shift: self.height + gap, slot: { top: self.top, height: self.height } };
    dragRef.current = first;
    setDrag(first);
    haptic(pointerType, "lift");
    const unlock = lockPageForDrag();
    const name = latest.current.label(id);
    latest.current.onAnnounce?.(`${name} picked up. Move it, then release to drop, or press Escape to cancel.`);

    let frame = 0;
    let lastY = event.clientY;
    const nearEdge = () => {
      if (!scroller) return 0;
      const bounds = scroller.getBoundingClientRect();
      const reach = 48;
      // Faster the closer the pointer gets to the edge.
      if (lastY < bounds.top + reach) return -Math.ceil(((bounds.top + reach - lastY) / reach) * 12);
      if (lastY > bounds.bottom - reach) return Math.ceil(((lastY - (bounds.bottom - reach)) / reach) * 12);
      return 0;
    };
    const update = () => {
      frame = 0;
      const current = dragRef.current;
      if (!current) return;
      const step = nearEdge();
      if (scroller && step) scroller.scrollTop += step;
      const box = container.getBoundingClientRect();
      const offset = lastY - box.top - startY;
      // Compare the dragged row's centre with the resting centres of the other rows.
      const centre = self.top + offset + self.height / 2;
      let to = 0;
      for (const row of layout) if (row.id !== id && row.top + row.height / 2 < centre) to += 1;
      const top = to > from ? layout[to].top + layout[to].height - self.height : to < from ? layout[to].top : self.top;
      if (to !== current.to) haptic(pointerType);
      const next = { ...current, offset, to, slot: { top, height: self.height } };
      dragRef.current = next;
      setDrag(next);
      if (step) frame = requestAnimationFrame(update);
    };
    const onMove = (move: globalThis.PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      move.preventDefault();
      lastY = move.clientY;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const finish = (save: boolean) => {
      stop.current?.();
      const current = dragRef.current;
      dragRef.current = null;
      if (!current) return;
      if (save && current.to !== current.from) {
        // Remember where every row is on screen right now, so they all glide from there into the new order.
        const tops = new Map(rowsOf(container).map((row) => [row.dataset.sortId!, localTop(container, row)]));
        dropped.current = { id: current.id, tops };
        haptic(pointerType);
        setDrag(null);
        latest.current.onDrop(current.id, current.to);
        latest.current.onAnnounce?.(`${name} dropped at position ${current.to + 1} of ${latest.current.ids.length}.`);
      } else {
        // Nothing moves: the row and any rows it pushed aside slide back via their CSS transitions.
        setDrag(null);
        latest.current.onAnnounce?.(save ? `${name} dropped in the same place.` : `Reordering cancelled. ${name} stayed in place.`);
      }
    };
    const onUp = (up: globalThis.PointerEvent) => up.pointerId === pointerId && finish(true);
    const onCancel = (cancel: globalThis.PointerEvent) => cancel.pointerId === pointerId && finish(false);
    const onKey = (key: globalThis.KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      key.stopPropagation();
      finish(false);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    // Capture phase, so Escape cancels the drag before it can close a surrounding dialog.
    window.addEventListener("keydown", onKey, true);
    stop.current = () => {
      stop.current = null;
      cancelAnimationFrame(frame);
      unlock();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      try {
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      } catch {
        // Already released.
      }
    };
  }

  // Whenever the order changes (a drop, the arrow buttons or keys), glide each row from where it was. Between
  // changes, positions are re-measured after each render, so dialogs that were still opening don't skew them.
  const order = ids.join("\n");
  const lastOrder = useRef(order);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || dragRef.current) return;
    const rows = rowsOf(container);
    const changed = lastOrder.current !== order;
    lastOrder.current = order;
    // A drop's positions wait for the order change that follows it (the parent may update a moment later).
    const drop = changed ? dropped.current : null;
    if (changed) dropped.current = null;
    const before = drop?.tops ?? positions.current;
    const animate = changed && before.size > 0 && !reducedMotion();
    // The drag's inline offsets were just removed. Measure the new resting layout without CSS transitions kicking
    // in (rows pushed aside would otherwise slide back from the gap); the dropped row's shadow may still fade.
    if (animate) for (const row of rows) row.style.transition = drop?.id === row.dataset.sortId ? `box-shadow 320ms ${SORT_EASE}` : "none";
    const now = rows.map((row) => ({ row, id: row.dataset.sortId!, top: localTop(container, row) }));
    if (animate) {
      for (const { row, id, top } of now) {
        const was = before.get(id);
        const lifted = drop?.id === id;
        if (was === undefined || (Math.abs(was - top) < 1 && !lifted)) row.style.transition = "";
        else glide(row, was - top, { lifted });
      }
    }
    positions.current = new Map(now.map(({ id, top }) => [id, top]));
  });

  /** Style for a row: the picked-up one lifts and follows the pointer; rows it has passed slide aside. */
  const rowStyle = (id: string): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (drag.id === id) {
      return { translate: `0 ${drag.offset}px`, scale: LIFT_SCALE, transition: LIFT_TRANSITION, position: "relative", zIndex: 20 };
    }
    const index = latest.current.ids.indexOf(id);
    const { from, to, shift } = drag;
    if (from < to && index > from && index <= to) return { translate: `0 ${-shift}px` };
    if (to < from && index >= to && index < from) return { translate: `0 ${shift}px` };
    return undefined;
  };

  return { dragId: drag?.id ?? null, slot: drag?.slot ?? null, startDrag, rowStyle };
}

/** The soft outline marking where a dragged row will land (inside the relatively positioned list container). */
export function DropSlot({ slot, className, as: Tag = "li" }: { slot: Slot | null; className?: string; as?: "li" | "div" }) {
  if (!slot) return null;
  return (
    <Tag
      aria-hidden
      role="presentation"
      className={cn(
        "drop-slot pointer-events-none absolute inset-x-0 rounded-md border border-dashed border-amethyst/45 bg-amethyst/[0.06] shadow-[inset_0_0_22px_rgb(var(--accent-rgb)/0.12)]",
        "transition-[top] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
        className,
      )}
      style={{ top: slot.top, height: slot.height }}
    />
  );
}

/** The glowing insertion line, for lists that can't open a gap (the nested To Do sidebar). It glides between spots. */
export function InsertionLine({ top, left = 6, right = 6, as: Tag = "li" }: { top: number | null; left?: number; right?: number; as?: "li" | "div" }) {
  if (top === null) return null;
  return (
    <Tag
      aria-hidden
      role="presentation"
      className="insertion-line pointer-events-none absolute z-30 h-0.5 rounded-full bg-gradient-to-r from-amethyst via-amethyst to-amethyst/10 shadow-[0_0_12px_var(--amethyst)] transition-[top,left] duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
      style={{ top: top - 1, left, right }}
    >
      <span className="absolute -top-[3px] -left-1 size-2 rounded-full border-2 border-amethyst bg-background shadow-[0_0_8px_var(--amethyst)]" />
    </Tag>
  );
}

/**
 * Class for sortable rows: rows slide smoothly when pushed aside or returned, and the picked-up row gets a raised,
 * glowing look.
 */
export const sortRowClass = (dragging: boolean) =>
  cn(
    "transition-[translate,scale,background-color,border-color,box-shadow] duration-[220ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
    dragging &&
      "border-amethyst/60 bg-surface-raised shadow-[0_22px_44px_-18px_rgb(var(--shadow-rgb)/0.9),0_0_0_1px_rgb(var(--accent-rgb)/0.35),0_0_26px_-6px_rgb(var(--accent-rgb)/0.45)]",
  );
