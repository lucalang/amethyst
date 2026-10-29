import type { GameLook } from "@/lib/game-cosmetics";
import { mix, random, withAlpha } from "./engine";

/**
 * Fruit Slice cosmetics. Everything here is drawing only: radii, hitboxes, launches and scoring
 * live in the game and never read the theme.
 *
 * Layering: the art style decides how things are rendered (shading, outlines, washes, pixels);
 * the skin decides the fruit's surface on top of that; the background, blade and juice are drawn
 * in their own layers and also pick up the style's outline or wash treatment.
 */

export type FruitKind = { skin: string; flesh: string; radius: number; leaf: boolean };
export type FruitStyle = "smooth" | "cartoon" | "pixel" | "watercolor";
export type FruitTheme = { key: string; blade: string; skin: string; background: string; juice: string; style: FruitStyle };

const STYLES: FruitStyle[] = ["cartoon", "pixel", "watercolor"];
const INK = "#1d1426";
const BOMB_RADIUS = 28;
/** World px per pixel-art pixel. */
export const PIXEL_UNIT = 3;

export function fruitTheme(look: GameLook): FruitTheme {
  const style = STYLES.includes(look.style as FruitStyle) ? (look.style as FruitStyle) : "smooth";
  const blade = look.blade ?? "default";
  const skin = look.skin ?? "default";
  const background = look.background ?? "default";
  const juice = look.juice ?? "default";
  return { key: `${blade}|${skin}|${background}|${juice}|${style}`, blade, skin, background, juice, style };
}

/** A repeatable pseudo-random number in [0, 1) for decorative layouts. */
const rand = (i: number, salt = 0) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

function wobblyCircle(c: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, amount = 0.05) {
  c.beginPath();
  const steps = 28;
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const k = 1 + Math.sin(a * 3 + seed) * amount + Math.sin(a * 5 + seed * 2.3) * amount * 0.6;
    const px = x + Math.cos(a) * r * k;
    const py = y + Math.sin(a) * r * k;
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
}

function starPath(c: CanvasRenderingContext2D, x: number, y: number, r: number, points: number, inner: number, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = rot + (i * Math.PI) / points;
    const d = i % 2 ? r * inner : r;
    if (i === 0) c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    else c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  c.closePath();
}

// ---------------------------------------------------------------------------------------------
// Sprites: fruit and halves are painted once per kind, skin, style and resolution, then reused.
// ---------------------------------------------------------------------------------------------

const sprites = new Map<string, HTMLCanvasElement>();

function sprite(key: string, half: number, scale: number, paint: (c: CanvasRenderingContext2D) => void) {
  const px = Math.max(4, Math.ceil(half * 2 * scale));
  const id = `${key}@${px}`;
  let canvas = sprites.get(id);
  if (!canvas) {
    if (sprites.size > 120) sprites.clear();
    canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    const c = canvas.getContext("2d");
    if (c) {
      c.scale(px / (half * 2), px / (half * 2));
      c.translate(half, half);
      paint(c);
    }
    sprites.set(id, canvas);
  }
  return canvas;
}

function skinBase(kind: FruitKind, skin: string) {
  switch (skin) {
    case "frosted":
      return mix(kind.skin, "#ffffff", 0.3);
    case "golden":
      return mix("#e2b13c", kind.skin, 0.28);
    case "cosmic":
      return mix(kind.skin, "#120c2a", 0.55);
    case "plush":
      return mix(kind.skin, "#ffffff", 0.12);
    default:
      return kind.skin;
  }
}

function leafColor(skin: string) {
  if (skin === "golden") return "#d9a92a";
  if (skin === "cosmic") return "#8a6bff";
  if (skin === "frosted") return "#8fd79a";
  return "#4caf50";
}

/** The fruit's body with the style's shading, before the skin decoration. */
function paintBody(c: CanvasRenderingContext2D, r: number, base: string, style: FruitStyle, seed: number) {
  if (style === "watercolor") {
    const washes: [number, number, number, number][] = [
      [-0.05, -0.04, 1.02, 0.42],
      [0.06, 0.05, 0.96, 0.42],
      [0, 0, 0.9, 0.5],
    ];
    for (const [dx, dy, k, a] of washes) {
      c.fillStyle = withAlpha(base, a);
      wobblyCircle(c, dx * r, dy * r, r * k, seed + k * 5);
      c.fill();
    }
    return;
  }
  c.fillStyle = base;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  if (style === "smooth") {
    c.fillStyle = withAlpha("#000000", 0.16);
    c.beginPath();
    c.arc(r * 0.18, r * 0.22, r * 0.82, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = base;
    c.beginPath();
    c.arc(-r * 0.06, -r * 0.06, r * 0.8, 0, Math.PI * 2);
    c.fill();
    return;
  }
  // Cartoon and pixel: a hard-edged shadow crescent.
  c.save();
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = mix(base, "#000000", style === "pixel" ? 0.3 : 0.22);
  c.fillRect(-r, -r, r * 2, r * 2);
  c.fillStyle = base;
  c.beginPath();
  c.arc(-r * 0.12, -r * 0.12, r * 0.94, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function paintHighlight(c: CanvasRenderingContext2D, r: number, style: FruitStyle) {
  if (style === "pixel") {
    c.fillStyle = withAlpha("#ffffff", 0.8);
    c.fillRect(-r * 0.55, -r * 0.55, r * 0.24, r * 0.24);
    c.fillRect(-r * 0.28, -r * 0.62, r * 0.12, r * 0.12);
    return;
  }
  if (style === "cartoon") {
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.ellipse(-r * 0.38, -r * 0.4, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(-r * 0.12, -r * 0.58, r * 0.06, 0, Math.PI * 2);
    c.fill();
    return;
  }
  if (style === "watercolor") {
    // Paper left showing through the paint.
    c.fillStyle = withAlpha("#fffaf0", 0.45);
    wobblyCircle(c, -r * 0.36, -r * 0.38, r * 0.2, r, 0.12);
    c.fill();
    return;
  }
  c.fillStyle = withAlpha("#ffffff", 0.4);
  c.beginPath();
  c.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2);
  c.fill();
}

function paintOutline(c: CanvasRenderingContext2D, r: number, base: string, style: FruitStyle, seed: number) {
  if (style === "cartoon") {
    c.strokeStyle = INK;
    c.lineWidth = Math.max(2.5, r * 0.1);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.stroke();
  } else if (style === "pixel") {
    c.strokeStyle = mix(base, "#000000", 0.6);
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, r - 1, 0, Math.PI * 2);
    c.stroke();
  } else if (style === "watercolor") {
    // Pigment pooling at the edge of the wash.
    c.strokeStyle = withAlpha(mix(base, "#000000", 0.25), 0.4);
    c.lineWidth = r * 0.07;
    wobblyCircle(c, 0, 0, r * 0.97, seed + 2);
    c.stroke();
  }
}

/** The skin's surface pattern, clipped to the fruit. */
function paintSkin(c: CanvasRenderingContext2D, kind: FruitKind, skin: string, r: number, base: string) {
  c.save();
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.clip();
  switch (skin) {
    case "polka": {
      c.fillStyle = mix(kind.flesh, "#ffffff", 0.45);
      const step = r * 0.48;
      for (let row = -3; row <= 3; row += 1) {
        for (let col = -3; col <= 3; col += 1) {
          const x = col * step + (row % 2 ? step / 2 : 0);
          const y = row * step * 0.9;
          c.beginPath();
          c.arc(x, y, r * 0.11, 0, Math.PI * 2);
          c.fill();
        }
      }
      break;
    }
    case "glossy": {
      const shine = c.createLinearGradient(0, -r, 0, r);
      shine.addColorStop(0, withAlpha("#ffffff", 0.35));
      shine.addColorStop(0.5, withAlpha("#ffffff", 0));
      shine.addColorStop(1, withAlpha(mix(base, "#000000", 0.4), 0.35));
      c.fillStyle = shine;
      c.fillRect(-r, -r, r * 2, r * 2);
      c.fillStyle = withAlpha("#ffffff", 0.6);
      c.beginPath();
      c.ellipse(0, -r * 0.5, r * 0.62, r * 0.22, 0, 0, Math.PI * 2);
      c.fill();
      // Sugar rim.
      c.strokeStyle = withAlpha("#ffffff", 0.85);
      c.lineWidth = r * 0.07;
      c.setLineDash([r * 0.04, r * 0.14]);
      c.lineCap = "round";
      c.beginPath();
      c.arc(0, 0, r * 0.9, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      break;
    }
    case "frosted": {
      c.fillStyle = withAlpha("#ffffff", 0.4);
      c.beginPath();
      c.ellipse(0, -r * 0.7, r * 1.1, r * 0.55, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = withAlpha("#ffffff", 0.85);
      for (let i = 0; i < 34; i += 1) {
        const a = rand(i, 1) * Math.PI * 2;
        const d = Math.sqrt(rand(i, 2)) * r;
        c.fillRect(Math.cos(a) * d, Math.sin(a) * d, r * 0.05, r * 0.05);
      }
      for (let i = 0; i < 3; i += 1) {
        starPath(c, (rand(i, 7) - 0.5) * r * 1.1, (rand(i, 8) - 0.6) * r * 1.1, r * 0.14, 4, 0.3);
        c.fill();
      }
      break;
    }
    case "faces": {
      c.fillStyle = withAlpha("#ff6b8a", 0.45);
      for (const side of [-1, 1]) {
        c.beginPath();
        c.ellipse(side * r * 0.5, r * 0.18, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = INK;
      for (const side of [-1, 1]) {
        c.beginPath();
        c.ellipse(side * r * 0.28, -r * 0.08, r * 0.09, r * 0.13, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#ffffff";
      for (const side of [-1, 1]) {
        c.beginPath();
        c.arc(side * r * 0.28 - r * 0.03, -r * 0.13, r * 0.035, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = INK;
      c.lineWidth = r * 0.07;
      c.lineCap = "round";
      c.beginPath();
      c.arc(0, r * 0.1, r * 0.2, Math.PI * 0.18, Math.PI * 0.82);
      c.stroke();
      break;
    }
    case "plush": {
      for (let i = 0; i < 70; i += 1) {
        const a = rand(i, 3) * Math.PI * 2;
        const d = Math.sqrt(rand(i, 4)) * r;
        c.fillStyle = withAlpha(i % 2 ? "#ffffff" : "#000000", 0.08);
        c.beginPath();
        c.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.06, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = withAlpha(mix(base, "#ffffff", 0.6), 0.95);
      c.lineWidth = r * 0.06;
      c.lineCap = "round";
      c.setLineDash([r * 0.12, r * 0.09]);
      c.beginPath();
      c.moveTo(-r * 0.1, -r);
      c.bezierCurveTo(r * 0.35, -r * 0.4, -r * 0.35, r * 0.4, r * 0.1, r);
      c.stroke();
      c.beginPath();
      c.arc(0, 0, r * 0.86, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      break;
    }
    case "golden": {
      const g = c.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, withAlpha("#fff6c8", 0.6));
      g.addColorStop(0.45, withAlpha("#ffffff", 0));
      g.addColorStop(1, withAlpha("#6b4a00", 0.4));
      c.fillStyle = g;
      c.fillRect(-r, -r, r * 2, r * 2);
      c.strokeStyle = withAlpha("#fffbe6", 0.7);
      c.lineWidth = r * 0.12;
      c.beginPath();
      c.moveTo(-r * 0.7, r * 0.2);
      c.lineTo(r * 0.1, -r * 0.8);
      c.stroke();
      c.lineWidth = r * 0.05;
      c.beginPath();
      c.moveTo(-r * 0.45, r * 0.45);
      c.lineTo(r * 0.35, -r * 0.55);
      c.stroke();
      break;
    }
    case "cosmic": {
      const glow = c.createRadialGradient(r * 0.2, r * 0.1, 0, r * 0.2, r * 0.1, r);
      glow.addColorStop(0, withAlpha(kind.skin, 0.55));
      glow.addColorStop(1, withAlpha(kind.skin, 0));
      c.fillStyle = glow;
      c.fillRect(-r, -r, r * 2, r * 2);
      c.strokeStyle = withAlpha(mix(kind.skin, "#ffffff", 0.3), 0.7);
      c.lineWidth = r * 0.16;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-r * 0.9, r * 0.3);
      c.bezierCurveTo(-r * 0.3, -r * 0.4, r * 0.3, r * 0.5, r * 0.9, -r * 0.3);
      c.stroke();
      c.fillStyle = "#ffffff";
      for (let i = 0; i < 12; i += 1) {
        const a = rand(i, 5) * Math.PI * 2;
        const d = Math.sqrt(rand(i, 6)) * r * 0.92;
        c.beginPath();
        c.arc(Math.cos(a) * d, Math.sin(a) * d, r * (i % 4 ? 0.025 : 0.05), 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
  }
  c.restore();
}

function paintLeaf(c: CanvasRenderingContext2D, r: number, skin: string, style: FruitStyle) {
  const color = leafColor(skin);
  c.strokeStyle = skin === "golden" ? "#a67c1a" : "#5a3b22";
  c.lineWidth = 3;
  c.lineCap = style === "pixel" ? "square" : "round";
  c.beginPath();
  c.moveTo(0, -r * 0.82);
  c.lineTo(r * 0.06, -r * 1.12);
  c.stroke();
  c.fillStyle = style === "watercolor" ? withAlpha(color, 0.7) : color;
  c.beginPath();
  c.ellipse(r * 0.25, -r * 1.02, r * 0.32, r * 0.13, -0.5, 0, Math.PI * 2);
  c.fill();
  if (style === "cartoon") {
    c.strokeStyle = INK;
    c.lineWidth = Math.max(2, r * 0.07);
    c.stroke();
  } else if (style === "pixel") {
    c.strokeStyle = mix(color, "#000000", 0.5);
    c.lineWidth = 2;
    c.stroke();
  }
  if (skin === "plush") {
    c.strokeStyle = withAlpha("#ffffff", 0.8);
    c.lineWidth = 1.2;
    c.setLineDash([2, 2]);
    c.beginPath();
    c.moveTo(r * 0.02, -r * 0.92);
    c.lineTo(r * 0.5, -r * 1.12);
    c.stroke();
    c.setLineDash([]);
  }
}

function paintFruit(c: CanvasRenderingContext2D, kind: FruitKind, theme: FruitTheme) {
  const r = kind.radius;
  const base = skinBase(kind, theme.skin);
  const seed = kind.radius + kind.skin.charCodeAt(2);
  paintBody(c, r, base, theme.style, seed);
  paintSkin(c, kind, theme.skin, r, base);
  if (theme.skin !== "faces" || theme.style !== "pixel") paintHighlight(c, r, theme.style);
  paintOutline(c, r, base, theme.style, seed);
  if (kind.leaf) paintLeaf(c, r, theme.skin, theme.style);
}

/** The lower half of a sliced fruit, cut face up along y = 0. */
function paintHalf(c: CanvasRenderingContext2D, kind: FruitKind, theme: FruitTheme) {
  const r = kind.radius;
  const style = theme.style;
  const base = skinBase(kind, theme.skin);
  const flesh = theme.skin === "golden" ? mix(kind.flesh, "#ffd65a", 0.25) : theme.skin === "cosmic" ? mix(kind.flesh, "#2a1d5c", 0.25) : kind.flesh;
  const semi = (k: number) => {
    c.beginPath();
    c.arc(0, 0, r * k, 0, Math.PI);
    c.closePath();
  };
  c.fillStyle = style === "watercolor" ? withAlpha(base, 0.75) : base;
  semi(1);
  c.fill();
  c.fillStyle = style === "watercolor" ? withAlpha(flesh, 0.8) : flesh;
  semi(0.84);
  c.fill();
  if (style === "cartoon" || style === "pixel") {
    c.fillStyle = withAlpha(mix(flesh, "#000000", 0.4), 0.3);
    c.beginPath();
    c.arc(0, 0, r * 0.84, Math.PI * 0.15, Math.PI * 0.85);
    c.arc(0, -r * 0.1, r * 0.8, Math.PI * 0.85, Math.PI * 0.15, true);
    c.closePath();
    c.fill();
  }
  if (theme.skin === "cosmic") {
    c.fillStyle = "#ffffff";
    for (let i = 0; i < 6; i += 1) {
      c.beginPath();
      c.arc((rand(i, 9) - 0.5) * r * 1.2, rand(i, 10) * r * 0.6 + r * 0.1, r * 0.03, 0, Math.PI * 2);
      c.fill();
    }
  }
  // Seeds suggest the fruit's inside; the same for every skin.
  c.fillStyle = withAlpha(mix(flesh, "#2b1a10", 0.7), 0.6);
  for (let i = 0; i < 4; i += 1) {
    c.beginPath();
    c.ellipse((i - 1.5) * r * 0.22, r * 0.38, r * 0.035, r * 0.06, 0, 0, Math.PI * 2);
    c.fill();
  }
  if (style === "cartoon") {
    c.strokeStyle = INK;
    c.lineWidth = Math.max(2.5, r * 0.1);
    semi(1);
    c.stroke();
  } else if (style === "pixel") {
    c.strokeStyle = mix(base, "#000000", 0.6);
    c.lineWidth = 3;
    semi(0.98);
    c.stroke();
  } else if (style === "watercolor") {
    c.strokeStyle = withAlpha(mix(base, "#000000", 0.25), 0.4);
    c.lineWidth = r * 0.06;
    semi(0.98);
    c.stroke();
  }
  c.strokeStyle = withAlpha("#ffffff", theme.skin === "plush" ? 0.9 : 0.45);
  c.lineWidth = 2;
  if (theme.skin === "plush") c.setLineDash([3, 3]);
  c.beginPath();
  c.moveTo(-r * 0.84, 0);
  c.lineTo(r * 0.84, 0);
  c.stroke();
  c.setLineDash([]);
}

/** Draws a whole fruit centered at the origin; `scale` is device px per world px. */
export function drawFruit(c: CanvasRenderingContext2D, kind: FruitKind, theme: FruitTheme, scale: number) {
  const half = kind.radius * 1.45;
  const image = sprite(`f:${kind.skin}:${theme.skin}:${theme.style}`, half, scale, (s) => paintFruit(s, kind, theme));
  c.drawImage(image, -half, -half, half * 2, half * 2);
}

/** Draws one half; side -1 is the upper half (the same art turned over). */
export function drawHalf(c: CanvasRenderingContext2D, kind: FruitKind, side: 1 | -1, theme: FruitTheme, scale: number) {
  const half = kind.radius * 1.1;
  const image = sprite(`h:${kind.skin}:${theme.skin}:${theme.style}`, half, scale, (s) => paintHalf(s, kind, theme));
  if (side === -1) c.rotate(Math.PI);
  c.drawImage(image, -half, -half, half * 2, half * 2);
}

/** Bombs keep their dark casing, red ring, warning cross and lit fuse in every style. */
export function drawBomb(c: CanvasRenderingContext2D, theme: FruitTheme, now: number, animate: boolean) {
  const r = BOMB_RADIUS;
  const style = theme.style;
  if (animate) {
    c.fillStyle = withAlpha("#ff3b3b", 0.22 + Math.sin(now / 120) * 0.08);
    c.beginPath();
    c.arc(0, 0, r + 9, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#231c2b";
  if (style === "watercolor") {
    wobblyCircle(c, 0, 0, r, 3, 0.03);
    c.fill();
    c.fillStyle = withAlpha("#3a2e48", 0.6);
    wobblyCircle(c, -r * 0.12, -r * 0.12, r * 0.7, 7, 0.06);
    c.fill();
  } else {
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
  }
  if (style === "cartoon") {
    c.fillStyle = withAlpha("#ffffff", 0.8);
    c.beginPath();
    c.ellipse(-r * 0.42, -r * 0.42, r * 0.2, r * 0.1, -0.7, 0, Math.PI * 2);
    c.fill();
  } else if (style === "pixel") {
    c.fillStyle = withAlpha("#ffffff", 0.5);
    c.fillRect(-r * 0.6, -r * 0.6, r * 0.2, r * 0.2);
  }
  c.strokeStyle = "#ff4d4d";
  c.lineWidth = 3;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.stroke();
  if (style === "cartoon") {
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, r + 3, 0, Math.PI * 2);
    c.stroke();
  }
  c.strokeStyle = "#ff6b6b";
  c.lineWidth = 5;
  c.lineCap = style === "pixel" ? "square" : "round";
  c.beginPath();
  c.moveTo(-9, -9);
  c.lineTo(9, 9);
  c.moveTo(9, -9);
  c.lineTo(-9, 9);
  c.stroke();
  c.fillStyle = "#5b4e66";
  c.fillRect(-6, -r - 6, 12, 8);
  if (style === "cartoon") {
    c.strokeStyle = INK;
    c.lineWidth = 2;
    c.strokeRect(-6, -r - 6, 12, 8);
  }
  c.strokeStyle = "#c9b48a";
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(0, -r - 6);
  c.quadraticCurveTo(8, -r - 18, 14, -r - 14);
  c.stroke();
  c.fillStyle = Math.floor(now / 90) % 2 ? "#ffd166" : "#ff4d4d";
  c.beginPath();
  c.arc(14, -r - 14, 4.5, 0, Math.PI * 2);
  c.fill();
}

// ---------------------------------------------------------------------------------------------
// Backgrounds: the static part is cached per size; a few have light motion drawn every frame.
// ---------------------------------------------------------------------------------------------

const lanterns = (w: number) => {
  const count = Math.max(4, Math.round(w / 140));
  return Array.from({ length: count }, (_, i) => {
    const x = ((i + 0.5) / count) * w;
    const t = (i + 0.5) / count;
    return { x, y: 46 + Math.sin(t * Math.PI) * 34, color: ["#ff4d4d", "#ffb347", "#ff7a3d", "#ffd166"][i % 4] };
  });
};

function paintBackdrop(c: CanvasRenderingContext2D, theme: FruitTheme, w: number, h: number) {
  switch (theme.background) {
    case "picnic": {
      c.fillStyle = "#f6eedd";
      c.fillRect(0, 0, w, h);
      c.fillStyle = withAlpha("#d63031", 0.32);
      for (let x = 0; x < w; x += 80) c.fillRect(x, 0, 40, h);
      for (let y = 0; y < h; y += 80) c.fillRect(0, y, w, 40);
      c.strokeStyle = withAlpha("#ffffff", 0.25);
      c.lineWidth = 1;
      for (let x = 10; x < w; x += 20) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, h);
        c.stroke();
      }
      break;
    }
    case "bamboo": {
      c.fillStyle = "#24361b";
      c.fillRect(0, 0, w, h);
      const stalk = 58;
      for (let i = 0, x = 0; x < w; i += 1, x += stalk + 6) {
        const g = c.createLinearGradient(x, 0, x + stalk, 0);
        g.addColorStop(0, "#4f7a2e");
        g.addColorStop(0.35, "#8dbb55");
        g.addColorStop(1, "#3e6324");
        c.fillStyle = g;
        c.fillRect(x, 0, stalk, h);
        c.fillStyle = withAlpha("#24361b", 0.6);
        for (let y = 60 + rand(i, 1) * 90; y < h; y += 130 + rand(i, 2) * 40) {
          c.fillRect(x, y, stalk, 5);
          c.fillStyle = withAlpha("#c8e39a", 0.35);
          c.fillRect(x, y + 5, stalk, 2);
          c.fillStyle = withAlpha("#24361b", 0.6);
        }
      }
      const shade = c.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, Math.max(w, h) * 0.7);
      shade.addColorStop(0, withAlpha("#000000", 0.05));
      shade.addColorStop(1, withAlpha("#000000", 0.45));
      c.fillStyle = shade;
      c.fillRect(0, 0, w, h);
      break;
    }
    case "marble": {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#2a2731");
      g.addColorStop(1, "#16141b");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.lineCap = "round";
      for (let i = 0; i < 9; i += 1) {
        const gold = i % 3 === 0;
        c.strokeStyle = gold ? withAlpha("#d4af37", 0.45) : withAlpha("#ffffff", 0.08);
        c.lineWidth = gold ? 1.6 : 1 + rand(i, 3) * 3;
        const y = rand(i, 1) * h;
        c.beginPath();
        c.moveTo(-10, y);
        c.bezierCurveTo(w * 0.3, y + (rand(i, 2) - 0.5) * 220, w * 0.65, y - (rand(i, 4) - 0.5) * 220, w + 10, y + (rand(i, 5) - 0.5) * 160);
        c.stroke();
      }
      break;
    }
    case "beach": {
      const sky = c.createLinearGradient(0, 0, 0, h * 0.3);
      sky.addColorStop(0, "#7fcaf5");
      sky.addColorStop(1, "#cdefff");
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h * 0.3);
      c.fillStyle = "#fff6c2";
      c.beginPath();
      c.arc(w * 0.82, h * 0.1, 26, 0, Math.PI * 2);
      c.fill();
      const sea = c.createLinearGradient(0, h * 0.3, 0, h * 0.46);
      sea.addColorStop(0, "#1f8fb3");
      sea.addColorStop(1, "#3cc3cf");
      c.fillStyle = sea;
      c.fillRect(0, h * 0.3, w, h * 0.16);
      const sand = c.createLinearGradient(0, h * 0.46, 0, h);
      sand.addColorStop(0, "#f2d79e");
      sand.addColorStop(1, "#ddb373");
      c.fillStyle = sand;
      c.beginPath();
      c.moveTo(0, h * 0.46);
      for (let x = 0; x <= w; x += 20) c.lineTo(x, h * 0.46 + Math.sin(x / 40) * 4);
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.closePath();
      c.fill();
      c.strokeStyle = withAlpha("#ffffff", 0.75);
      c.lineWidth = 3;
      c.beginPath();
      for (let x = 0; x <= w; x += 20) c.lineTo(x, h * 0.46 + Math.sin(x / 40) * 4);
      c.stroke();
      c.fillStyle = withAlpha("#9a7440", 0.25);
      for (let i = 0; i < 160; i += 1) c.fillRect(rand(i, 1) * w, h * 0.5 + rand(i, 2) * h * 0.5, 2, 2);
      break;
    }
    case "sakura": {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#2d1b3d");
      g.addColorStop(0.6, "#6b3a5e");
      g.addColorStop(1, "#d98aa6");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      for (const [sx, dir] of [[0, 1], [w, -1]] as const) {
        c.strokeStyle = "#3a2230";
        c.lineWidth = 9;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(sx, 30);
        c.quadraticCurveTo(sx + dir * 90, 50, sx + dir * 170, 20);
        c.moveTo(sx + dir * 80, 44);
        c.quadraticCurveTo(sx + dir * 120, 90, sx + dir * 150, 110);
        c.stroke();
        for (let i = 0; i < 14; i += 1) {
          c.fillStyle = withAlpha(i % 2 ? "#ffc2d6" : "#ff9fbd", 0.9);
          c.beginPath();
          c.arc(sx + dir * (30 + rand(i, dir + 3) * 150), 20 + rand(i, dir + 5) * 90, 7 + rand(i, 9) * 7, 0, Math.PI * 2);
          c.fill();
        }
      }
      break;
    }
    case "night-market": {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#120d22");
      g.addColorStop(1, "#2b1838");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      // Stalls along the bottom.
      for (let i = 0, x = -20; x < w; i += 1, x += 150) {
        const top = h - 120 - rand(i, 1) * 50;
        c.fillStyle = "#1a1128";
        c.fillRect(x, top, 130, h - top);
        c.fillStyle = i % 2 ? "#a8323e" : "#c96a2b";
        for (let s = 0; s < 6; s += 1) {
          c.fillStyle = s % 2 ? "#f4e3c1" : i % 2 ? "#a8323e" : "#c96a2b";
          c.fillRect(x + s * (130 / 6), top - 18, 130 / 6, 18);
        }
        c.fillStyle = withAlpha("#ffcf7a", 0.35);
        c.fillRect(x + 12, top + 20, 106, 30);
      }
      const list = lanterns(w);
      c.strokeStyle = withAlpha("#f4e3c1", 0.4);
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(0, 40);
      for (const lantern of list) c.lineTo(lantern.x, lantern.y - 14);
      c.lineTo(w, 40);
      c.stroke();
      for (const lantern of list) {
        c.fillStyle = lantern.color;
        c.beginPath();
        c.ellipse(lantern.x, lantern.y, 12, 15, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#3a2230";
        c.fillRect(lantern.x - 6, lantern.y - 17, 12, 4);
        c.fillRect(lantern.x - 6, lantern.y + 13, 12, 4);
      }
      break;
    }
    case "space": {
      c.fillStyle = "#06041a";
      c.fillRect(0, 0, w, h);
      const nebula = c.createRadialGradient(w * 0.25, h * 0.35, 10, w * 0.25, h * 0.35, w * 0.5);
      nebula.addColorStop(0, withAlpha("#7b4dff", 0.28));
      nebula.addColorStop(1, withAlpha("#7b4dff", 0));
      c.fillStyle = nebula;
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i += 1) {
        c.fillStyle = withAlpha("#ffffff", 0.3 + rand(i, 2) * 0.6);
        c.fillRect(rand(i, 3) * w, rand(i, 4) * h, i % 9 ? 1.4 : 2.4, i % 9 ? 1.4 : 2.4);
      }
      const px = w * 0.84;
      const py = h * 0.82;
      const planet = c.createRadialGradient(px - 25, py - 25, 10, px, py, 80);
      planet.addColorStop(0, "#ffb37a");
      planet.addColorStop(1, "#7a3d6b");
      c.fillStyle = planet;
      c.beginPath();
      c.arc(px, py, 70, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = withAlpha("#f4d9ff", 0.55);
      c.lineWidth = 6;
      c.beginPath();
      c.ellipse(px, py, 120, 24, -0.3, 0, Math.PI * 2);
      c.stroke();
      break;
    }
    default: {
      const g = c.createRadialGradient(w / 2, h * 0.45, 40, w / 2, h * 0.5, Math.max(w, h) * 0.75);
      g.addColorStop(0, mix("#6b4423", "#e8a33d", 0.14));
      g.addColorStop(1, mix("#3b2414", "#6b4423", 0.5));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = withAlpha("#fff4e0", 0.035);
      c.lineWidth = 2;
      for (let y = 40; y < h; y += 70) {
        c.beginPath();
        c.moveTo(0, y);
        c.bezierCurveTo(w * 0.3, y + 10, w * 0.6, y - 10, w, y + 4);
        c.stroke();
      }
    }
  }

  if (theme.style === "cartoon") {
    // Comic halftone and a bold frame.
    c.fillStyle = withAlpha(INK, 0.08);
    for (let y = 0, row = 0; y < h; y += 14, row += 1) {
      for (let x = row % 2 ? 7 : 0; x < w; x += 14) {
        c.beginPath();
        c.arc(x, y, 1.6, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.strokeStyle = withAlpha(INK, 0.7);
    c.lineWidth = 8;
    c.strokeRect(0, 0, w, h);
  } else if (theme.style === "watercolor") {
    c.fillStyle = withAlpha("#f5ecd7", 0.16);
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i += 1) {
      const x = rand(i, 11) * w;
      const y = rand(i, 12) * h;
      const r = 50 + rand(i, 13) * 110;
      const wash = c.createRadialGradient(x, y, 0, x, y, r);
      wash.addColorStop(0, withAlpha("#ffffff", 0.09));
      wash.addColorStop(1, withAlpha("#ffffff", 0));
      c.fillStyle = wash;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 700; i += 1) {
      c.fillStyle = withAlpha(i % 2 ? "#ffffff" : "#5a4630", 0.06);
      c.fillRect(rand(i, 14) * w, rand(i, 15) * h, 1.5, 1.5);
    }
    const edge = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    edge.addColorStop(0, withAlpha("#fbf4e4", 0));
    edge.addColorStop(1, withAlpha("#fbf4e4", 0.35));
    c.fillStyle = edge;
    c.fillRect(0, 0, w, h);
  }
}

let backdropCache: { id: string; canvas: HTMLCanvasElement } | null = null;

/** Draws the background in world coordinates (w × h); `scale` is device px per world px. */
export function drawBackdrop(c: CanvasRenderingContext2D, theme: FruitTheme, w: number, h: number, scale: number) {
  const pw = Math.max(1, Math.round(w * scale));
  const ph = Math.max(1, Math.round(h * scale));
  const id = `${theme.background}:${theme.style}:${pw}x${ph}:${w}`;
  if (backdropCache?.id !== id) {
    const canvas = backdropCache?.canvas ?? document.createElement("canvas");
    canvas.width = pw;
    canvas.height = ph;
    const b = canvas.getContext("2d");
    if (b) {
      b.setTransform(pw / w, 0, 0, ph / h, 0, 0);
      paintBackdrop(b, theme, w, h);
    }
    backdropCache = { id, canvas };
  }
  c.drawImage(backdropCache.canvas, 0, 0, w, h);
}

/** Light ambient motion for some backgrounds; skipped when effects are off. */
export function drawBackdropMotion(c: CanvasRenderingContext2D, theme: FruitTheme, w: number, h: number, now: number) {
  switch (theme.background) {
    case "sakura":
      for (let i = 0; i < 12; i += 1) {
        const x = (((rand(i, 1) * (w + 40) + now * 0.02 * (0.5 + rand(i, 2))) % (w + 40)) + w + 40) % (w + 40) - 20;
        const y = ((rand(i, 3) * (h + 40) + now * 0.035 * (0.6 + rand(i, 4))) % (h + 40)) - 20;
        c.save();
        c.translate(x, y);
        c.rotate(now * 0.002 + i);
        c.fillStyle = withAlpha("#ffc2d6", 0.75);
        c.beginPath();
        c.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      break;
    case "night-market":
      for (const [i, lantern] of lanterns(w).entries()) {
        const r = 34 + Math.sin(now / 300 + i * 1.7) * 4;
        const glow = c.createRadialGradient(lantern.x, lantern.y, 4, lantern.x, lantern.y, r);
        glow.addColorStop(0, withAlpha(lantern.color, 0.35));
        glow.addColorStop(1, withAlpha(lantern.color, 0));
        c.fillStyle = glow;
        c.fillRect(lantern.x - r, lantern.y - r, r * 2, r * 2);
      }
      break;
    case "space":
      for (let i = 0; i < 16; i += 1) {
        const a = 0.5 + 0.5 * Math.sin(now / 400 + i * 1.7);
        starPath(c, rand(i, 21) * w, rand(i, 22) * h, 2 + a * 2.5, 4, 0.3);
        c.fillStyle = withAlpha("#ffffff", a * 0.9);
        c.fill();
      }
      break;
    case "beach":
      c.strokeStyle = withAlpha("#ffffff", 0.5);
      c.lineWidth = 2;
      c.lineCap = "round";
      for (let i = 0; i < 7; i += 1) {
        const x = (rand(i, 31) * w + Math.sin(now / 900 + i) * 20 + w) % w;
        const y = h * (0.32 + rand(i, 32) * 0.12);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 18, y);
        c.stroke();
      }
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// Blades: the swipe trail. Points are oldest first, with timestamps.
// ---------------------------------------------------------------------------------------------

type TrailPoint = { x: number; y: number; t: number };

function ribbonPath(c: CanvasRenderingContext2D, pts: TrailPoint[], now: number, ms: number, maxW: number) {
  const n = pts.length;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    const length = Math.hypot(nx, ny) || 1;
    nx /= length;
    ny /= length;
    const fade = 1 - (now - pts[i].t) / ms;
    const w = 0.6 + maxW * fade * (i / (n - 1));
    left.push([pts[i].x + nx * w, pts[i].y + ny * w]);
    right.push([pts[i].x - nx * w, pts[i].y - ny * w]);
  }
  c.beginPath();
  c.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < n; i += 1) c.lineTo(left[i][0], left[i][1]);
  for (let i = n - 1; i >= 0; i -= 1) c.lineTo(right[i][0], right[i][1]);
  c.closePath();
}

function corePath(c: CanvasRenderingContext2D, pts: TrailPoint[]) {
  const n = pts.length;
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n - 1; i += 1) c.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  c.lineTo(pts[n - 1].x, pts[n - 1].y);
}

function ribbon(c: CanvasRenderingContext2D, pts: TrailPoint[], now: number, ms: number, maxW: number, color: string, alpha: number, style: FruitStyle) {
  if (style === "watercolor") {
    // Two soft, offset washes instead of one crisp ribbon.
    c.save();
    c.translate(1.5, 1);
    ribbonPath(c, pts, now, ms, maxW * 1.25);
    c.fillStyle = withAlpha(color, alpha * 0.45);
    c.fill();
    c.restore();
    ribbonPath(c, pts, now, ms, maxW);
    c.fillStyle = withAlpha(color, alpha * 0.6);
    c.fill();
    return;
  }
  ribbonPath(c, pts, now, ms, maxW);
  if (style === "cartoon") {
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    c.lineJoin = "round";
    c.stroke();
    c.fillStyle = color;
  } else {
    c.fillStyle = withAlpha(color, alpha);
  }
  c.fill();
}

function core(c: CanvasRenderingContext2D, pts: TrailPoint[], color: string, width: number) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  corePath(c, pts);
  c.stroke();
}

function snowflake(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  c.beginPath();
  for (let k = 0; k < 3; k += 1) {
    const a = rot + (k * Math.PI) / 3;
    c.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
    c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  c.stroke();
}

export function drawBlade(c: CanvasRenderingContext2D, pts: TrailPoint[], now: number, ms: number, theme: FruitTheme) {
  const n = pts.length;
  if (n < 2) return;
  const style = theme.style;
  const fadeOf = (i: number) => Math.max(0, 1 - (now - pts[i].t) / ms);
  switch (theme.blade) {
    case "katana": {
      ribbon(c, pts, now, ms, 3, "#d5dde9", 0.75, style);
      core(c, pts, withAlpha("#ffffff", 0.95), 1.2);
      const head = pts[n - 1];
      c.fillStyle = withAlpha("#e8f4ff", 0.6 + 0.4 * Math.sin(now / 40));
      starPath(c, head.x, head.y, 7, 4, 0.22, now / 300);
      c.fill();
      break;
    }
    case "ink-brush": {
      ribbon(c, pts, now, ms, 8, "#15121c", 0.88, style === "cartoon" ? "smooth" : style);
      c.fillStyle = withAlpha("#15121c", 0.7);
      for (let i = 0; i < n; i += 2) {
        const f = fadeOf(i);
        if (f <= 0) continue;
        const a = rand(i + Math.round(pts[i].t), 1) * Math.PI * 2;
        const d = 7 + rand(i, 2) * 8;
        c.beginPath();
        c.arc(pts[i].x + Math.cos(a) * d, pts[i].y + Math.sin(a) * d, (0.8 + rand(i, 3) * 1.8) * f, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case "flame": {
      ribbon(c, pts, now, ms, 8, "#ff4a1c", 0.55, style);
      ribbonPath(c, pts, now, ms, 4);
      c.fillStyle = withAlpha("#ffb21f", 0.85);
      c.fill();
      core(c, pts, withAlpha("#fff3b0", 0.95), 1.6);
      for (let i = 0; i < n; i += 2) {
        const f = fadeOf(i);
        if (f <= 0) continue;
        const age = now - pts[i].t;
        c.fillStyle = withAlpha(i % 4 ? "#ffcf5a" : "#ff7a2f", f);
        c.beginPath();
        c.arc(pts[i].x + Math.sin(i * 2.1 + now / 60) * 5, pts[i].y - age * 0.08, 1.8 * f + 0.4, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case "frost": {
      ribbon(c, pts, now, ms, 6, "#7fe3ff", 0.45, style);
      core(c, pts, withAlpha("#ffffff", 0.95), 1.8);
      c.strokeStyle = withAlpha("#e6fbff", 0.9);
      c.lineWidth = 1.2;
      for (let i = 0; i < n; i += 4) {
        const f = fadeOf(i);
        if (f <= 0) continue;
        const age = now - pts[i].t;
        snowflake(c, pts[i].x + (rand(i, 4) - 0.5) * 14, pts[i].y + age * 0.04 + (rand(i, 5) - 0.5) * 14, 2 + 3 * f, i);
      }
      break;
    }
    case "starlight": {
      ribbon(c, pts, now, ms, 5, "#ffd56b", 0.45, style);
      core(c, pts, withAlpha("#fff8d6", 0.95), 1.5);
      for (let i = 0; i < n; i += 3) {
        const f = fadeOf(i);
        if (f <= 0) continue;
        c.fillStyle = withAlpha(i % 2 ? "#ffffff" : "#ffe27a", f);
        starPath(c, pts[i].x + (rand(i, 6) - 0.5) * 16, pts[i].y + (rand(i, 7) - 0.5) * 16, 2 + 3.5 * f, 4, 0.35, i);
        c.fill();
      }
      break;
    }
    case "rainbow": {
      c.lineCap = "round";
      if (style === "cartoon") {
        c.strokeStyle = INK;
        for (let i = 1; i < n; i += 1) {
          c.lineWidth = 4 + 8 * fadeOf(i) * (i / (n - 1));
          c.beginPath();
          c.moveTo(pts[i - 1].x, pts[i - 1].y);
          c.lineTo(pts[i].x, pts[i].y);
          c.stroke();
        }
      }
      for (let i = 1; i < n; i += 1) {
        c.strokeStyle = `hsla(${(now / 4 + i * 16) % 360}, 90%, 62%, ${style === "watercolor" ? 0.55 : 0.85})`;
        c.lineWidth = 2 + 8 * fadeOf(i) * (i / (n - 1));
        c.beginPath();
        c.moveTo(pts[i - 1].x, pts[i - 1].y);
        c.lineTo(pts[i].x, pts[i].y);
        c.stroke();
      }
      core(c, pts, withAlpha("#ffffff", 0.7), 1);
      break;
    }
    case "lightning": {
      const tick = Math.floor(now / 45);
      const bolt = (spread: number, salt: number) => {
        c.beginPath();
        for (let i = 0; i < n; i += 1) {
          const a = pts[Math.max(0, i - 1)];
          const b = pts[Math.min(n - 1, i + 1)];
          let nx = -(b.y - a.y);
          let ny = b.x - a.x;
          const length = Math.hypot(nx, ny) || 1;
          nx /= length;
          ny /= length;
          const off = i === n - 1 ? 0 : (rand(i, tick + salt) - 0.5) * spread;
          if (i === 0) c.moveTo(pts[i].x + nx * off, pts[i].y + ny * off);
          else c.lineTo(pts[i].x + nx * off, pts[i].y + ny * off);
        }
      };
      c.lineJoin = "miter";
      c.lineCap = "round";
      bolt(12, 0);
      c.strokeStyle = withAlpha("#7df9ff", style === "watercolor" ? 0.2 : 0.3);
      c.lineWidth = 8;
      c.stroke();
      if (style === "cartoon") {
        c.strokeStyle = INK;
        c.lineWidth = 5;
        c.stroke();
      }
      c.strokeStyle = "#bff9ff";
      c.lineWidth = 2.6;
      c.stroke();
      bolt(22, 7);
      c.strokeStyle = withAlpha("#ffffff", 0.6);
      c.lineWidth = 1;
      c.stroke();
      break;
    }
    default:
      ribbon(c, pts, now, ms, 5.5, "#ff4d4d", 0.5, style);
      core(c, pts, withAlpha("#ffffff", 0.9), 1.6);
  }
}

// ---------------------------------------------------------------------------------------------
// Juice: particles and splats. Purely visual; shapes and drift vary per effect.
// ---------------------------------------------------------------------------------------------

export type JuiceParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
  rot: number;
  spin: number;
  shape: string;
  /** Gravity multiplier (negative floats up). */
  g: number;
  /** Lifetime in seconds. */
  span: number;
};

export type JuiceSplat = { x: number; y: number; color: string; life: number; shape: string; blobs: { dx: number; dy: number; r: number; rot: number; color: string }[] };

const CONFETTI = ["#ff5e7e", "#ffd166", "#4cc9f0", "#7ae582", "#b388ff"];

/** A plain particle (used for bomb blasts, which always look the same). */
export function plainParticle(x: number, y: number, color: string, speed: number): JuiceParticle {
  const angle = Math.random() * Math.PI * 2;
  const v = random(speed * 0.4, speed);
  return { x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - 90, life: 1, color, size: random(2, 4.2), rot: 0, spin: 0, shape: "drop", g: 0.7, span: 0.6 };
}

export function juiceBurst(theme: FruitTheme, x: number, y: number, kind: FruitKind, count: number, speed: number): JuiceParticle[] {
  const out: JuiceParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    const p = plainParticle(x, y, kind.flesh, speed);
    p.shape = theme.juice;
    p.rot = random(0, Math.PI * 2);
    p.spin = random(-8, 8);
    switch (theme.juice) {
      case "glitter":
        p.size = random(1.6, 3.2);
        p.color = i % 3 === 0 ? "#ffffff" : mix(kind.flesh, "#ffffff", 0.2);
        p.g = 0.35;
        p.span = 0.85;
        break;
      case "bubbles":
        p.vy = p.vy * 0.5 - 40;
        p.vx *= 0.7;
        p.g = -0.18;
        p.size = random(3, 6.5);
        p.span = 0.9;
        p.color = mix(kind.flesh, "#ffffff", 0.35);
        break;
      case "pixel-cubes":
        p.size = random(3, 5.5);
        p.color = i % 2 ? kind.flesh : kind.skin;
        p.spin = random(-10, 10);
        break;
      case "petals":
        p.vx *= 0.7;
        p.vy *= 0.7;
        p.g = 0.22;
        p.span = 1.1;
        p.size = random(4, 6.5);
        p.color = i % 2 ? "#ffc2d6" : mix(kind.flesh, "#ffc2d6", 0.5);
        break;
      case "ink":
        p.color = mix("#15121c", kind.skin, 0.15);
        p.size = random(2.5, 5);
        p.g = 0.9;
        break;
      case "stars":
        p.color = i % 2 ? "#ffe066" : kind.flesh;
        p.size = random(3.5, 6);
        p.g = 0.4;
        p.span = 0.8;
        break;
      case "confetti":
        p.color = CONFETTI[i % CONFETTI.length];
        p.size = random(3, 5);
        p.g = 0.3;
        p.span = 1.1;
        p.spin = random(-12, 12);
        break;
      default:
        p.shape = "drop";
    }
    out.push(p);
  }
  return out;
}

export function drawJuice(c: CanvasRenderingContext2D, particles: JuiceParticle[], theme: FruitTheme) {
  const soft = theme.style === "watercolor";
  for (const p of particles) {
    const life = Math.max(0, p.life);
    const alpha = life * (soft ? 0.6 : 0.8);
    const s = p.size * (soft ? 1.3 : 1);
    switch (p.shape) {
      case "glitter": {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillStyle = withAlpha(p.color, alpha);
        c.beginPath();
        c.moveTo(0, -s);
        c.lineTo(s * 0.6, 0);
        c.lineTo(0, s);
        c.lineTo(-s * 0.6, 0);
        c.closePath();
        c.fill();
        c.restore();
        break;
      }
      case "bubbles": {
        c.strokeStyle = withAlpha(p.color, alpha);
        c.lineWidth = 1.3;
        c.beginPath();
        c.arc(p.x, p.y, s, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = withAlpha("#ffffff", alpha * 0.8);
        c.beginPath();
        c.arc(p.x - s * 0.35, p.y - s * 0.35, s * 0.25, 0, Math.PI * 2);
        c.fill();
        break;
      }
      case "pixel-cubes": {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillStyle = withAlpha(p.color, alpha);
        c.fillRect(-s / 2, -s / 2, s, s);
        c.fillStyle = withAlpha("#ffffff", alpha * 0.35);
        c.fillRect(-s / 2, -s / 2, s, s * 0.3);
        c.restore();
        break;
      }
      case "petals": {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillStyle = withAlpha(p.color, alpha);
        c.beginPath();
        c.ellipse(0, 0, s, s * 0.5, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
        break;
      }
      case "stars": {
        c.fillStyle = withAlpha(p.color, alpha);
        starPath(c, p.x, p.y, s, 5, 0.45, p.rot);
        c.fill();
        break;
      }
      case "confetti": {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.scale(1, Math.cos(p.rot * 1.7));
        c.fillStyle = withAlpha(p.color, alpha);
        c.fillRect(-s / 2, -s * 0.22, s, s * 0.45);
        c.restore();
        break;
      }
      default: {
        c.fillStyle = withAlpha(p.color, alpha);
        c.beginPath();
        c.arc(p.x, p.y, s * Math.max(0.2, life), 0, Math.PI * 2);
        c.fill();
      }
    }
  }
}

export function makeSplat(theme: FruitTheme, x: number, y: number, kind: FruitKind): JuiceSplat {
  const shape = theme.juice;
  const count = shape === "glitter" ? 14 : shape === "confetti" ? 10 : shape === "default" ? 5 : 6;
  const color = shape === "ink" ? "#15121c" : shape === "petals" ? "#ffb3cb" : kind.flesh;
  return {
    x,
    y,
    color,
    life: 1,
    shape,
    blobs: Array.from({ length: count }, (_, i) => ({
      dx: random(-1, 1) * kind.radius * (shape === "glitter" ? 1.2 : 0.9),
      dy: random(-1, 1) * kind.radius * (shape === "glitter" ? 0.9 : 0.6),
      r: random(0.25, 0.55) * kind.radius * (shape === "glitter" ? 0.12 : shape === "default" || shape === "ink" ? 1 : 0.45),
      rot: random(0, Math.PI * 2),
      color: shape === "confetti" ? CONFETTI[i % CONFETTI.length] : color,
    })),
  };
}

/** Splats stay faint and short-lived so they never hide what's flying. */
export function drawSplats(c: CanvasRenderingContext2D, splats: JuiceSplat[], theme: FruitTheme) {
  const style = theme.style;
  for (const s of splats) {
    for (const blob of s.blobs) {
      const x = s.x + blob.dx;
      const y = s.y + blob.dy;
      switch (s.shape) {
        case "glitter":
          c.fillStyle = withAlpha(blob.color, 0.4 * s.life);
          c.fillRect(x, y, blob.r + 1, blob.r + 1);
          break;
        case "bubbles":
          c.strokeStyle = withAlpha(blob.color, 0.3 * s.life);
          c.lineWidth = 1.5;
          c.beginPath();
          c.arc(x, y, blob.r, 0, Math.PI * 2);
          c.stroke();
          break;
        case "pixel-cubes":
          c.fillStyle = withAlpha(blob.color, 0.22 * s.life);
          c.fillRect(x - blob.r / 2, y - blob.r / 2, blob.r, blob.r);
          break;
        case "petals":
          c.fillStyle = withAlpha(blob.color, 0.3 * s.life);
          c.beginPath();
          c.ellipse(x, y, blob.r, blob.r * 0.5, blob.rot, 0, Math.PI * 2);
          c.fill();
          break;
        case "stars":
          c.fillStyle = withAlpha(blob.color, 0.24 * s.life);
          starPath(c, x, y, blob.r, 5, 0.45, blob.rot);
          c.fill();
          break;
        case "confetti":
          c.save();
          c.translate(x, y);
          c.rotate(blob.rot);
          c.fillStyle = withAlpha(blob.color, 0.35 * s.life);
          c.fillRect(-blob.r / 2, -blob.r * 0.2, blob.r, blob.r * 0.4);
          c.restore();
          break;
        default: {
          const alpha = (s.shape === "ink" ? 0.26 : 0.16) * s.life;
          if (style === "watercolor") {
            const g = c.createRadialGradient(x, y, 0, x, y, blob.r * 1.3);
            g.addColorStop(0, withAlpha(s.color, alpha * 1.4));
            g.addColorStop(1, withAlpha(s.color, 0));
            c.fillStyle = g;
            c.fillRect(x - blob.r * 1.3, y - blob.r * 1.3, blob.r * 2.6, blob.r * 2.6);
          } else {
            c.fillStyle = withAlpha(s.color, alpha);
            c.beginPath();
            c.arc(x, y, blob.r, 0, Math.PI * 2);
            c.fill();
            if (style === "cartoon") {
              c.strokeStyle = withAlpha(INK, 0.2 * s.life);
              c.lineWidth = 2;
              c.stroke();
            }
          }
          if (s.shape === "ink") {
            c.fillStyle = withAlpha(s.color, alpha);
            c.beginPath();
            c.arc(x + blob.r * 1.3 * Math.cos(blob.rot), y + blob.r * 1.3 * Math.sin(blob.rot), blob.r * 0.18, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    }
  }
}
