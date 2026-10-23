"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ImageOff } from "lucide-react";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import type { ArtworkFrameId } from "@/lib/frames";
import { cn } from "@/lib/utils";
import type { ArtworkItem } from "./showcase-context";

type Point = { x: number; y: number };
type Gesture =
  | { kind: "pan"; start: Point; pan: Point; moved: boolean }
  | { kind: "swipe"; start: Point; moved: boolean }
  | { kind: "pinch"; distance: number; zoom: number };

const SWIPE = 60;

/** Space kept clear for the viewer's toolbars. */
function padding(width: number) {
  return width < 640 ? { x: 16, top: 84, bottom: 96 } : { x: 104, top: 96, bottom: 112 };
}

/** The artwork fitted to the screen as a flat image, with pan, pinch, wheel and double-click zoom. */
export function FlatArtwork({
  item,
  src,
  frame,
  zoom,
  maxZoom,
  resetKey,
  interactive,
  onZoom,
  onSwipe,
}: {
  item: ArtworkItem;
  src: string;
  frame: ArtworkFrameId;
  zoom: number;
  maxZoom: number;
  resetKey: number;
  interactive: boolean;
  onZoom: (zoom: number) => void;
  onSwipe: (direction: -1 | 1) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);

  // Zoom changed from the toolbar, or the view was reset: keep the same centre, or recentre.
  const [shown, setShown] = useState({ zoom, resetKey });
  if (shown.zoom !== zoom || shown.resetKey !== resetKey) {
    setShown({ zoom, resetKey });
    if (shown.resetKey !== resetKey || zoom <= 1) setPan({ x: 0, y: 0 });
    else setPan((current) => ({ x: (current.x * zoom) / shown.zoom, y: (current.y * zoom) / shown.zoom }));
  }

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setStage({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ratio = natural && natural.w > 0 && natural.h > 0 ? natural.w / natural.h : item.coverShape === "square" ? 1 : 2 / 3;
  let width = 0;
  let height = 0;
  let offsetY = 0;
  if (stage) {
    const pad = padding(stage.w);
    const room = { w: Math.max(stage.w - pad.x * 2, 96), h: Math.max(stage.h - pad.top - pad.bottom, 96) };
    width = room.w;
    height = width / ratio;
    if (height > room.h) {
      height = room.h;
      width = height * ratio;
    }
    // Don't blow small images up past the point where they turn soft.
    if (natural && natural.w > 0) {
      const cap = Math.max(natural.w * 1.5, Math.min(room.w, 360)) / width;
      if (cap < 1) {
        width *= cap;
        height *= cap;
      }
    }
    offsetY = (pad.top - pad.bottom) / 2;
  }

  function clampPan(next: Point, scale = zoom): Point {
    if (!stage) return next;
    const limitX = Math.max(0, (width * scale - stage.w) / 2 + 48);
    const limitY = Math.max(0, (height * scale - stage.h) / 2 + 48);
    return { x: Math.min(limitX, Math.max(-limitX, next.x)), y: Math.min(limitY, Math.max(-limitY, next.y)) };
  }

  /** Zoom keeping the point under `focus` (stage coordinates) in place. */
  function zoomAt(next: number, focus?: Point) {
    const target = Math.min(maxZoom, Math.max(1, next));
    if (target === zoom) return;
    if (target <= 1) {
      setPan({ x: 0, y: 0 });
    } else if (focus && stage) {
      const fx = focus.x - stage.w / 2;
      const fy = focus.y - stage.h / 2 - offsetY;
      const ratio = target / zoom;
      setPan(clampPan({ x: fx - (fx - pan.x) * ratio, y: fy - (fy - pan.y) * ratio }, target));
    }
    setShown({ zoom: Math.round(target * 100) / 100, resetKey });
    onZoom(target);
  }

  function local(event: { clientX: number; clientY: number }): Point {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function distance() {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function begin(point: Point) {
    gesture.current = zoom > 1 ? { kind: "pan", start: point, pan, moved: false } : { kind: "swipe", start: point, moved: false };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactive || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, local(event));
    if (pointers.current.size === 2) gesture.current = { kind: "pinch", distance: distance(), zoom };
    else if (pointers.current.size === 1) begin(local(event));
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    const current = gesture.current;
    if (!current) return;
    if (current.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (current.distance > 0) zoomAt(current.zoom * (distance() / current.distance), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      return;
    }
    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    if (!current.moved && Math.hypot(dx, dy) < 4) return;
    current.moved = true;
    setDragging(true);
    if (current.kind === "pan") setPan(clampPan({ x: current.pan.x + dx, y: current.pan.y + dy }));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointers.current.get(event.pointerId);
    if (!start) return;
    const current = gesture.current;
    pointers.current.delete(event.pointerId);
    if (current?.kind === "swipe" && current.moved && event.type === "pointerup") {
      const point = local(event);
      const dx = point.x - current.start.x;
      const dy = point.y - current.start.y;
      if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.3) onSwipe(dx < 0 ? 1 : -1);
    }
    const remaining = [...pointers.current.values()];
    if (remaining.length === 1) begin(remaining[0]);
    else if (remaining.length === 0) {
      gesture.current = null;
      setDragging(false);
    }
  }

  const onWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    zoomAt(zoom * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), local(event));
  });

  useEffect(() => {
    const element = stageRef.current;
    if (!element || !interactive) return;
    const listener = (event: WheelEvent) => onWheel(event);
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, [interactive]);

  return (
    <div
      ref={stageRef}
      className={cn("absolute inset-0 select-none", interactive && (zoom > 1 ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"))}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(event) => interactive && zoomAt(zoom > 1 ? 1 : 2.5, local(event))}
    >
      {stage ? (
        <div
          className={cn("absolute top-1/2 left-1/2", !dragging && "transition-transform duration-300 ease-out")}
          style={{ width, transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y + offsetY}px) scale(${zoom})` }}
        >
          <ArtworkFrame frame={frame} className="shadow-[0_40px_90px_-40px_rgb(var(--shadow-rgb)/calc(0.95*var(--shadow-alpha)))]">
            <div className="relative overflow-hidden rounded-lg bg-surface" style={{ height }}>
              {failed ? (
                <span className="absolute inset-0 grid place-items-center text-muted-foreground">
                  <span className="flex flex-col items-center gap-2 text-sm">
                    <ImageOff aria-hidden className="size-6" />
                    Artwork couldn’t be loaded
                  </span>
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- full-resolution artwork from the authenticated attachment route
                <img
                  src={src}
                  alt={item.title}
                  draggable={false}
                  decoding="async"
                  onLoad={(event) => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
                  onError={() => setFailed(true)}
                  className="absolute inset-0 size-full object-contain"
                />
              )}
            </div>
          </ArtworkFrame>
        </div>
      ) : null}
    </div>
  );
}
