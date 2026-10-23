"use client";

import { Component, lazy, Suspense, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { Box, ChevronLeft, ChevronRight, LoaderCircle, Maximize, Minimize, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import type { ArtworkFrameId } from "@/lib/frames";
import { artworkSrc } from "@/lib/attachments";
import { cn } from "@/lib/utils";
import { FlatArtwork } from "./flat-artwork";
import { useMotionLevel, webglAvailable } from "./motion";
import type { ArtworkItem } from "./showcase-context";

const ArtworkCard3D = lazy(() => import("./artwork-card-3d"));

type Mode = "3d" | "flat";
const MODE_KEY = "archive:artwork-viewer";
export const MAX_ZOOM = { "3d": 3, flat: 5 } as const;
const ZOOM_STEP = 1.5;

/** Falls back to the flat viewer if the 3D chunk fails to load or throws. */
class Fallback extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function initialMode(motionOff: boolean): Mode {
  if (!webglAvailable()) return "flat";
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === "3d" || saved === "flat") return saved;
  } catch {}
  return motionOff ? "flat" : "3d";
}

const control =
  "grid size-10 shrink-0 place-items-center rounded-full text-foreground/85 transition-[background-color,color,opacity] outline-none hover:bg-white/[0.09] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[1.15rem]";
const glass = "glass border border-white/[0.09] shadow-[0_12px_40px_-16px_rgb(var(--shadow-rgb)/calc(0.8*var(--shadow-alpha)))]";

/** Full-viewport inspection of one entry's artwork: a 3D card (or a flat view), zoom, browsing and fullscreen. */
export function ArtworkViewer({
  items,
  index,
  frame,
  onIndex,
  onClose,
}: {
  items: ArtworkItem[];
  index: number;
  frame: ArtworkFrameId;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const motion = useMotionLevel();
  const item = items[index];
  const src = artworkSrc(item.coverUrl) ?? "";
  const [mode, setMode] = useState<Mode>(() => initialMode(motion === "off"));
  // Items whose artwork can't be drawn in 3D (e.g. the image host refuses WebGL use) stay flat.
  const [flatOnly, setFlatOnly] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const use3d = mode === "3d" && !flatOnly.has(src);
  const maxZoom = MAX_ZOOM[use3d ? "3d" : "flat"];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    setCanFullscreen(Boolean(document.fullscreenEnabled && rootRef.current?.requestFullscreen));
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Warm the cache for the neighbours only; nothing else loads until it is shown.
  useEffect(() => {
    for (const neighbour of [items[index - 1], items[index + 1]]) {
      const url = neighbour ? artworkSrc(neighbour.coverUrl) : null;
      if (!url) continue;
      const image = new Image();
      image.decoding = "async";
      image.src = url;
    }
  }, [items, index]);

  function go(next: number) {
    if (next < 0 || next >= items.length || next === index) return;
    setZoom(1);
    setResetKey((key) => key + 1);
    onIndex(next);
  }

  function changeZoom(next: number) {
    setZoom(Math.round(Math.min(maxZoom, Math.max(1, next)) * 100) / 100);
  }

  function reset() {
    setZoom(1);
    setResetKey((key) => key + 1);
  }

  function switchMode() {
    const next: Mode = use3d ? "flat" : "3d";
    setMode(next);
    setZoom(1);
    setResetKey((key) => key + 1);
    if (next === "3d") setFlatOnly(new Set());
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {}
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen().catch(() => {});
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (event.key === "ArrowLeft") go(index - 1);
    else if (event.key === "ArrowRight") go(index + 1);
    else if (event.key === "+" || event.key === "=") changeZoom(zoom * ZOOM_STEP);
    else if (event.key === "-" || event.key === "_") changeZoom(zoom / ZOOM_STEP);
    else if (event.key === "0") reset();
    else return;
    event.preventDefault();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const flat = (interactive: boolean) => (
    <FlatArtwork
      key={item.id}
      item={item}
      src={src}
      frame={frame}
      zoom={zoom}
      maxZoom={MAX_ZOOM.flat}
      resetKey={resetKey}
      interactive={interactive}
      onZoom={changeZoom}
      onSwipe={(direction) => go(index + direction)}
    />
  );

  const hint = use3d ? (zoom > 1 ? "Drag to move · pinch or scroll to zoom" : "Drag to turn the card · pinch or scroll to zoom") : zoom > 1 ? "Drag to move" : "Swipe or use the arrows to browse";

  return (
    <div
      ref={rootRef}
      data-immersive
      role="dialog"
      aria-modal="true"
      aria-labelledby="artwork-viewer-title"
      aria-describedby="artwork-viewer-hint"
      className="artwork-viewer fixed inset-0 z-[95] overflow-hidden animate-in duration-200 fade-in-0"
    >
      <div className="artwork-viewer-stage absolute inset-0" role="img" aria-label={`Artwork for ${item.title}`}>
        {use3d ? (
          <Fallback onError={() => setMode("flat")}>
            <Suspense fallback={flat(false)}>
              <ArtworkCard3D
                src={src}
                frame={frame}
                zoom={zoom}
                maxZoom={MAX_ZOOM["3d"]}
                resetKey={resetKey}
                motion={motion}
                onZoom={changeZoom}
                onReady={setReady}
                onFail={(failed) => setFlatOnly((set) => new Set(set).add(failed))}
              />
              {ready !== src ? (
                <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
                  <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
                </span>
              ) : null}
            </Suspense>
          </Fallback>
        ) : (
          flat(true)
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 md:p-5">
        <div className={cn("pointer-events-auto min-w-0 rounded-lg px-3.5 py-2", glass)}>
          <h2 id="artwork-viewer-title" className="truncate text-sm font-semibold md:text-base">
            {item.title}
          </h2>
          <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {index + 1} of {items.length}
          </p>
        </div>
        <div className={cn("pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-full p-1", glass)}>
          {canFullscreen ? (
            <button type="button" className={control} onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={fullscreen ? "Exit full screen" : "Full screen"}>
              {fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
            </button>
          ) : null}
          <button ref={closeRef} type="button" className={control} onClick={onClose} aria-label="Close artwork viewer" title="Close (Esc)">
            <X aria-hidden />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => go(index - 1)}
        disabled={!hasPrev}
        aria-label="Previous artwork"
        title="Previous (←)"
        className={cn(control, glass, "absolute top-1/2 left-4 z-10 hidden size-12 -translate-y-1/2 md:grid lg:left-6")}
      >
        <ChevronLeft aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        disabled={!hasNext}
        aria-label="Next artwork"
        title="Next (→)"
        className={cn(control, glass, "absolute top-1/2 right-4 z-10 hidden size-12 -translate-y-1/2 md:grid lg:right-6")}
      >
        <ChevronRight aria-hidden />
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] md:pb-6">
        <p id="artwork-viewer-hint" className="hidden rounded-full bg-black/40 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur-sm sm:block">
          {hint}
        </p>
        <div className={cn("pointer-events-auto flex max-w-full items-center gap-0.5 rounded-full p-1", glass)}>
          <button type="button" onClick={() => go(index - 1)} disabled={!hasPrev} aria-label="Previous artwork" className={cn(control, "md:hidden")}>
            <ChevronLeft aria-hidden />
          </button>
          <button type="button" onClick={() => changeZoom(zoom / ZOOM_STEP)} disabled={zoom <= 1} aria-label="Zoom out" title="Zoom out (−)" className={control}>
            <ZoomOut aria-hidden />
          </button>
          <span className="w-12 text-center text-xs font-medium text-muted-foreground tabular-nums" aria-live="polite" aria-label={`Zoom ${Math.round(zoom * 100)}%`}>
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" onClick={() => changeZoom(zoom * ZOOM_STEP)} disabled={zoom >= maxZoom} aria-label="Zoom in" title="Zoom in (+)" className={control}>
            <ZoomIn aria-hidden />
          </button>
          <button type="button" onClick={reset} aria-label="Reset view" title="Reset view (0)" className={control}>
            <RotateCcw aria-hidden />
          </button>
          {webglAvailable() ? (
            <>
              <span aria-hidden className="mx-1 h-5 w-px bg-white/[0.12]" />
              <button
                type="button"
                onClick={switchMode}
                aria-pressed={use3d}
                title={use3d ? "Switch to a flat, still view" : "Turn the artwork into a 3D card"}
                className={cn(control, "w-auto gap-1.5 px-3 text-xs font-semibold", use3d && "bg-amethyst/15 text-amethyst hover:bg-amethyst/20 hover:text-amethyst")}
              >
                <Box aria-hidden className="!size-4" />
                3D
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => go(index + 1)} disabled={!hasNext} aria-label="Next artwork" className={cn(control, "md:hidden")}>
            <ChevronRight aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
