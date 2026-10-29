import type { GameLook } from "@/lib/game-cosmetics";
import { mix, withAlpha } from "./engine";

/**
 * Tower Stacker cosmetics. Drawing only: block sizes, the slider, the perfect window and scoring
 * live in the game and never read the theme.
 *
 * Layering: block colors and material come first; the tower theme then shapes each slab (tinting
 * it toward its subject and adding face details); the scenery sits behind everything; perfect
 * effects play on top.
 */

export type StackerTheme = { key: string; blocks: string; theme: string; scenery: string; perfect: string };
type P3 = [number, number, number];
type Face = { id: "front" | "right" | "top"; len: number; at: (u: number, v: number) => P3 };
export type BlockSpec = { cx: number; cz: number; w: number; d: number; y0: number; y1: number; level: number; flash: number; alpha: number; top: boolean };
export type PerfectRing = { cx: number; cz: number; w: number; d: number; y: number; at: number; delay: number; reach: number };

const ISO = Math.cos(Math.PI / 6);

export function stackerTheme(look: GameLook): StackerTheme {
  const blocks = look.blocks ?? "default";
  const theme = look.theme ?? "default";
  const scenery = look.scenery ?? "default";
  const perfect = look.perfect ?? "default";
  return { key: `${blocks}|${theme}|${scenery}|${perfect}`, blocks, theme, scenery, perfect };
}

const rand = (i: number, salt = 0) => {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const proj = ([x, y, z]: P3): [number, number] => [(x - z) * ISO, (x + z) * 0.5 - y];

/** A soft pastel at hue `h` as hex (the color helpers work on hex and rgb). */
function pastel(h: number) {
  const s = 0.75;
  const l = 0.8;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function poly(c: CanvasRenderingContext2D, pts: P3[]) {
  c.beginPath();
  pts.forEach((p, i) => {
    const [sx, sy] = proj(p);
    if (i) c.lineTo(sx, sy);
    else c.moveTo(sx, sy);
  });
  c.closePath();
}

function line(c: CanvasRenderingContext2D, a: P3, b: P3) {
  const [ax, ay] = proj(a);
  const [bx, by] = proj(b);
  c.moveTo(ax, ay);
  c.lineTo(bx, by);
}

/** A face-local rectangle from (u0, v0) to (u1, v1). */
function rect(c: CanvasRenderingContext2D, f: Face, u0: number, v0: number, u1: number, v1: number) {
  poly(c, [f.at(u0, v0), f.at(u1, v0), f.at(u1, v1), f.at(u0, v1)]);
}

/** The base color of a level, before the tower theme tints it. */
export function blockColor(theme: StackerTheme, level: number) {
  const wave = (Math.sin(level * 0.28) + 1) / 2;
  switch (theme.blocks) {
    case "ocean":
      return mix("#5ee7df", "#1f5fae", wave);
    case "pastel":
      return pastel((level * 28) % 360);
    case "graphite":
      return mix("#a3abbd", "#3d4352", wave);
    case "wood":
      return level % 2 ? "#c68a4e" : "#a8693a";
    case "marble":
      return mix("#f4f1ea", "#d9d4ca", wave);
    case "metal":
      return level % 4 === 3 ? "#c9a227" : mix("#c5ced8", "#8d99a6", wave);
    case "glass":
      return mix("#9fe8ff", "#c7a6ff", wave);
    default:
      return mix("#ffb347", "#ff5e7e", wave);
  }
}

function themed(theme: StackerTheme, color: string) {
  switch (theme.theme) {
    case "pancakes":
      return mix(color, "#e0a458", 0.6);
    case "castle":
      return mix(color, "#a39e93", 0.55);
    case "cake":
      return mix(color, "#f3d19c", 0.6);
    default:
      return color;
  }
}

function materialDetail(c: CanvasRenderingContext2D, theme: StackerTheme, f: Face, level: number, scale: number) {
  const thin = 1 / scale;
  switch (theme.blocks) {
    case "wood": {
      c.strokeStyle = withAlpha("#3b2410", 0.28);
      c.lineWidth = 1.1 * thin;
      c.beginPath();
      for (let k = 0; k < 3; k += 1) {
        const v = 0.22 + k * 0.28 + (rand(level, k) - 0.5) * 0.1;
        let prev = f.at(0, v);
        for (let u = 0.1; u <= 1.001; u += 0.1) {
          const next = f.at(u, v + Math.sin(u * 7 + level + k) * 0.05);
          line(c, prev, next);
          prev = next;
        }
      }
      c.stroke();
      break;
    }
    case "marble": {
      c.strokeStyle = withAlpha("#7d7d8a", 0.4);
      c.lineWidth = 1.2 * thin;
      c.beginPath();
      for (let k = 0; k < 2; k += 1) {
        const u0 = rand(level * 3 + k, f.id.length);
        const u1 = rand(level * 5 + k, 2);
        line(c, f.at(u0, 0), f.at((u0 + u1) / 2 + 0.1, 0.5));
        line(c, f.at((u0 + u1) / 2 + 0.1, 0.5), f.at(u1, 1));
      }
      c.stroke();
      break;
    }
    case "metal": {
      c.strokeStyle = withAlpha("#ffffff", 0.16);
      c.lineWidth = thin;
      c.beginPath();
      for (let v = 0.12; v < 1; v += 0.14) line(c, f.at(0, v), f.at(1, v));
      c.stroke();
      break;
    }
    case "graphite":
      c.strokeStyle = withAlpha("#ffffff", 0.28);
      c.lineWidth = 1.4 * thin;
      c.beginPath();
      line(c, f.at(0, f.id === "top" ? 0.3 : 0.86), f.at(1, f.id === "top" ? 0.3 : 0.86));
      c.stroke();
      break;
    case "glass":
      c.strokeStyle = withAlpha("#ffffff", 0.45);
      c.lineWidth = 1.6 * thin;
      c.beginPath();
      line(c, f.at(0.15, 0.1), f.at(0.35, 0.9));
      line(c, f.at(0.3, 0.1), f.at(0.4, 0.5));
      c.stroke();
      break;
  }
}

function themeDetail(c: CanvasRenderingContext2D, theme: StackerTheme, f: Face, b: BlockSpec, color: string, scale: number) {
  const thin = 1 / scale;
  const side = f.id !== "top";
  switch (theme.theme) {
    case "books": {
      if (f.id === "front") {
        c.fillStyle = withAlpha("#ffe08a", 0.85);
        rect(c, f, 0.1, 0, 0.13, 1);
        c.fill();
        rect(c, f, 0.87, 0, 0.9, 1);
        c.fill();
        c.fillStyle = withAlpha("#ffffff", 0.35);
        rect(c, f, 0.36, 0.3, 0.64, 0.7);
        c.fill();
      } else if (f.id === "right") {
        c.fillStyle = "#f3ead2";
        rect(c, f, 0.02, 0.16, 0.98, 0.84);
        c.fill();
        c.strokeStyle = withAlpha("#a89a78", 0.6);
        c.lineWidth = 0.8 * thin;
        c.beginPath();
        for (const v of [0.33, 0.5, 0.67]) line(c, f.at(0.02, v), f.at(0.98, v));
        c.stroke();
      }
      break;
    }
    case "containers": {
      c.strokeStyle = withAlpha("#000000", 0.22);
      c.lineWidth = 1.4 * thin;
      c.beginPath();
      if (side) {
        const ribs = Math.max(2, Math.floor(f.len / 6));
        for (let i = 1; i < ribs; i += 1) line(c, f.at(i / ribs, 0.08), f.at(i / ribs, 0.92));
        line(c, f.at(0, 0.08), f.at(1, 0.08));
        line(c, f.at(0, 0.92), f.at(1, 0.92));
      } else {
        rect(c, f, 0.06, 0.06, 0.94, 0.94);
      }
      c.stroke();
      if (f.id === "right" && f.len > 30) {
        c.strokeStyle = withAlpha("#e8e8e8", 0.7);
        c.lineWidth = 1.6 * thin;
        c.beginPath();
        for (const u of [0.62, 0.78]) line(c, f.at(u, 0.15), f.at(u, 0.85));
        c.stroke();
      }
      break;
    }
    case "skyscraper": {
      if (side) {
        const count = Math.max(1, Math.floor(f.len / 9));
        for (let i = 0; i < count; i += 1) {
          const lit = rand(b.level * 31 + i, f.id === "front" ? 1 : 2) > 0.42;
          c.fillStyle = lit ? "#ffe08a" : "#26324d";
          const u = (i + 0.5) / count;
          const half = Math.min(0.35 / count, 3 / Math.max(1, f.len));
          rect(c, f, u - half, 0.22, u + half, 0.8);
          c.fill();
        }
      } else {
        c.strokeStyle = withAlpha("#000000", 0.25);
        c.lineWidth = 2 * thin;
        rect(c, f, 0.08, 0.08, 0.92, 0.92);
        c.stroke();
      }
      break;
    }
    case "toys": {
      if (side) {
        c.strokeStyle = withAlpha("#ffffff", 0.4);
        c.lineWidth = 1.4 * thin;
        c.beginPath();
        line(c, f.at(0, 0.9), f.at(1, 0.9));
        c.stroke();
        c.strokeStyle = withAlpha("#000000", 0.2);
        c.beginPath();
        line(c, f.at(0, 0.06), f.at(1, 0.06));
        c.stroke();
      }
      break;
    }
    case "pancakes": {
      if (side) {
        c.fillStyle = withAlpha("#7a4519", 0.55);
        c.beginPath();
        const steps = 10;
        const first = f.at(0, 0);
        const [sx, sy] = proj(first);
        c.moveTo(sx, sy);
        for (let i = 0; i <= steps; i += 1) {
          const [x, y] = proj(f.at(i / steps, 0.22 + Math.sin(i * 1.7 + b.level) * 0.06));
          c.lineTo(x, y);
        }
        const [ex, ey] = proj(f.at(1, 0));
        c.lineTo(ex, ey);
        c.closePath();
        c.fill();
        c.fillStyle = withAlpha(mix(color, "#ffffff", 0.45), 0.7);
        c.beginPath();
        const [tx, ty] = proj(f.at(0, 1));
        c.moveTo(tx, ty);
        for (let i = 0; i <= steps; i += 1) {
          const [x, y] = proj(f.at(i / steps, 0.8 + Math.sin(i * 2.3 + b.level) * 0.06));
          c.lineTo(x, y);
        }
        const [rx, ry] = proj(f.at(1, 1));
        c.lineTo(rx, ry);
        c.closePath();
        c.fill();
      }
      break;
    }
    case "castle": {
      c.strokeStyle = withAlpha("#2b2722", 0.35);
      c.lineWidth = 1.2 * thin;
      c.beginPath();
      if (side) {
        line(c, f.at(0, 0.5), f.at(1, 0.5));
        const bricks = Math.max(2, Math.round(f.len / 14));
        for (let i = 0; i <= bricks; i += 1) {
          const u = i / bricks;
          line(c, f.at(u, 0), f.at(u, 0.5));
          const u2 = (i + 0.5) / bricks;
          if (u2 < 1) line(c, f.at(u2, 0.5), f.at(u2, 1));
        }
      } else {
        rect(c, f, 0.1, 0.1, 0.9, 0.9);
      }
      c.stroke();
      break;
    }
    case "cake": {
      if (side) {
        c.fillStyle = "#fff6ea";
        rect(c, f, 0, 0.42, 1, 0.58);
        c.fill();
        // Frosting with drips over the top edge.
        const frosting = mix(blockColor(theme, b.level), "#ffffff", 0.35);
        c.fillStyle = frosting;
        c.beginPath();
        const [sx, sy] = proj(f.at(0, 1));
        c.moveTo(sx, sy);
        const drips = Math.max(3, Math.round(f.len / 10));
        for (let i = 0; i <= drips * 2; i += 1) {
          const u = i / (drips * 2);
          const v = i % 2 ? 0.62 - rand(b.level * 7 + i, f.id.length) * 0.12 : 0.82;
          const [x, y] = proj(f.at(u, v));
          c.lineTo(x, y);
        }
        const [ex, ey] = proj(f.at(1, 1));
        c.lineTo(ex, ey);
        c.closePath();
        c.fill();
      } else {
        c.fillStyle = mix(blockColor(theme, b.level), "#ffffff", 0.35);
        rect(c, f, 0, 0, 1, 1);
        c.fill();
      }
      break;
    }
  }
}

function smallBox(c: CanvasRenderingContext2D, cx: number, cz: number, w: number, d: number, y0: number, y1: number, color: string) {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - d / 2;
  const z1 = cz + d / 2;
  c.fillStyle = mix(color, "#000000", 0.12);
  poly(c, [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]]);
  c.fill();
  c.fillStyle = mix(color, "#000000", 0.32);
  poly(c, [[x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0]]);
  c.fill();
  c.fillStyle = mix(color, "#ffffff", 0.2);
  poly(c, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
  c.fill();
}

/** Decorations that sit on a slab's exposed top: studs, battlements, sprinkles, butter. */
function topDecor(c: CanvasRenderingContext2D, theme: StackerTheme, b: BlockSpec, color: string) {
  const y = b.y1;
  switch (theme.theme) {
    case "toys": {
      const nx = Math.max(1, Math.round(b.w / 25));
      const nz = Math.max(1, Math.round(b.d / 25));
      const r = Math.min(7, Math.min(b.w / nx, b.d / nz) * 0.28);
      for (let i = 0; i < nx; i += 1) {
        for (let k = 0; k < nz; k += 1) {
          const [sx, sy] = proj([b.cx - b.w / 2 + ((i + 0.5) * b.w) / nx, y, b.cz - b.d / 2 + ((k + 0.5) * b.d) / nz]);
          c.fillStyle = mix(color, "#000000", 0.25);
          c.beginPath();
          c.ellipse(sx, sy, r * 1.2, r * 0.6, 0, 0, Math.PI);
          c.rect(sx - r * 1.2, sy - 4, r * 2.4, 4);
          c.fill();
          c.fillStyle = mix(color, "#ffffff", 0.3);
          c.beginPath();
          c.ellipse(sx, sy - 4, r * 1.2, r * 0.6, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
      break;
    }
    case "castle": {
      const stone = themed(theme, color);
      const merlons: P3[] = [];
      const along = (n: number) => Math.max(2, Math.round(n / 16));
      const nx = along(b.w);
      const nz = along(b.d);
      for (let i = 0; i < nx; i += 2) {
        const x = b.cx - b.w / 2 + ((i + 0.5) * b.w) / nx;
        merlons.push([x, y, b.cz - b.d / 2 + 3], [x, y, b.cz + b.d / 2 - 3]);
      }
      for (let k = 0; k < nz; k += 2) {
        const z = b.cz - b.d / 2 + ((k + 0.5) * b.d) / nz;
        merlons.push([b.cx - b.w / 2 + 3, y, z], [b.cx + b.w / 2 - 3, y, z]);
      }
      merlons.sort((p, q) => p[0] + p[2] - (q[0] + q[2]));
      for (const [x, , z] of merlons) smallBox(c, x, z, 6, 6, y, y + 7, stone);
      break;
    }
    case "cake": {
      const colors = ["#ff5e7e", "#ffd166", "#4cc9f0", "#7ae582", "#b388ff"];
      for (let i = 0; i < 18; i += 1) {
        const [sx, sy] = proj([b.cx + (rand(i, 1) - 0.5) * b.w * 0.85, y, b.cz + (rand(i, 2) - 0.5) * b.d * 0.85]);
        c.save();
        c.translate(sx, sy);
        c.rotate(rand(i, 3) * Math.PI);
        c.fillStyle = colors[i % colors.length];
        c.fillRect(-2.2, -0.8, 4.4, 1.6);
        c.restore();
      }
      const [cx, cy] = proj([b.cx, y, b.cz]);
      c.fillStyle = "#d7263d";
      c.beginPath();
      c.arc(cx, cy - 5, 5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = withAlpha("#ffffff", 0.6);
      c.beginPath();
      c.arc(cx - 1.5, cy - 6.5, 1.4, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case "pancakes": {
      // Syrup pooled on top, then a pat of butter.
      c.fillStyle = withAlpha("#a0521a", 0.75);
      const pts: P3[] = [];
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const k = 0.32 + rand(i, 4) * 0.08;
        pts.push([b.cx + Math.cos(a) * b.w * k, y, b.cz + Math.sin(a) * b.d * k]);
      }
      poly(c, pts);
      c.fill();
      smallBox(c, b.cx, b.cz, Math.min(16, b.w * 0.3), Math.min(16, b.d * 0.3), y, y + 4, "#ffe680");
      break;
    }
  }
}

export function drawBlock(c: CanvasRenderingContext2D, theme: StackerTheme, b: BlockSpec, scale: number) {
  const raw = blockColor(theme, b.level);
  const color = themed(theme, raw);
  const h = b.y1 - b.y0;
  const x0 = b.cx - b.w / 2;
  const x1 = b.cx + b.w / 2;
  const z0 = b.cz - b.d / 2;
  const z1 = b.cz + b.d / 2;
  const faces: [Face, string][] = [
    [{ id: "front", len: b.w, at: (u, v) => [x0 + u * b.w, b.y0 + v * h, z1] }, mix(color, "#000000", 0.12)],
    [{ id: "right", len: b.d, at: (u, v) => [x1, b.y0 + v * h, z1 - u * b.d] }, mix(color, "#000000", 0.32)],
    [{ id: "top", len: b.w, at: (u, v) => [x0 + u * b.w, b.y1, z0 + v * b.d] }, mix(color, "#ffffff", 0.2)],
  ];
  const glass = theme.blocks === "glass";
  const detailed = theme.blocks !== "default" && theme.blocks !== "ocean" && theme.blocks !== "pastel";
  const themedFaces = theme.theme !== "default";
  c.save();
  if (b.alpha < 1) c.globalAlpha *= b.alpha;
  for (const [f, shade] of faces) {
    const fill = b.flash > 0 ? mix(shade, "#ffffff", b.flash) : shade;
    rect(c, f, 0, 0, 1, 1);
    c.fillStyle = glass ? withAlpha(fill, 0.5) : fill;
    c.fill();
    if (detailed || themedFaces) {
      c.save();
      c.clip();
      if (themedFaces) themeDetail(c, theme, f, b, color, scale);
      if (detailed) materialDetail(c, theme, f, b.level, scale);
      c.restore();
    }
    if (glass) {
      c.strokeStyle = withAlpha("#ffffff", 0.7);
      c.lineWidth = 1.2 / scale;
      rect(c, f, 0, 0, 1, 1);
      c.stroke();
    }
  }
  if (b.top) topDecor(c, theme, b, raw);
  c.restore();
}

// ---------------------------------------------------------------------------------------------
// Scenery: drawn in screen space; parts of it sink as the tower (and camera) rises.
// ---------------------------------------------------------------------------------------------

export function sceneryInk(theme: StackerTheme) {
  return theme.scenery === "day" || theme.scenery === "ocean-view" ? "#1d2b4a" : "#f4f1ff";
}

export function pedestalColor(theme: StackerTheme) {
  switch (theme.scenery) {
    case "day":
      return "#5f8a46";
    case "sunset":
      return "#5b3a4a";
    case "ocean-view":
      return "#d8c49a";
    case "night":
      return "#2a3050";
    case "city":
      return "#3a3a4a";
    case "aurora":
      return "#2c4a52";
    case "space":
      return "#5a5a6e";
    default:
      return mix("#2c3b66", "#ffb347", 0.18);
  }
}

function stars(c: CanvasRenderingContext2D, cw: number, ch: number, count: number, drift: number, now: number) {
  for (let i = 0; i < count; i += 1) {
    const twinkle = now ? 0.5 + 0.5 * Math.sin(now / 500 + i * 1.3) : 0.8;
    c.fillStyle = withAlpha("#ffffff", 0.25 + twinkle * 0.6 * rand(i, 9));
    const y = (((rand(i, 2) * ch + drift) % ch) + ch) % ch;
    const s = i % 11 ? 1.4 : 2.4;
    c.fillRect(rand(i, 1) * cw, y, s, s);
  }
}

function ridge(c: CanvasRenderingContext2D, cw: number, base: number, amp: number, seed: number, color: string, ch: number) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, ch);
  for (let x = 0; x <= cw + 40; x += 40) {
    c.lineTo(x, base - amp * (0.4 + rand(Math.floor(x / 40), seed) * 0.6));
  }
  c.lineTo(cw, ch);
  c.closePath();
  c.fill();
}

export function drawScenery(c: CanvasRenderingContext2D, theme: StackerTheme, cw: number, ch: number, camera: number, now: number, animate: boolean) {
  const lift = Math.min(1, camera / 2400);
  const t = animate ? now : 0;
  const gradient = (stops: [number, string][]) => {
    const g = c.createLinearGradient(0, 0, 0, ch);
    for (const [at, color] of stops) g.addColorStop(at, color);
    c.fillStyle = g;
    c.fillRect(0, 0, cw, ch);
  };
  switch (theme.scenery) {
    case "day": {
      gradient([[0, mix("#3e8ff0", "#1d4fa8", lift)], [1, "#bfe6ff"]]);
      for (let i = 0; i < 6; i += 1) {
        const x = ((rand(i, 1) * (cw + 220) + t * 0.01 * (0.5 + rand(i, 2))) % (cw + 220)) - 110;
        const y = ((rand(i, 3) * ch + camera * 0.25) % (ch + 120)) - 60;
        const s = 0.7 + rand(i, 4) * 0.6;
        c.fillStyle = withAlpha("#ffffff", 0.85);
        c.beginPath();
        c.arc(x, y, 22 * s, 0, Math.PI * 2);
        c.arc(x + 24 * s, y + 6 * s, 18 * s, 0, Math.PI * 2);
        c.arc(x - 24 * s, y + 8 * s, 15 * s, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case "sunset": {
      gradient([[0, "#2b1846"], [0.55, "#c4506a"], [1, "#feb47b"]]);
      c.fillStyle = withAlpha("#ffe3a3", 0.9);
      c.beginPath();
      c.arc(cw * 0.7, ch * 0.72 + camera * 0.08, 46, 0, Math.PI * 2);
      c.fill();
      ridge(c, cw, ch - 90 + camera * 0.2, 120, 1, "#7a3558", ch + camera);
      ridge(c, cw, ch - 30 + camera * 0.35, 90, 2, "#3a1c3a", ch + camera);
      break;
    }
    case "ocean-view": {
      gradient([[0, mix("#c9e4ff", "#6a8fd8", lift)], [0.7, "#ffd6e0"], [1, "#ffe9d6"]]);
      const horizon = ch * 0.78 + camera * 0.25;
      if (horizon < ch) {
        const sea = c.createLinearGradient(0, horizon, 0, ch);
        sea.addColorStop(0, "#5fa8d3");
        sea.addColorStop(1, "#2c6e9e");
        c.fillStyle = sea;
        c.fillRect(0, horizon, cw, ch - horizon);
        c.strokeStyle = withAlpha("#ffffff", 0.5);
        c.lineWidth = 2;
        c.beginPath();
        for (let i = 0; i < 10; i += 1) {
          const x = (rand(i, 1) * cw + Math.sin(t / 900 + i) * 16 + cw) % cw;
          const y = horizon + 8 + rand(i, 2) * (ch - horizon);
          c.moveTo(x, y);
          c.lineTo(x + 20, y);
        }
        c.stroke();
      }
      break;
    }
    case "night": {
      gradient([[0, "#070b24"], [1, "#1f2a5a"]]);
      stars(c, cw, ch, 90, camera * 0.05, t);
      c.fillStyle = "#fff4d0";
      c.beginPath();
      c.arc(cw * 0.78, ch * 0.18, 28, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#0d1433";
      c.beginPath();
      c.arc(cw * 0.78 + 12, ch * 0.18 - 6, 25, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case "city": {
      gradient([[0, "#1a1240"], [0.6, "#3a2a6a"], [1, "#ff8a65"]]);
      stars(c, cw, ch, 30, camera * 0.05, t);
      const base = ch + camera * 0.3;
      if (base - 220 < ch) {
        for (let i = 0, x = -10; x < cw; i += 1) {
          const bw = 40 + rand(i, 1) * 50;
          const bh = 90 + rand(i, 2) * 150;
          c.fillStyle = i % 2 ? "#1d1838" : "#251f45";
          c.fillRect(x, base - bh, bw - 4, bh);
          for (let wy = base - bh + 10; wy < base - 10; wy += 16) {
            for (let wx = x + 6; wx < x + bw - 12; wx += 11) {
              if (rand(wx * 7 + wy, i) > 0.55) {
                c.fillStyle = withAlpha("#ffd27a", 0.85);
                c.fillRect(wx, wy, 5, 7);
              }
            }
          }
          x += bw;
        }
      }
      break;
    }
    case "aurora": {
      gradient([[0, "#03121e"], [1, "#0b3a4a"]]);
      stars(c, cw, ch, 60, camera * 0.05, t);
      const bands = ["#3dffb0", "#3dd6ff", "#b46bff"];
      c.lineCap = "round";
      for (let i = 0; i < bands.length; i += 1) {
        c.beginPath();
        for (let x = -20; x <= cw + 20; x += 20) {
          const y = ch * (0.22 + i * 0.09) + Math.sin(x / 120 + t / 1500 + i * 1.7) * 22 + Math.sin(x / 47 + t / 900) * 6;
          if (x === -20) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.strokeStyle = withAlpha(bands[i], 0.12);
        c.lineWidth = 40;
        c.stroke();
        c.strokeStyle = withAlpha(bands[i], 0.3);
        c.lineWidth = 8;
        c.stroke();
      }
      break;
    }
    case "space": {
      gradient([[0, "#02010a"], [1, "#0b0b24"]]);
      stars(c, cw, ch, 120, camera * 0.04, t);
      const px = cw * 0.2;
      const py = ch * 0.28;
      const planet = c.createRadialGradient(px - 14, py - 14, 6, px, py, 46);
      planet.addColorStop(0, "#ffcf8a");
      planet.addColorStop(1, "#8a4a7a");
      c.fillStyle = planet;
      c.beginPath();
      c.arc(px, py, 40, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = withAlpha("#f4d9ff", 0.6);
      c.lineWidth = 4;
      c.beginPath();
      c.ellipse(px, py, 70, 14, -0.35, 0, Math.PI * 2);
      c.stroke();
      // The atmosphere fades away as the tower climbs.
      const air = c.createLinearGradient(0, ch * 0.4, 0, ch);
      air.addColorStop(0, withAlpha("#3e8ff0", 0));
      air.addColorStop(1, withAlpha("#3e8ff0", 0.65 * (1 - lift)));
      c.fillStyle = air;
      c.fillRect(0, 0, cw, ch);
      break;
    }
    default:
      gradient([
        [0, mix("#1b2647", "#ff5e7e", 0.08 + lift * 0.14)],
        [0.6, "#1b2647"],
        [1, mix("#1b2647", "#2c3b66", 0.8)],
      ]);
  }
}

// ---------------------------------------------------------------------------------------------
// Perfect-placement effects. `t` runs 0 → 1 over `perfectDuration`.
// ---------------------------------------------------------------------------------------------

export function perfectDuration(theme: StackerTheme) {
  switch (theme.perfect) {
    case "hearts":
    case "confetti":
      return 900;
    case "fireworks":
      return 1000;
    case "sparkles":
    case "stars":
      return 700;
    default:
      return 520;
  }
}

function outline(c: CanvasRenderingContext2D, cx: number, cz: number, w: number, d: number, y: number) {
  poly(c, [
    [cx - w / 2, y, cz - d / 2],
    [cx + w / 2, y, cz - d / 2],
    [cx + w / 2, y, cz + d / 2],
    [cx - w / 2, y, cz + d / 2],
  ]);
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, points: number, inner: number, rot: number) {
  c.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = rot + (i * Math.PI) / points;
    const d = i % 2 ? r * inner : r;
    if (i === 0) c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    else c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  c.closePath();
}

function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.beginPath();
  c.moveTo(x, y + s * 0.35);
  c.bezierCurveTo(x - s * 1.1, y - s * 0.4, x - s * 0.4, y - s * 1.1, x, y - s * 0.45);
  c.bezierCurveTo(x + s * 0.4, y - s * 1.1, x + s * 1.1, y - s * 0.4, x, y + s * 0.35);
  c.closePath();
}

/** A point on the ring's top outline, `k` from 0 to 1 around the perimeter. */
function perimeter(r: PerfectRing, k: number, grow = 0): P3 {
  const w = r.w + grow * 2;
  const d = r.d + grow * 2;
  const total = 2 * (w + d);
  let s = (((k % 1) + 1) % 1) * total;
  const x0 = r.cx - w / 2;
  const z0 = r.cz - d / 2;
  if (s < w) return [x0 + s, r.y, z0];
  s -= w;
  if (s < d) return [x0 + w, r.y, z0 + s];
  s -= d;
  if (s < w) return [x0 + w - s, r.y, z0 + d];
  s -= w;
  return [x0, r.y, z0 + d - s];
}

const CONFETTI = ["#ff5e7e", "#ffd166", "#4cc9f0", "#7ae582", "#b388ff"];

export function drawPerfect(c: CanvasRenderingContext2D, theme: StackerTheme, ring: PerfectRing, t: number, full: boolean, scale: number) {
  const seed = Math.round(ring.at + ring.delay);
  const ease = 1 - (1 - t) ** 3;
  const thin = 1 / scale;
  switch (theme.perfect) {
    case "sparkles": {
      const count = full ? 10 : 5;
      for (let i = 0; i < count; i += 1) {
        const [sx, sy] = proj(perimeter(ring, rand(seed + i, 1), 4 + rand(i, 2) * 8));
        const pop = Math.sin(Math.min(1, t * 1.3 + rand(i, 3) * 0.2) * Math.PI);
        c.fillStyle = withAlpha(i % 3 ? "#fff7c2" : "#ffffff", Math.max(0, pop));
        star(c, sx, sy - 4 - rand(i, 4) * 10, 2 + pop * 5, 4, 0.28, 0);
        c.fill();
      }
      break;
    }
    case "hearts": {
      const count = full ? 7 : 3;
      for (let i = 0; i < count; i += 1) {
        const [sx, sy] = proj([ring.cx + (rand(seed + i, 1) - 0.5) * ring.w, ring.y, ring.cz + (rand(seed + i, 2) - 0.5) * ring.d]);
        c.fillStyle = withAlpha(i % 2 ? "#ff6b9a" : "#ff9fbd", 1 - t);
        heart(c, sx + Math.sin(t * 6 + i) * 4, sy - ease * (30 + rand(i, 3) * 25), 5 + rand(i, 4) * 3);
        c.fill();
      }
      break;
    }
    case "stars": {
      const count = full ? 10 : 5;
      for (let i = 0; i < count; i += 1) {
        const k = (i + rand(seed, 1)) / count;
        const [sx, sy] = proj(perimeter(ring, k, ring.reach * 1.6 * ease));
        c.fillStyle = withAlpha(i % 2 ? "#ffd166" : "#ffffff", 1 - t);
        star(c, sx, sy - ease * 8, 4 + (1 - t) * 3, 5, 0.45, t * 4 + i);
        c.fill();
      }
      break;
    }
    case "confetti": {
      const count = full ? 22 : 10;
      const [ox, oy] = proj([ring.cx, ring.y, ring.cz]);
      for (let i = 0; i < count; i += 1) {
        const a = rand(seed + i, 1) * Math.PI * 2;
        const v = 40 + rand(i, 2) * 50;
        const x = ox + Math.cos(a) * v * t * 1.4;
        const y = oy - (70 + rand(i, 3) * 40) * t + 110 * t * t;
        c.save();
        c.translate(x, y);
        c.rotate(t * 10 + i);
        c.scale(1, Math.cos(t * 14 + i));
        c.fillStyle = withAlpha(CONFETTI[i % CONFETTI.length], Math.min(1, (1 - t) * 2));
        c.fillRect(-3, -1.5, 6, 3);
        c.restore();
      }
      break;
    }
    case "shockwave": {
      if (t < 0.3) {
        c.fillStyle = withAlpha("#ffffff", (1 - t / 0.3) * 0.7);
        outline(c, ring.cx, ring.cz, ring.w, ring.d, ring.y);
        c.fill();
      }
      const grow = (full ? ring.reach * 3 : ring.reach) * ease;
      c.lineWidth = (full ? 5 : 3) * thin;
      c.strokeStyle = withAlpha("#bfe9ff", (1 - t) * 0.8);
      outline(c, ring.cx, ring.cz, ring.w + grow * 2, ring.d + grow * 2, ring.y);
      c.stroke();
      c.lineWidth = 1.5 * thin;
      c.strokeStyle = withAlpha("#ffffff", (1 - t) * 0.9);
      outline(c, ring.cx, ring.cz, ring.w + grow * 1.2, ring.d + grow * 1.2, ring.y);
      c.stroke();
      break;
    }
    case "lightning": {
      const tick = Math.floor(t * 14);
      const bolts = full ? 4 : 2;
      for (let b = 0; b < bolts; b += 1) {
        c.beginPath();
        const start = (b + rand(seed, b)) / bolts;
        for (let i = 0; i <= 8; i += 1) {
          const k = start + (i / 8) * 0.22;
          const [sx, sy] = proj(perimeter(ring, k, 3 + rand(i + tick * 9, b) * 6));
          const jitter = (rand(i * 13 + tick, b + 5) - 0.5) * 10;
          if (i === 0) c.moveTo(sx, sy + jitter);
          else c.lineTo(sx, sy + jitter);
        }
        c.strokeStyle = withAlpha("#7df9ff", (1 - t) * 0.35);
        c.lineWidth = 6 * thin;
        c.stroke();
        c.strokeStyle = withAlpha("#e8fdff", 1 - t);
        c.lineWidth = 1.8 * thin;
        c.stroke();
      }
      break;
    }
    case "fireworks": {
      const [ox, oy] = proj([ring.cx, ring.y, ring.cz]);
      const bursts = full ? 2 : 1;
      for (let b = 0; b < bursts; b += 1) {
        const bx = ox + (rand(seed, b + 1) - 0.5) * 80;
        const launch = Math.min(1, t / 0.3);
        const by = oy - 40 - launch * (60 + rand(seed, b + 3) * 40);
        const color = CONFETTI[(seed + b) % CONFETTI.length];
        if (t < 0.3) {
          c.strokeStyle = withAlpha("#ffe9a8", 0.8);
          c.lineWidth = 2 * thin;
          c.beginPath();
          c.moveTo(bx, oy - 40);
          c.lineTo(bx, by);
          c.stroke();
          continue;
        }
        const p = (t - 0.3) / 0.7;
        const reach = (1 - (1 - p) ** 2) * 50;
        for (let i = 0; i < 14; i += 1) {
          const a = (i / 14) * Math.PI * 2;
          const x = bx + Math.cos(a) * reach;
          const y = by + Math.sin(a) * reach + p * p * 18;
          c.strokeStyle = withAlpha(color, (1 - p) * 0.6);
          c.lineWidth = 1.5 * thin;
          c.beginPath();
          c.moveTo(bx + Math.cos(a) * reach * 0.6, by + Math.sin(a) * reach * 0.6 + p * p * 12);
          c.lineTo(x, y);
          c.stroke();
          c.fillStyle = withAlpha(i % 2 ? "#ffffff" : color, 1 - p);
          c.beginPath();
          c.arc(x, y, 2.2, 0, Math.PI * 2);
          c.fill();
        }
      }
      break;
    }
    default: {
      const grow = full ? ring.reach * ease : 4;
      c.lineWidth = (full ? 2.2 : 1.6) * thin;
      c.strokeStyle = withAlpha("#ffffff", (1 - t) * 0.85);
      outline(c, ring.cx, ring.cz, ring.w + grow * 2, ring.d + grow * 2, ring.y);
      c.stroke();
    }
  }
}
