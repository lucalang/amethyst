"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { GalleryHorizontalEnd } from "lucide-react";
import { useSettings } from "@/components/layout/settings-context";
import { useLibrary } from "@/components/media/library-view";
import { Button } from "@/components/ui/button";
import { artworkSrc } from "@/lib/attachments";
import { apiFetch } from "@/lib/api-client";
import { ArtworkViewer } from "./artwork-viewer";
import { useMotionLevel } from "./motion";
import { ShowcaseContext, useShowcase, type ArtworkItem, type ShowcaseApi } from "./showcase-context";
import { ShowcaseGallery } from "./showcase-gallery";

/** Header action that opens the collection's Showcase. */
export function ShowcaseButton({ className }: { className?: string }) {
  const showcase = useShowcase();
  if (!showcase) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={(event) => showcase.openShowcase(event.currentTarget)}
      title="Showcase: view this collection’s artwork full screen"
      aria-label="Showcase"
    >
      <GalleryHorizontalEnd aria-hidden />
      <span className="hidden sm:inline">Showcase</span>
    </Button>
  );
}
/** Overlays are mounted into the app shell so they inherit its theme and motion attributes. */
function overlayHost(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-app-theme]") ?? document.body;
}

function restoreFocus(element: HTMLElement | null | undefined) {
  if (element?.isConnected) element.focus({ preventScroll: true });
}

/**
 * Private, full-viewport views of one collection's current (filtered and sorted) results:
 * the Showcase gallery and the artwork viewer. The library stays mounted underneath, so
 * closing them returns to the same filters and scroll position.
 */
export function ShowcaseProvider({ name, icon, children }: { name: string; icon: ReactNode; children: ReactNode }) {
  const { visible, total } = useLibrary();
  const { artworkFrame } = useSettings();
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const motion = useMotionLevel();
  const showcaseOpener = useRef<HTMLElement | null>(null);
  const viewerOpener = useRef<HTMLElement | null>(null);

  const items = useMemo<ArtworkItem[]>(
    () =>
      visible.flatMap((entry) =>
        entry.coverUrl && artworkSrc(entry.coverUrl) ? [{ id: entry.id, title: entry.title, coverUrl: entry.coverUrl, coverShape: entry.coverShape }] : [],
      ),
    [visible],
  );
  const index = viewing ? items.findIndex((item) => item.id === viewing) : -1;
  // The entry left the results (deleted elsewhere, or filters changed): close the viewer.
  if (viewing && index === -1) setViewing(null);
  const open = showcaseOpen || index !== -1;

  function closeViewer() {
    if (leaving) return;
    const last = viewing;
    const finish = () => {
      setLeaving(false);
      setViewing(null);
      requestAnimationFrame(() => {
        const inGallery = last ? document.querySelector<HTMLElement>(`[data-showcase-entry="${CSS.escape(last)}"]`) : null;
        if (inGallery) {
          inGallery.focus({ preventScroll: true });
          inGallery.scrollIntoView({ block: "nearest" });
        } else restoreFocus(viewerOpener.current);
      });
    };
    if (motion === "off") return finish();
    // A short exit: the card recedes while the viewer fades (see .artwork-viewer[data-leaving]).
    setLeaving(true);
    window.setTimeout(finish, 200);
  }

  function closeShowcase() {
    setLeaving(false);
    setViewing(null);
    setShowcaseOpen(false);
    requestAnimationFrame(() => restoreFocus(showcaseOpener.current));
  }

  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    if (index !== -1) closeViewer();
    else closeShowcase();
  });

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    // Everything else in the shell is inert while an overlay is open, so focus stays inside it.
    const madeInert: HTMLElement[] = [];
    for (const child of Array.from(overlayHost().children)) {
      if (child instanceof HTMLElement && !child.hasAttribute("data-immersive") && !child.inert) {
        child.inert = true;
        madeInert.push(child);
      }
    }
    const listener = (event: KeyboardEvent) => onEscape(event);
    window.addEventListener("keydown", listener);
    return () => {
      root.style.overflow = overflow;
      for (const element of madeInert) element.inert = false;
      window.removeEventListener("keydown", listener);
    };
  }, [open]);

  const api: ShowcaseApi = {
    count: items.length,
    openShowcase: (opener) => {
      showcaseOpener.current = opener ?? (document.activeElement as HTMLElement | null);
      setShowcaseOpen(true);
      void apiFetch("/api/achievements/events", { method: "POST", json: { type: "gallery_open" }, keepalive: true }).catch(() => {});
    },
    viewArtwork: (entryId, opener) => {
      viewerOpener.current = opener ?? (document.activeElement as HTMLElement | null);
      setViewing(entryId);
    },
  };

  return (
    <ShowcaseContext value={api}>
      {children}
      {open
        ? createPortal(
            <>
              {showcaseOpen ? (
                <ShowcaseGallery
                  name={name}
                  icon={icon}
                  items={items}
                  filtered={visible.length < total}
                  withoutArtwork={visible.length - items.length}
                  frame={artworkFrame}
                  covered={index !== -1}
                  onView={(id, opener) => api.viewArtwork(id, opener)}
                  onExit={closeShowcase}
                />
              ) : null}
              {index !== -1 ? (
                <ArtworkViewer
                  items={items}
                  index={index}
                  frame={artworkFrame}
                  leaving={leaving}
                  onIndex={(next) => setViewing(items[next]?.id ?? null)}
                  onClose={closeViewer}
                  onManualRotate={() => void apiFetch("/api/achievements/events", { method: "POST", json: { type: "manual_rotation" }, keepalive: true }).catch(() => {})}
                />
              ) : null}
            </>,
            overlayHost(),
          )
        : null}
    </ShowcaseContext>
  );
}
