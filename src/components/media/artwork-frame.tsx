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
      {frame === "holo" || frame === "aurora" || frame === "neon-marquee" || frame === "celestial-prism" ? (
        <span className="art-frame-glow">
          <span className="art-frame-ring" />
        </span>
      ) : null}
      <span className="art-frame-ring" />
      {frame === "aurora" || frame === "celestial-prism" ? <span className="art-frame-ring art-frame-trace" /> : null}
      {frame === "gilt" ? (
        <>
          <span className="art-frame-stud" data-corner="tl" />
          <span className="art-frame-stud" data-corner="tr" />
          <span className="art-frame-stud" data-corner="bl" />
          <span className="art-frame-stud" data-corner="br" />
        </>
      ) : null}
      {frame === "amethyst" ? <AmethystOrnaments id={id} /> : null}
      {frame === "pixel-quest" ? <PixelOrnaments /> : null}
      {frame === "constellation" ? <ConstellationOrnaments /> : null}
      {frame === "obsidian-relic" ? <ObsidianRelicOrnaments id={id} /> : null}
      {frame === "celestial-prism" ? <CelestialPrismOrnaments /> : null}
    </span>
  );
}

const CORNERS = ["tl", "tr", "bl", "br"] as const;

/** Gold pixel brackets in the corners and a pixel coin on top; crisp edges keep it 8-bit at any size. */
function PixelOrnaments() {
  const coin = ["..###..", ".#####.", "##+####", "##+####", "#######", ".#####.", "..###.."];
  return (
    <>
      {CORNERS.map((position) => (
        <svg key={position} className="art-frame-corner" data-corner={position} viewBox="0 0 8 8" shapeRendering="crispEdges" focusable="false">
          <path d="M1 1h4v1H2v3H1z" fill="#fbbf24" />
          <path d="M1 1h1v1H1z" fill="#fffbeb" />
          <path d="M0 0h6v1H1v5H0z" fill="#1e1037" />
        </svg>
      ))}
      <svg className="art-frame-crest" viewBox="-6.5 -1 20 10" shapeRendering="crispEdges" focusable="false">
        <rect x="-1" y="-1" width="9" height="9" fill="#1e1037" />
        {coin.flatMap((row, y) =>
          [...row].map((cell, x) => (cell === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={cell === "+" ? "#fffbeb" : "#f59e0b"} />)),
        )}
      </svg>
    </>
  );
}

/** Four-point gold stars on the corners, one joined to a faint constellation along the top edge. */
function ConstellationOrnaments() {
  const star = "M10 2 L11.4 8.6 L18 10 L11.4 11.4 L10 18 L8.6 11.4 L2 10 L8.6 8.6Z";
  return (
    <>
      {CORNERS.map((position) => (
        <svg key={position} className="art-frame-corner" data-corner={position} viewBox="0 0 40 40" focusable="false">
          <path d={star} fill="#fde68a" transform="translate(-1 -1)" />
          <path d="M9 9 L24 3.5 L34 6" fill="none" stroke="#e0e7ff" strokeOpacity="0.45" strokeWidth="0.7" />
          <circle cx="24" cy="3.5" r="1.2" fill="#e0e7ff" />
          <circle cx="34" cy="6" r="0.9" fill="#fde68a" />
        </svg>
      ))}
    </>
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

function ObsidianRelicOrnaments({ id }: { id: string }) {
  const gold = `${id}-relic-gold`;
  const gem = `${id}-relic-gem`;
  return (
    <>
      <svg className="art-frame-defs" width="0" height="0" focusable="false">
        <defs>
          <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff7d6" />
            <stop offset="0.5" stopColor="#e8b84a" />
            <stop offset="1" stopColor="#92400e" />
          </linearGradient>
          <linearGradient id={gem} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f5d0fe" />
            <stop offset="0.5" stopColor="#9333ea" />
            <stop offset="1" stopColor="#3b0764" />
          </linearGradient>
        </defs>
      </svg>
      {CORNERS.map((position) => (
        <svg key={position} className="art-frame-corner" data-corner={position} viewBox="0 0 40 40" fill="none" focusable="false">
          <path d="M2 24 L2 6 L6 2 L24 2" stroke={`url(#${gold})`} strokeWidth="1.8" strokeLinecap="square" />
          <polygon points="6,1.5 10.5,6 6,10.5 1.5,6" fill={`url(#${gem})`} stroke={`url(#${gold})`} strokeWidth="0.9" />
        </svg>
      ))}
      <svg className="art-frame-crest" viewBox="0 0 44 20" fill="none" focusable="false">
        <path d="M4 12 L14 12 L18 6 M40 12 L30 12 L26 6" stroke={`url(#${gold})`} strokeWidth="1.3" strokeLinecap="round" />
        <polygon points="22,1 29,10 22,19 15,10" fill={`url(#${gem})`} stroke={`url(#${gold})`} strokeWidth="1" />
        <polygon points="22,4.2 26,10 22,15.8 18,10" fill="#f5d0fe" fillOpacity="0.35" />
      </svg>
    </>
  );
}

function CelestialPrismOrnaments() {
  return (
    <>
      {CORNERS.map((position) => (
        <svg key={position} className="art-frame-corner" data-corner={position} viewBox="0 0 40 40" fill="none" focusable="false">
          <circle cx="8" cy="8" r="5.5" stroke="#a5f3fc" strokeOpacity="0.7" strokeWidth="0.9" />
          <path d="M8 0.5 L9.4 6.6 L15.5 8 L9.4 9.4 L8 15.5 L6.6 9.4 L0.5 8 L6.6 6.6 Z" fill="#e0f2fe" />
          <path d="M8 8 L26 3 M8 8 L3 26" stroke="#c4b5fd" strokeOpacity="0.6" strokeWidth="0.8" />
        </svg>
      ))}
    </>
  );
}
