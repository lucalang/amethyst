"use client";

import { useId, useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { FrameLookId } from "@/lib/frames";
import { cn } from "@/lib/utils";
import { FRAME_MOTIFS, FRAME_MOULDINGS, MOTIF_SCALE, type FrameMoulding, type MotifLayer, type MotifPiece, type MotifPlace } from "./frame-motifs";

/**
 * Artwork with an optional decorative frame drawn around its edges (some pieces reach over the art).
 * The decoration ignores pointer events, so it can't block clicks or controls.
 * Styles: `.art-frame` in globals.css. Width must come from the layout (it is a size container).
 */
export function ArtworkFrame({
  frame,
  className,
  style,
  children,
}: {
  frame: FrameLookId;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Sculpted frames lean toward a hovering mouse (see .art-frame[data-depth]).
  const depth = frame !== "none" && FRAME_MOTIFS[frame] ? true : undefined;
  const lean = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || event.pointerType !== "mouse") return;
    const box = el.getBoundingClientRect();
    el.style.setProperty("--px", (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(3));
    el.style.setProperty("--py", (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(3));
  };
  const rest = () => {
    ref.current?.style.removeProperty("--px");
    ref.current?.style.removeProperty("--py");
  };
  return (
    <div
      ref={ref}
      data-frame={frame}
      data-depth={depth}
      className={cn("art-frame", className)}
      style={style}
      onPointerMove={depth ? lean : undefined}
      onPointerLeave={depth ? rest : undefined}
    >
      {children}
      {frame === "none" ? null : <FrameDecoration frame={frame} />}
    </div>
  );
}

function FrameDecoration({ frame }: { frame: Exclude<FrameLookId, "none"> }) {
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
      {frame === "seraph-wings" ? <SeraphOrnaments id={id} /> : null}
      {frame === "spider-lily" ? <SpiderLilyOrnaments id={id} /> : null}
      {FRAME_MOULDINGS[frame] ? <MotifMoulding frame={frame} moulding={FRAME_MOULDINGS[frame]} /> : null}
      {FRAME_MOTIFS[frame] ? <MotifOrnaments id={id} pieces={FRAME_MOTIFS[frame]} /> : null}
    </span>
  );
}

const unit = (value: number) => `calc(var(--fw) * ${value / 5})`;

/** One trim tile as an SVG data URL; `vertical` turns it to run down the side rails. */
function trimTile(layers: readonly MotifLayer[], tile: number, vertical: boolean) {
  const defs: string[] = [];
  const body = layers.map((layer, l) => {
    let paint = layer.paint as string;
    if (typeof layer.paint !== "string") {
      defs.push(`<linearGradient id="t${l}" x1="0" y1="0" x2="${tile}" y2="5" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${layer.paint[0]}"/><stop offset="1" stop-color="${layer.paint[1]}"/></linearGradient>`);
      paint = `url(#t${l})`;
    }
    const shape = layer.line ? `fill="none" stroke="${paint}" stroke-width="${layer.line}" stroke-linecap="round" stroke-linejoin="round"` : `fill="${paint}"`;
    return (layer.copies ?? [null]).map((transform) => `<path d="${layer.d}" ${shape}${transform ? ` transform="${transform}"` : ""}/>`).join("");
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vertical ? `5 ${tile}` : `${tile} 5`}" preserveAspectRatio="none"><defs>${defs.join("")}</defs><g${vertical ? ' transform="matrix(0 1 1 0 0 0)"' : ""}>${body.join("")}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
const tiles = new Map<string, [string, string]>();

/** Repeating trim down each rail (rotated for the far sides), then the sculpted rails over it. */
function MotifMoulding({ frame, moulding: { trim, rails } }: { frame: string; moulding: FrameMoulding }) {
  let images = tiles.get(frame);
  if (trim && !images) {
    images = [trimTile(trim.layers, trim.tile, false), trimTile(trim.layers, trim.tile, true)];
    tiles.set(frame, images);
  }
  return (
    <>
      {trim && images
        ? (["top", "bottom", "left", "right"] as const).map((side) => {
            const across = side === "top" || side === "bottom";
            const style: CSSProperties = across
              ? { left: unit(trim.skip), right: unit(trim.skip), height: unit(5), [side]: 0, backgroundImage: images[0], backgroundSize: `${unit(trim.tile)} 100%`, backgroundRepeat: "round no-repeat" }
              : { top: unit(trim.skip), bottom: unit(trim.skip), width: unit(5), [side]: 0, backgroundImage: images[1], backgroundSize: `100% ${unit(trim.tile)}`, backgroundRepeat: "no-repeat round" };
            if (side === "bottom" || side === "right") style.rotate = "180deg";
            return <span key={side} className="art-frame-trim" style={style} />;
          })
        : null}
      {rails?.map((rail, i) => {
        const [a, b] = typeof rail.paint === "string" ? [rail.paint, rail.paint] : rail.paint;
        const edge = rail.at - rail.width / 2;
        return (
          <span
            key={i}
            className="art-frame-rail"
            data-finish={rail.finish}
            style={{ inset: unit(edge), borderWidth: unit(rail.width), borderColor: `${a} ${b} ${b} ${a}`, borderRadius: `calc(var(--fr) + ${unit(5 - edge)})`, color: b }}
          />
        );
      })}
    </>
  );
}

/** Places a piece so its origin lands on the card's outer corner (mirrored per corner) or edge centre. */
function motifStyle(piece: MotifPiece, place: MotifPlace): CSSProperties {
  const [w, h] = piece.box;
  const [ox, oy] = piece.origin;
  const unit = (value: number) => `calc(var(--fw) * ${(value * MOTIF_SCALE * (piece.scale ?? 1)) / 5})`;
  const style: CSSProperties & Record<`--${string}`, number> = { width: unit(w), height: unit(h), "--rise": piece.rise ?? 0 };
  const x = place === "tr" || place === "br" ? -1 : 1;
  const y = place === "bl" || place === "br" ? -1 : 1;
  if (place === "top" || place === "bottom") {
    style.left = `calc(50% - ${unit(ox)})`;
    style.top = place === "top" ? unit(-oy) : `calc(100% - ${unit(oy)})`;
    return style;
  }
  style[x === 1 ? "left" : "right"] = unit(-ox);
  style[y === 1 ? "top" : "bottom"] = unit(-oy);
  // The shadow is drawn before the mirroring, so its offset is mirrored back.
  style["--mx"] = x;
  style["--my"] = y;
  if (x !== 1 || y !== 1) style.scale = `${x} ${y}`;
  return style;
}

/** Blends a #rrggbb colour toward white (`to` 255) or black (0). */
const shade = (hex: string, to: number, t: number) =>
  `#${[1, 3, 5].map((i) => Math.round(Number.parseInt(hex.slice(i, i + 2), 16) * (1 - t) + to * t).toString(16).padStart(2, "0")).join("")}`;

/** Gradient stops for a layer: metal gets a bright band across the middle so it reads as polished. */
function motifStops(layer: MotifLayer): [offset: number, colour: string][] | null {
  const [a, b] = typeof layer.paint === "string" ? [layer.paint, layer.paint] : layer.paint;
  if (layer.finish === "metal") return [[0, shade(a, 255, 0.25)], [0.42, b], [0.52, shade(a, 255, 0.5)], [0.62, a], [1, shade(b, 0, 0.2)]];
  return a === b ? null : [[0, a], [1, b]];
}

function MotifOrnaments({ id, pieces }: { id: string; pieces: readonly MotifPiece[] }) {
  return pieces.flatMap((piece, p) => {
    const [w, h] = piece.box;
    const art = piece.layers.map((layer, l) => {
      const stops = motifStops(layer);
      const gradient = stops ? `${id}-m${p}-${l}` : null;
      const dark = typeof layer.paint === "string" ? layer.paint : layer.paint[1];
      const paint = gradient ? `url(#${gradient})` : dark;
      const shape = layer.line ? { fill: "none", stroke: paint, strokeWidth: layer.line, strokeLinecap: "round" as const, strokeLinejoin: "round" as const } : { fill: paint };
      // Filled shapes get a fine ink line in a deep shade of their own colour unless they set one.
      const outline = layer.outline ?? (layer.line || layer.finish === "glow" ? null : ([shade(dark, 0, 0.6), 0.16] as const));
      const ink = outline
        ? { fill: layer.line ? "none" : outline[0], stroke: outline[0], strokeWidth: (layer.line ?? 0) + outline[1] * 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
        : null;
      return (
        <g key={l} opacity={layer.opacity} data-glow={layer.finish === "glow" ? "" : undefined} color={layer.finish === "glow" ? dark : undefined}>
          {gradient && stops ? (
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2={w} y2={h} gradientUnits="userSpaceOnUse">
                {stops.map(([offset, colour]) => (
                  <stop key={offset} offset={offset} stopColor={colour} />
                ))}
              </linearGradient>
            </defs>
          ) : null}
          {(layer.copies ?? [undefined]).flatMap((transform, c) => [
            ink ? <path key={`o${c}`} d={layer.d} transform={transform} {...ink} /> : null,
            <path key={c} d={layer.d} transform={transform} {...shape} />,
          ])}
        </g>
      );
    });
    return piece.at.map((place) => (
      <svg key={`${p}-${place}`} className="art-frame-motif" viewBox={`0 0 ${w} ${h}`} style={motifStyle(piece, place)} focusable="false">
        {art}
      </svg>
    ));
  });
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

/** Lily stamens from the bloom centre (8.7, 8.7): three sweep along the top rail, three down the side, one outward. */
const LILY_STAMENS = [
  "C18 1 30 3 46 7.4",
  "C17 4.5 26 6.5 36 10.6",
  "C16 -2 24 -4 31 1.2",
  "C1 18 3 30 7.4 46",
  "C4.5 17 6.5 26 10.6 36",
  "C-2 16 -4 24 1.2 31",
  "C5 3 1 0 -3 -3",
];
const stamenEnd = (path: string) => path.split(" ").slice(-2).map(Number);

function SpiderLilyOrnaments({ id }: { id: string }) {
  const petal = `${id}-lily-petal`;
  return (
    <>
      <svg className="art-frame-defs" width="0" height="0" focusable="false">
        <defs>
          <linearGradient id={petal} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#6e0614" />
            <stop offset="0.45" stopColor="#d0182f" />
            <stop offset="1" stopColor="#ff5a63" />
          </linearGradient>
        </defs>
      </svg>
      {(["tl", "br"] as const).map((corner) => (
        <svg key={corner} className="art-frame-bloom" data-corner={corner} viewBox="0 0 60 60" focusable="false">
          {LILY_STAMENS.map((path) => {
            const [x, y] = stamenEnd(path);
            return (
              <g key={path}>
                <path d={`M8.7 8.7${path}`} fill="none" stroke="#e8283a" strokeWidth="0.55" strokeLinecap="round" />
                <ellipse cx={x} cy={y} rx="1.1" ry="0.6" fill="#f6d7c3" />
              </g>
            );
          })}
          {[15, 75, 135, 195, 255, 315].map((angle) => (
            <path
              key={angle}
              d="M0 0C3 2.2 7.5 1.9 10.4 0.5Q11.6-.2 10.6-1.1C11 0 9 0 7.5-.9C5-2 2.5-1.6 0 0Z"
              transform={`translate(8.7 8.7) rotate(${angle}) scale(1.55)`}
              fill={`url(#${petal})`}
              stroke="#3b0209"
              strokeOpacity="0.5"
              strokeWidth="0.3"
            />
          ))}
          <circle cx="8.7" cy="8.7" r="1.9" fill="#4a0410" />
        </svg>
      ))}
      {(["tr", "bl"] as const).map((corner) => (
        <svg key={corner} className="art-frame-stitch" data-corner={corner} viewBox="0 0 40 40" fill="none" strokeLinecap="round" focusable="false">
          {[10, 16, 22].flatMap((at) => [
            [at, 2.65],
            [2.65, at],
          ]).map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <path d={`M${x - 2.2} ${y - 2.2}L${x + 2.2} ${y + 2.2}M${x + 2.2} ${y - 2.2}L${x - 2.2} ${y + 2.2}`} stroke="#000" strokeOpacity="0.6" strokeWidth="1.6" />
              <path d={`M${x - 2.2} ${y - 2.2}L${x + 2.2} ${y + 2.2}M${x + 2.2} ${y - 2.2}L${x - 2.2} ${y + 2.2}`} stroke="#efe6dc" strokeWidth="0.9" />
            </g>
          ))}
        </svg>
      ))}
    </>
  );
}

/** Feathers as [angle°, length] fanning from the wing root; the same tiers as the 3D build. */
const SERAPH_TIERS: { width: number; fill: string; feathers: [number, number][] }[] = [
  { width: 8.4, fill: "#efe4d0", feathers: [[6, 29], [16, 38], [26, 46], [36, 49], [46, 48], [56, 43], [66, 36], [76, 28]] },
  { width: 9, fill: "#f7f0e2", feathers: [[12, 24], [26, 30], [40, 32], [54, 30], [68, 23]] },
  { width: 9, fill: "#fffaf0", feathers: [[18, 13], [38, 16], [58, 13]] },
];
const featherPath = (l: number, w: number) =>
  `M0 0C${0.15 * l} ${-0.55 * w} ${0.62 * l} ${-0.62 * w} ${l} ${-0.1 * w}C${0.86 * l} ${0.2 * w} ${0.56 * l} ${0.48 * w} ${0.26 * l} ${0.4 * w}Q${0.05 * l} ${0.26 * w} 0 0Z`;

function SeraphOrnaments({ id }: { id: string }) {
  const gold = `${id}-seraph-gold`;
  return (
    <>
      <svg className="art-frame-defs" width="0" height="0" focusable="false">
        <defs>
          <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff4d6" />
            <stop offset="0.5" stopColor="#e3bd72" />
            <stop offset="1" stopColor="#8a6424" />
          </linearGradient>
        </defs>
      </svg>
      {(["l", "r"] as const).map((side) => (
        <svg key={side} className="art-frame-wing" data-side={side} viewBox="0 0 56 56" focusable="false">
          {SERAPH_TIERS.map((tier, t) =>
            tier.feathers.map(([angle, length]) => (
              <path
                key={`${t}-${angle}`}
                d={featherPath(length, tier.width)}
                transform={`translate(5 51) rotate(${-angle})`}
                fill={tier.fill}
                stroke="#b08a45"
                strokeOpacity="0.55"
                strokeWidth="0.5"
              />
            )),
          )}
          <circle cx="5" cy="50" r="2.6" fill="#fffaf0" stroke={`url(#${gold})`} strokeWidth="1.3" />
        </svg>
      ))}
      <svg className="art-frame-crest" viewBox="0 0 44 26" fill="none" focusable="false">
        <path d="M22 26V20.5" stroke={`url(#${gold})`} strokeWidth="1.2" strokeLinecap="round" />
        <ellipse cx="22" cy="14" rx="18" ry="6.5" stroke={`url(#${gold})`} strokeWidth="2" />
        <path d="M22 6.5 L23.9 12.1 L29.5 14 L23.9 15.9 L22 21.5 L20.1 15.9 L14.5 14 L20.1 12.1Z" fill="#fff1cc" stroke="#e3bd72" strokeWidth="0.5" />
      </svg>
      <span className="art-frame-pearl" data-corner="bl" />
      <span className="art-frame-pearl" data-corner="br" />
    </>
  );
}
