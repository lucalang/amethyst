"use client";

import { useEffect, useRef, useState } from "react";
import { useMotionLevel, webglAvailable } from "@/components/showcase/motion";
import type { ProfileStyleId } from "@/lib/profile-styles";

/** A short glass-shatter reveal over the showcase, once per profile per session and only at full motion. Never blocks input. */
export function ShowcaseOpening({ memberId, style }: { memberId: string; style: ProfileStyleId }) {
  const motion = useMotionLevel();
  const hostRef = useRef<HTMLDivElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const key = `archive:profile:opening:${memberId}`;
    if (motion !== "full" || !host || !host.clientWidth || !webglAvailable()) return;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    let cancelled = false;
    const skip = () => stopRef.current?.();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && skip();
    import("./opening-scene")
      .then(({ playOpening }) => {
        if (cancelled) return;
        const box = host.getBoundingClientRect();
        const portrait = host.parentElement?.querySelector(".pf-portrait")?.getBoundingClientRect();
        const origin = portrait ? { x: portrait.left + portrait.width / 2 - box.left, y: portrait.top + portrait.height / 2 - box.top } : { x: box.width / 2, y: box.height / 3 };
        stopRef.current = playOpening(host, {
          style,
          origin,
          onDone: () => {
            stopRef.current = null;
            setPlaying(false);
          },
        });
        setPlaying(true);
        window.addEventListener("keydown", onKey);
        window.addEventListener("wheel", skip, { passive: true });
        window.addEventListener("pointerdown", skip);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("pointerdown", skip);
      skip();
    };
    // Plays at most once per mount; later style changes don't replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, motion]);

  return (
    <div ref={hostRef} className="pf-opening" data-playing={playing || undefined}>
      {playing ? (
        <button type="button" className="pf-skip" onClick={() => stopRef.current?.()}>
          Skip intro
        </button>
      ) : null}
    </div>
  );
}
