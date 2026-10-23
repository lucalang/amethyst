"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import type { ArtworkFrameId } from "@/lib/frames";
import { cn } from "@/lib/utils";

/**
 * Artwork with an optional decorative frame drawn around (never over) its edges.
 * The decoration ignores pointer events, so it can't block clicks or controls.
 * Styles: `.art-frame` in globals.css. Width must come from the layout (it is a size container).
 */
export function ArtworkFrame({
  frame,
  className,
  style,
  children,
}: {
  frame: ArtworkFrameId;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div data-frame={frame} className={cn("art-frame", className)} style={style}>
      {children}
      {frame === "none" ? null : <FrameDecoration frame={frame} />}
    </div>
  );
}

function FrameDecoration({ frame }: { frame: Exclude<ArtworkFrameId, "none"> }) {
  const id = useId();
  return (
    <span aria-hidden className="art-frame-deco">
      {frame === "holo" || frame === "aurora" ? (
        <span className="art-frame-glow">
          <span className="art-frame-ring" />
        </span>
      ) : null}
      <span className="art-frame-ring" />
      {frame === "aurora" ? <span className="art-frame-ring art-frame-trace" /> : null}
      {frame === "gilt" ? (
        <>
          <span className="art-frame-stud" data-corner="tl" />
          <span className="art-frame-stud" data-corner="tr" />
          <span className="art-frame-stud" data-corner="bl" />
          <span className="art-frame-stud" data-corner="br" />
        </>
      ) : null}
      {frame === "amethyst" ? <AmethystOrnaments id={id} /> : null}
    </span>
  );
}

function AmethystOrnaments({ id }: { id: string }) {
  const stroke = `${id}-stroke`;
  const gem = `${id}-gem`;
  const corner = (
    <>
      <path d="M2.5 31C1.5 12 12 1.5 31 2.5" />
      <path d="M2.5 31c-.2 3 2.6 4.6 4.6 2.6 1.4-1.4.2-3.4-1.4-2.8" />
      <path d="M31 2.5c3-.2 4.6 2.6 2.6 4.6-1.4 1.4-3.4.2-2.8-1.4" />
      <path d="M15 5.2c2.4-2.6 6-2.8 8.6-.6" />
      <path d="M5.2 15c-2.6 2.4-2.8 6-.6 8.6" />
      <polygon points="5,0.8 9.2,5 5,9.2 0.8,5" fill={`url(#${gem})`} stroke="none" />
      <path d="M5 1.6v6.8M1.6 5h6.8" stroke="#fff" strokeOpacity="0.4" strokeWidth="0.5" />
    </>
  );
  return (
    <>
      <svg className="art-frame-defs" width="0" height="0" focusable="false">
        <defs>
          <linearGradient id={stroke} x1="0" y1="40" x2="40" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7c3aed" />
            <stop offset="0.5" stopColor="#e9d5ff" />
            <stop offset="1" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id={gem} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f5e8ff" />
            <stop offset="0.45" stopColor="#b77cff" />
            <stop offset="1" stopColor="#5b21b6" />
          </linearGradient>
        </defs>
      </svg>
      {(["tl", "tr", "bl", "br"] as const).map((position) => (
        <svg key={position} className="art-frame-corner" data-corner={position} viewBox="0 0 40 40" fill="none" stroke={`url(#${stroke})`} strokeWidth="1.4" strokeLinecap="round" focusable="false">
          {corner}
        </svg>
      ))}
      <svg className="art-frame-crest" viewBox="0 0 40 20" fill="none" stroke={`url(#${stroke})`} strokeWidth="1.2" strokeLinecap="round" focusable="false">
        <path d="M13 13C9 13 5.5 11 2.5 7.5M27 13c4 0 7.5-2 10.5-5.5" />
        <circle cx="4.5" cy="12.5" r="1" fill="#d8b4fe" stroke="none" />
        <circle cx="35.5" cy="12.5" r="1" fill="#d8b4fe" stroke="none" />
        <polygon points="20,1 27,9 20,19 13,9" fill={`url(#${gem})`} stroke="#f3e8ff" strokeOpacity="0.6" strokeWidth="0.6" />
        <path d="M13 9h14M20 1l-3 8 3 10 3-10z" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.5" />
      </svg>
    </>
  );
}
