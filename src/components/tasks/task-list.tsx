"use client";

import { useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type Ref, type RefObject } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";

const GAP = 6;
const DRAG_THRESHOLD = 4;
const EDGE = 64;
const MAX_SCROLL_STEP = 22;

export type DragFlags = { dragging: boolean; lifted: number };
const IDLE: DragFlags = { dragging: false, lifted: 0 };

export type VirtualListHandle = {
  /** Scroll a row into view (it may not be mounted yet). */
  reveal: (key: string) => void;
  startDrag: (id: string, event: PointerEvent<HTMLElement>) => void;
};

export type Reorder = {
  /** Reorderable task ids in display order. */
  ids: string[];
  /** Tasks that move together when `id` is grabbed (itself, or the selection containing it). */
  block: (id: string) => string[];
  commit: (block: string[], beforeId: string | null) => void;
};

type Drag = {
  id: string;
  startY: number;
  startScroll: number;
  lastY: number;
  moved: boolean;
  block: string[];
  before: string | null | undefined;
  row: HTMLElement | null;
  frame: number;
  cleanup: () => void;
};

/**
 * Windowed list of variable-height rows inside an existing scroll container. Only rows near the
 * viewport (plus `pinned` ones, e.g. the focused row) are mounted. Drag reordering works on
 * measured offsets, so moving the pointer never reads layout from or re-renders the rows.
 */
export function VirtualTaskList<T extends { key: string; kind: string }>({
  items,
  scrollRef,
  label,
  estimate,
  render,
  pinned,
  reorder,
  onFocusKey,
  ref,
}: {
  items: T[];
  scrollRef: RefObject<HTMLDivElement | null>;
  label: string;
  estimate: (item: T) => number;
  render: (item: T, flags: DragFlags) => ReactNode;
  pinned: (string | null)[];
  reorder: Reorder | null;
  /** The row holding focus (kept mounted while scrolled away), or null. */
  onFocusKey: (key: string | null) => void;
  ref?: Ref<VirtualListHandle>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  const [drag, setDrag] = useState<{ ids: Set<string>; grabbed: string } | null>(null);
  const dragRef = useRef<Drag | null>(null);

  const indexByKey = useMemo(() => new Map(items.map((item, index) => [item.key, index])), [items]);
  const pinnedIndexes = [...pinned, drag?.grabbed ?? null].flatMap((key) => (key && indexByKey.has(key) ? [indexByKey.get(key)!] : []));
  const pinnedKey = pinnedIndexes.join();
  const rangeExtractor = useMemo(() => {
    const extra = pinnedKey ? pinnedKey.split(",").map(Number) : [];
    return (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      const base = defaultRangeExtractor(range);
      if (!extra.length) return base;
      return [...new Set([...base, ...extra.filter((index) => index < range.count)])].sort((a, b) => a - b);
    };
  }, [pinnedKey]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimate(items[index]),
    getItemKey: (index) => items[index].key,
    overscan: 6,
    scrollMargin: margin,
    rangeExtractor,
  });

  // The list's offset inside the scroll container; content above it (filters, empty states) can change.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measured after every render; only sets state on change
  useLayoutEffect(() => {
    const offset = listRef.current?.offsetTop ?? 0;
    if (offset !== margin) setMargin(offset);
  });
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(() => setMargin(listRef.current?.offsetTop ?? 0));
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scrollRef]);

  const latest = useRef({ items, reorder, virtualizer, margin, indexByKey });
  useLayoutEffect(() => {
    latest.current = { items, reorder, virtualizer, margin, indexByKey };
  });

  function updateDrag() {
    const state = dragRef.current;
    const scroller = scrollRef.current;
    const { reorder: config, virtualizer: v, margin: top, indexByKey: indexes } = latest.current;
    if (!state || !scroller || !config) return;
    const y = state.lastY - scroller.getBoundingClientRect().top + scroller.scrollTop - top;
    const moving = new Set(state.block);
    const measurements = v.measurementsCache;
    let before: string | null = null;
    let lineY = -1;
    let last = -1;
    for (const id of config.ids) {
      if (moving.has(id)) continue;
      const box = measurements[indexes.get(id) ?? -1];
      if (!box) continue;
      if (box.start - top + (box.size - GAP) / 2 > y) {
        before = id;
        lineY = box.start - top - GAP / 2;
        break;
      }
      last = box.end - top - GAP / 2;
    }
    if (before === null) lineY = last;
    state.before = before;
    if (indicatorRef.current) {
      indicatorRef.current.style.transform = `translateY(${Math.max(0, lineY) - 1}px)`;
      indicatorRef.current.style.opacity = lineY >= 0 ? "1" : "0";
    }
    if (!state.row?.isConnected) state.row = listRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(state.id)}"] [data-task-row]`) ?? null;
    if (state.row) state.row.style.translate = `0 ${state.lastY - state.startY + scroller.scrollTop - state.startScroll}px`;
  }

  function endDrag(commit: boolean) {
    const state = dragRef.current;
    if (!state) return;
    dragRef.current = null;
    state.cleanup();
    cancelAnimationFrame(state.frame);
    if (state.row) state.row.style.translate = "";
    if (indicatorRef.current) indicatorRef.current.style.opacity = "0";
    if (state.moved) {
      setDrag(null);
      if (commit && state.before !== undefined) latest.current.reorder?.commit(state.block, state.before);
    }
  }

  function autoScroll() {
    const state = dragRef.current;
    const scroller = scrollRef.current;
    if (!state || !scroller) return;
    const box = scroller.getBoundingClientRect();
    const fromTop = state.lastY - box.top;
    const fromBottom = box.bottom - state.lastY;
    const step =
      fromTop < EDGE ? -MAX_SCROLL_STEP * ((EDGE - Math.max(0, fromTop)) / EDGE) ** 2 : fromBottom < EDGE ? MAX_SCROLL_STEP * ((EDGE - Math.max(0, fromBottom)) / EDGE) ** 2 : 0;
    if (step) {
      const before = scroller.scrollTop;
      scroller.scrollTop += step;
      if (scroller.scrollTop !== before) updateDrag();
    }
    state.frame = requestAnimationFrame(autoScroll);
  }

  useImperativeHandle(ref, () => ({
    reveal(key) {
      const index = latest.current.indexByKey.get(key);
      if (index !== undefined) latest.current.virtualizer.scrollToIndex(index, { align: "auto" });
    },
    startDrag(id, event) {
      const config = latest.current.reorder;
      const scroller = scrollRef.current;
      if (!config || !scroller || event.button !== 0 || dragRef.current) return;
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const pointerId = event.pointerId;
      const onMove = (move: globalThis.PointerEvent) => {
        const state = dragRef.current;
        if (!state || move.pointerId !== pointerId) return;
        state.lastY = move.clientY;
        if (!state.moved) {
          if (Math.abs(move.clientY - state.startY) < DRAG_THRESHOLD) return;
          state.moved = true;
          state.block = latest.current.reorder?.block(id) ?? [id];
          setDrag({ ids: new Set(state.block), grabbed: id });
          state.frame = requestAnimationFrame(autoScroll);
        }
        updateDrag();
      };
      const onUp = (up: globalThis.PointerEvent) => up.pointerId === pointerId && endDrag(up.type === "pointerup");
      const onKey = (key: KeyboardEvent) => {
        if (key.key !== "Escape") return;
        key.preventDefault();
        key.stopPropagation();
        endDrag(false);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      window.addEventListener("keydown", onKey, true);
      dragRef.current = {
        id,
        startY: event.clientY,
        startScroll: scroller.scrollTop,
        lastY: event.clientY,
        moved: false,
        block: [id],
        before: undefined,
        row: null,
        frame: 0,
        cleanup: () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          window.removeEventListener("keydown", onKey, true);
          if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        },
      };
    },
  }));

  const virtualItems = virtualizer.getVirtualItems();
  return (
    <div
      ref={listRef}
      role="list"
      aria-label={label}
      className="relative"
      style={{ height: virtualizer.getTotalSize() }}
      onFocus={(event) => onFocusKey((event.target as HTMLElement).closest<HTMLElement>("[data-key]")?.dataset.key ?? null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocusKey(null);
      }}
    >
      {virtualItems.map((virtual) => {
        const item = items[virtual.index];
        const flags: DragFlags =
          drag && drag.ids.has(item.key) ? { dragging: true, lifted: drag.grabbed === item.key ? drag.ids.size : 0 } : IDLE;
        return (
          <div
            key={virtual.key}
            ref={virtualizer.measureElement}
            data-index={virtual.index}
            data-key={item.key}
            role="listitem"
            className={flags.lifted ? "absolute inset-x-0 top-0 z-20" : "absolute inset-x-0 top-0"}
            style={{ transform: `translateY(${virtual.start - margin}px)`, paddingBottom: GAP }}
          >
            {render(item, flags)}
          </div>
        );
      })}
      {reorder ? (
        <div
          ref={indicatorRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-1 top-0 z-30 h-0.5 rounded-full bg-amethyst opacity-0 shadow-[0_0_10px_rgb(var(--accent-rgb)/0.7)] before:absolute before:-top-[3px] before:-left-1 before:size-2 before:rounded-full before:bg-amethyst"
        />
      ) : null}
    </div>
  );
}
