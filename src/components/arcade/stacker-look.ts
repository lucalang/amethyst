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

export type StackerStyle = "" | "voxel" | "toon" | "papercraft" | "low-poly" | "hologram";
const STYLES: StackerStyle[] = ["voxel", "toon", "papercraft", "low-poly", "hologram"];
export type StackerTheme = { key: string; blocks: string; theme: string; scenery: string; perfect: string; style: StackerStyle };
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
  const style = STYLES.find((entry) => entry === look.style) ?? "";
  return { key: `${blocks}|${theme}|${scenery}|${perfect}|${style}`, blocks, theme, scenery, perfect, style };
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
    case "terracotta":
      return mix("#d9774a", "#b5523a", wave);
    case "jade":
      return mix("#3fa77a", "#1f6a52", wave);
    case "opal":
      return mix("#eef2f6", "#dfe6f0", wave);
    default:
      return mix("#ffb347", "#ff5e7e", wave);
  }
}

function themed(theme: StackerTheme, color: string) {
  switch (theme.theme) {
    case "pancakes":
      return mix(color, "#e0a458", 0.6);
    case "sushi":
      return mix(color, "#f6f2e8", 0.75);
    case "timber":
      return mix(color, "#c9945a", 0.55);
    case "pagoda":
      return mix(color, "#c23a2a", 0.45);
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
    case "terracotta": {
      // Ridges pressed in by the potter's fingers, and a dusty bloom.
      c.strokeStyle = withAlpha("#6a2a14", 0.25);
      c.lineWidth = 1.4 * thin;
      c.beginPath();
      for (let v = 0.2; v < 1; v += 0.3) line(c, f.at(0, v), f.at(1, v + 0.02));
      c.stroke();
      c.fillStyle = withAlpha("#f4dcc0", 0.18);
      for (let k = 0; k < 5; k += 1) {
        const u = rand(level * 9 + k, 3);
        const v = rand(level * 11 + k, 4);
        rect(c, f, u, v, u + 0.06, v + 0.12);
        c.fill();
      }
      break;
    }
    case "jade": {
      c.strokeStyle = withAlpha("#c8f0d8", 0.4);
      c.lineWidth = 1.2 * thin;
      c.beginPath();
      // Carved cloud scrolls: little spirals marching along the face.
      const count = Math.max(1, Math.round(f.len / 26));
      for (let i = 0; i < count; i += 1) {
        const u0 = (i + 0.5) / count;
        let prev = f.at(u0, 0.5);
        for (let a = 0; a < Math.PI * 3; a += 0.5) {
          const rr = 0.04 + a * 0.012;
          const next = f.at(u0 + Math.cos(a) * rr * (24 / Math.max(24, f.len)) * 3, 0.5 + Math.sin(a) * rr * 2.2);
          line(c, prev, next);
          prev = next;
        }
      }
      c.stroke();
      break;
    }
    case "opal": {
      const fire = ["#ff7ab8", "#6ae0ff", "#9cff8a", "#ffd36a", "#b48cff"];
      for (let k = 0; k < 7; k += 1) {
        const u = rand(level * 13 + k, f.id.length);
        const v = rand(level * 17 + k, 5);
        c.fillStyle = withAlpha(fire[(level + k) % fire.length], 0.45);
        rect(c, f, u, v, Math.min(1, u + 0.09), Math.min(1, v + 0.18));
        c.fill();
      }
      break;
    }
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
    case "sushi": {
      if (side) {
        // A nori band round the middle, rice grains above and below.
        c.fillStyle = "#1f2a22";
        rect(c, f, 0, 0.3, 1, 0.62);
        c.fill();
        c.fillStyle = withAlpha("#4a6a4a", 0.5);
        rect(c, f, 0, 0.44, 1, 0.48);
        c.fill();
        c.fillStyle = withAlpha("#ffffff", 0.8);
        for (let i = 0; i < Math.round(f.len / 5); i += 1) {
          const u = rand(b.level * 7 + i, f.id.length);
          const v = rand(b.level * 3 + i, 7) > 0.5 ? 0.7 + rand(i, 8) * 0.25 : 0.05 + rand(i, 9) * 0.2;
          rect(c, f, u, v, u + 2 / Math.max(10, f.len), v + 0.06);
          c.fill();
        }
      }
      break;
    }
    case "timber": {
      // Three planks per layer, running across on odd layers and along on even ones.
      const across = b.level % 2 === 0;
      c.strokeStyle = withAlpha("#4a2a10", 0.45);
      c.lineWidth = 1.4 * thin;
      c.beginPath();
      if (f.id === "top") {
        for (const k of [1 / 3, 2 / 3]) {
          if (across) line(c, f.at(k, 0), f.at(k, 1));
          else line(c, f.at(0, k), f.at(1, k));
        }
      } else if ((f.id === "front") === across) {
        for (const k of [1 / 3, 2 / 3]) line(c, f.at(k, 0), f.at(k, 1));
      }
      c.stroke();
      c.strokeStyle = withAlpha("#4a2a10", 0.18);
      c.lineWidth = thin;
      c.beginPath();
      for (let k = 0; k < 3; k += 1) {
        const v = 0.25 + k * 0.25;
        line(c, f.at(0.05, v), f.at(0.95, v + (rand(b.level, k) - 0.5) * 0.1));
      }
      c.stroke();
      break;
    }
    case "pagoda": {
      if (side) {
        // Tiled eaves along the top, red pillars and paper screens below.
        c.fillStyle = "#2f3a3a";
        rect(c, f, 0, 0.66, 1, 1);
        c.fill();
        c.strokeStyle = withAlpha("#8aa0a0", 0.5);
        c.lineWidth = thin;
        c.beginPath();
        const tilesN = Math.max(3, Math.round(f.len / 5));
        for (let i = 1; i < tilesN; i += 1) line(c, f.at(i / tilesN, 0.66), f.at(i / tilesN, 1));
        c.stroke();
        c.fillStyle = withAlpha("#f6ead0", 0.85);
        const bays = Math.max(1, Math.round(f.len / 22));
        for (let i = 0; i < bays; i += 1) {
          rect(c, f, (i + 0.2) / bays, 0.1, (i + 0.8) / bays, 0.58);
          c.fill();
        }
      } else {
        c.fillStyle = "#2f3a3a";
        rect(c, f, 0, 0, 1, 1);
        c.fill();
        c.strokeStyle = withAlpha("#d4a24a", 0.8);
        c.lineWidth = 1.5 * thin;
        rect(c, f, 0.12, 0.12, 0.88, 0.88);
        c.stroke();
      }
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
    case "sushi": {
      // A slice of fish draped over the top, with its fat lines.
      const fish = ["#ff8a5c", "#e84a5f", "#ffb07a"][b.level % 3];
      const pts: P3[] = [];
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * Math.PI * 2;
        pts.push([b.cx + Math.cos(a) * b.w * 0.42, y + 2, b.cz + Math.sin(a) * b.d * 0.3]);
      }
      c.fillStyle = fish;
      poly(c, pts);
      c.fill();
      c.strokeStyle = withAlpha("#ffffff", 0.6);
      c.lineWidth = 1.2;
      c.beginPath();
      for (const k of [-0.2, 0, 0.2]) line(c, [b.cx + k * b.w - b.w * 0.1, y + 2, b.cz - b.d * 0.2], [b.cx + k * b.w + b.w * 0.1, y + 2, b.cz + b.d * 0.2]);
      c.stroke();
      break;
    }
    case "pagoda": {
      // A little finial spire on the top floor.
      const [cx, cy] = proj([b.cx, y, b.cz]);
      c.fillStyle = "#d4a24a";
      c.fillRect(cx - 1.5, cy - 18, 3, 18);
      for (const k of [6, 11]) {
        c.beginPath();
        c.ellipse(cx, cy - k, 4, 1.6, 0, 0, Math.PI * 2);
        c.fill();
      }
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

/** The art style's treatment of one face, after its colors and details. */
function styleFace(c: CanvasRenderingContext2D, style: StackerStyle, f: Face, fill: string, h: number, b: BlockSpec, scale: number) {
  const thin = 1 / scale;
  const across = f.id === "top" ? b.d : h;
  c.save();
  rect(c, f, 0, 0, 1, 1);
  c.clip();
  switch (style) {
    case "voxel": {
      const nu = Math.max(2, Math.round(f.len / 7));
      const nv = Math.max(1, Math.round(across / 7));
      for (let i = 0; i < nu; i += 1)
        for (let k = 0; k < nv; k += 1) {
          const v = rand(b.level * 97 + i * 13 + k, f.id.length);
          if (v > 0.55) continue;
          c.fillStyle = v < 0.25 ? withAlpha("#ffffff", 0.12) : withAlpha("#000000", 0.1);
          rect(c, f, i / nu, k / nv, (i + 1) / nu, (k + 1) / nv);
          c.fill();
        }
      c.strokeStyle = withAlpha("#000000", 0.2);
      c.lineWidth = thin;
      c.beginPath();
      for (let i = 1; i < nu; i += 1) line(c, f.at(i / nu, 0), f.at(i / nu, 1));
      for (let k = 1; k < nv; k += 1) line(c, f.at(0, k / nv), f.at(1, k / nv));
      c.stroke();
      break;
    }
    case "toon": {
      if (f.id !== "top") {
        c.fillStyle = withAlpha("#ffffff", 0.28);
        rect(c, f, 0, 0.78, 1, 0.9);
        c.fill();
      } else {
        c.fillStyle = withAlpha("#ffffff", 0.7);
        rect(c, f, 0.08, 0.1, 0.16, 0.18);
        c.fill();
      }
      break;
    }
    case "papercraft": {
      c.strokeStyle = withAlpha("#ffffff", 0.65);
      c.lineWidth = 1.2 * thin;
      c.setLineDash([3 * thin, 2.5 * thin]);
      c.beginPath();
      rect(c, f, 0.06, 0.12, 0.94, 0.88);
      c.stroke();
      c.setLineDash([]);
      c.strokeStyle = withAlpha("#5a4630", 0.1);
      c.beginPath();
      for (let k = 0; k < 4; k += 1) line(c, f.at(rand(b.level + k, 1), 0), f.at(rand(b.level + k, 2), 1));
      c.stroke();
      break;
    }
    case "low-poly": {
      const nu = Math.max(2, Math.round(f.len / 20));
      for (let i = 0; i < nu; i += 1) {
        for (const tri of [0, 1]) {
          const v = rand(b.level * 31 + i * 7 + tri, f.id.length + 3);
          c.fillStyle = v > 0.5 ? withAlpha("#ffffff", (v - 0.5) * 0.4) : withAlpha("#000000", (0.5 - v) * 0.3);
          const u0 = i / nu;
          const u1 = (i + 1) / nu;
          const jag = (rand(b.level + i, 9) - 0.5) * 0.3 / nu;
          poly(c, tri ? [f.at(u0, 0), f.at(u1 + jag, 0), f.at(u0 - jag, 1)] : [f.at(u1 + jag, 0), f.at(u1, 1), f.at(u0 - jag, 1)]);
          c.fill();
        }
      }
      c.strokeStyle = withAlpha("#ffffff", 0.22);
      c.lineWidth = thin;
      c.beginPath();
      for (let i = 1; i <= nu; i += 1) line(c, f.at(i / nu, 0), f.at((i - 1) / nu, 1));
      c.stroke();
      break;
    }
    case "hologram": {
      c.strokeStyle = withAlpha(mix(fill, "#ffffff", 0.5), 0.25);
      c.lineWidth = thin;
      c.beginPath();
      const lines = Math.max(2, Math.round(across / 3));
      for (let k = 1; k < lines; k += 1) line(c, f.at(0, k / lines), f.at(1, k / lines));
      c.stroke();
      break;
    }
  }
  c.restore();
  // Edges are drawn outside the clip so outlines sit on top of the face.
  if (style === "toon") {
    c.strokeStyle = "#16121e";
    c.lineWidth = 2.2 * thin;
    c.lineJoin = "round";
    rect(c, f, 0, 0, 1, 1);
    c.stroke();
  } else if (style === "papercraft") {
    c.strokeStyle = withAlpha(mix(fill, "#000000", 0.4), 0.6);
    c.lineWidth = thin;
    rect(c, f, 0, 0, 1, 1);
    c.stroke();
  } else if (style === "hologram") {
    const glow = mix(fill, "#ffffff", 0.35);
    c.strokeStyle = withAlpha(glow, 0.25);
    c.lineWidth = 5 * thin;
    rect(c, f, 0, 0, 1, 1);
    c.stroke();
    c.strokeStyle = glow;
    c.lineWidth = 1.4 * thin;
    c.stroke();
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
  const style = theme.style;
  for (const [f, shade] of faces) {
    const fill = b.flash > 0 ? mix(shade, "#ffffff", b.flash) : shade;
    rect(c, f, 0, 0, 1, 1);
    c.fillStyle = style === "hologram" ? withAlpha(fill, 0.22) : glass ? withAlpha(fill, 0.5) : fill;
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
    if (style) styleFace(c, style, f, fill, h, b, scale);
  }
  if (b.top) topDecor(c, theme, b, raw);
  c.restore();
}

// ---------------------------------------------------------------------------------------------
// Scenery: drawn in screen space; parts of it sink as the tower (and camera) rises.
// ---------------------------------------------------------------------------------------------

export function sceneryInk(theme: StackerTheme) {
  return theme.scenery === "day" || theme.scenery === "ocean-view" || theme.scenery === "candy-clouds" ? "#1d2b4a" : "#f4f1ff";
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
    case "savanna":
      return "#8a5a2a";
    case "candy-clouds":
      return "#f2a8c8";
    case "storm":
      return "#3a4048";
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
    case "savanna": {
      gradient([[0, mix("#f6a04a", "#6a2a4a", lift)], [0.7, "#ffcf7a"], [1, "#ffe6b0"]]);
      c.fillStyle = withAlpha("#fff0c0", 0.95);
      c.beginPath();
      c.arc(cw * 0.5, ch * 0.78 + camera * 0.15, 90, 0, Math.PI * 2);
      c.fill();
      const ground = ch - 40 + camera * 0.3;
      if (ground - 90 < ch) {
        c.fillStyle = "#3a2414";
        c.fillRect(0, ground, cw, ch - ground + 4);
        for (let i = 0; i < 4; i += 1) {
          // Acacias: a thin trunk and a flat umbrella crown.
          const x = cw * (0.1 + i * 0.27) + rand(i, 3) * 30;
          const th = 50 + rand(i, 4) * 30;
          c.strokeStyle = "#3a2414";
          c.lineWidth = 4;
          c.beginPath();
          c.moveTo(x, ground);
          c.lineTo(x + 6, ground - th);
          c.moveTo(x + 3, ground - th * 0.5);
          c.lineTo(x - 14, ground - th + 4);
          c.stroke();
          c.fillStyle = "#3a2414";
          c.beginPath();
          c.ellipse(x + 2, ground - th - 4, 36 + rand(i, 5) * 12, 9, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.strokeStyle = withAlpha("#3a2414", 0.7);
      c.lineWidth = 1.8;
      for (let i = 0; i < 5; i += 1) {
        const x = ((rand(i, 6) * cw + t * 0.03 * (0.8 + rand(i, 7))) % (cw + 60)) - 30;
        const y = ch * (0.18 + rand(i, 8) * 0.25) + Math.sin(t / 400 + i) * 3;
        const flap = Math.sin(t / 120 + i) * 3;
        c.beginPath();
        c.moveTo(x - 6, y - flap);
        c.quadraticCurveTo(x - 3, y - 3, x, y);
        c.quadraticCurveTo(x + 3, y - 3, x + 6, y - flap);
        c.stroke();
      }
      break;
    }
    case "candy-clouds": {
      gradient([[0, mix("#ffb3d9", "#b48cff", lift)], [1, "#ffe8f2"]]);
      for (let i = 0; i < 7; i += 1) {
        const x = ((rand(i, 1) * (cw + 200) + t * 0.008 * (0.5 + rand(i, 2))) % (cw + 200)) - 100;
        const y = ((rand(i, 3) * ch + camera * 0.25) % (ch + 120)) - 60;
        const s = 0.6 + rand(i, 4) * 0.6;
        c.fillStyle = i % 2 ? "#ffd1ea" : "#d8e6ff";
        c.beginPath();
        c.arc(x, y, 24 * s, 0, Math.PI * 2);
        c.arc(x + 26 * s, y + 4 * s, 20 * s, 0, Math.PI * 2);
        c.arc(x - 24 * s, y + 6 * s, 17 * s, 0, Math.PI * 2);
        c.fill();
      }
      const base = ch + camera * 0.3;
      for (let i = 0; i < 3; i += 1) {
        const x = cw * (0.15 + i * 0.35);
        const top = base - 110 - rand(i, 5) * 40;
        if (top > ch) continue;
        c.strokeStyle = "#fff6ee";
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(x, base);
        c.lineTo(x, top);
        c.stroke();
        for (let k = 0; k < 4; k += 1) {
          c.strokeStyle = ["#ff5e9a", "#ffd166", "#5ec9ff", "#7ae582"][(i + k) % 4];
          c.lineWidth = 5;
          c.beginPath();
          c.arc(x, top, 6 + k * 5, 0, Math.PI * 2);
          c.stroke();
        }
      }
      break;
    }
    case "storm": {
      gradient([[0, "#1e232c"], [0.6, "#3c4450"], [1, "#6a7480"]]);
      for (let i = 0; i < 9; i += 1) {
        const x = ((rand(i, 1) * (cw + 240) + t * 0.006 * (0.5 + rand(i, 2))) % (cw + 240)) - 120;
        const y = ch * (0.08 + rand(i, 3) * 0.4) + camera * 0.05;
        const s = 0.9 + rand(i, 4) * 0.9;
        c.fillStyle = withAlpha(i % 2 ? "#4a525e" : "#2a3038", 0.9);
        c.beginPath();
        c.arc(x, y, 30 * s, 0, Math.PI * 2);
        c.arc(x + 32 * s, y + 8 * s, 24 * s, 0, Math.PI * 2);
        c.arc(x - 30 * s, y + 10 * s, 22 * s, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = withAlpha("#b8c4d4", 0.35);
      c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 0; i < 70; i += 1) {
        const x = (rand(i, 5) * (cw + 60) - (t * 0.25 + i * 13) * 0.3) % (cw + 60);
        const y = (rand(i, 6) * ch + t * (0.5 + rand(i, 7) * 0.3)) % ch;
        const xx = x < 0 ? x + cw + 60 : x;
        c.moveTo(xx, y);
        c.lineTo(xx - 5, y + 14);
      }
      c.stroke();
      break;
    }
    default:
      gradient([
        [0, mix("#1b2647", "#ff5e7e", 0.08 + lift * 0.14)],
        [0.6, "#1b2647"],
        [1, mix("#1b2647", "#2c3b66", 0.8)],
      ]);
  }
  styleSky(c, theme.style, cw, ch, camera);
}

/** The art style's pass over the sky, so the background matches the blocks. */
function styleSky(c: CanvasRenderingContext2D, style: StackerStyle, cw: number, ch: number, camera: number) {
  switch (style) {
    case "hologram": {
      c.fillStyle = withAlpha("#050a18", 0.72);
      c.fillRect(0, 0, cw, ch);
      c.strokeStyle = withAlpha("#4ff0ff", 0.12);
      c.lineWidth = 1;
      c.beginPath();
      const shift = (camera * 0.2) % 32;
      for (let x = 0; x <= cw; x += 32) {
        c.moveTo(x, 0);
        c.lineTo(x, ch);
      }
      for (let y = shift; y <= ch; y += 32) {
        c.moveTo(0, y);
        c.lineTo(cw, y);
      }
      c.stroke();
      break;
    }
    case "papercraft": {
      c.fillStyle = withAlpha("#e8d6b4", 0.35);
      c.fillRect(0, 0, cw, ch);
      c.strokeStyle = withAlpha("#7a5a3a", 0.08);
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < 120; i += 1) {
        const x = rand(i, 31) * cw;
        const y = rand(i, 32) * ch;
        c.moveTo(x, y);
        c.lineTo(x + 6, y + (rand(i, 33) - 0.5) * 4);
      }
      c.stroke();
      break;
    }
    case "voxel": {
      // The sky resolves into big square pixels.
      c.fillStyle = withAlpha("#000000", 0.05);
      for (let y = 0; y < ch; y += 24) for (let x = (y / 24) % 2 ? 24 : 0; x < cw; x += 48) c.fillRect(x, y, 24, 24);
      break;
    }
    case "toon": {
      c.fillStyle = withAlpha("#16121e", 0.07);
      for (let y = 0, row = 0; y < ch; y += 12, row += 1) for (let x = row % 2 ? 6 : 0; x < cw; x += 12) c.fillRect(x, y, 2, 2);
      break;
    }
    case "low-poly": {
      for (let i = 0; i < 14; i += 1) {
        c.fillStyle = withAlpha(i % 2 ? "#ffffff" : "#000000", 0.05);
        c.beginPath();
        c.moveTo(rand(i, 41) * cw, rand(i, 42) * ch);
        c.lineTo(rand(i, 43) * cw, rand(i, 44) * ch);
        c.lineTo(rand(i, 45) * cw, rand(i, 46) * ch);
        c.fill();
      }
      break;
    }
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
    case "coins":
    case "bubbles":
      return 900;
    case "paint":
      return 800;
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
    case "coins": {
      const count = full ? 9 : 4;
      const [ox, oy] = proj([ring.cx, ring.y, ring.cz]);
      for (let i = 0; i < count; i += 1) {
        const a = rand(seed + i, 1) * Math.PI * 2;
        const v = 30 + rand(i, 2) * 40;
        const x = ox + Math.cos(a) * v * t;
        const y = oy - (90 + rand(i, 3) * 40) * t + 150 * t * t;
        const flip = Math.abs(Math.cos(t * 12 + i));
        c.fillStyle = withAlpha("#f2c230", Math.min(1, (1 - t) * 2));
        c.beginPath();
        c.ellipse(x, y, 5 * flip + 0.6, 5, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = withAlpha("#a6780a", Math.min(1, (1 - t) * 2));
        c.lineWidth = 1.2 * thin;
        c.stroke();
        if (flip > 0.5) {
          c.fillStyle = withAlpha("#fff2b0", Math.min(1, (1 - t) * 2));
          c.fillRect(x - 0.8, y - 2.5, 1.6, 5);
        }
      }
      break;
    }
    case "bubbles": {
      const count = full ? 8 : 4;
      for (let i = 0; i < count; i += 1) {
        const [sx, sy] = proj([ring.cx + (rand(seed + i, 1) - 0.5) * ring.w, ring.y, ring.cz + (rand(seed + i, 2) - 0.5) * ring.d]);
        const life = Math.min(1, t * (1.1 + rand(i, 3) * 0.4));
        const r = 3 + rand(i, 4) * 5;
        const y = sy - life * (40 + rand(i, 5) * 40);
        const x = sx + Math.sin(life * 8 + i) * 5;
        if (life < 0.9) {
          c.strokeStyle = withAlpha("#ffffff", 0.85);
          c.fillStyle = withAlpha("#bfe9ff", 0.2);
          c.lineWidth = 1.2 * thin;
          c.beginPath();
          c.arc(x, y, r, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          c.fillStyle = withAlpha("#ffffff", 0.8);
          c.beginPath();
          c.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
          c.fill();
        } else {
          // Pop: a ring of droplets.
          c.fillStyle = withAlpha("#ffffff", (1 - life) * 8);
          for (let k = 0; k < 6; k += 1) {
            const a = (k / 6) * Math.PI * 2;
            c.fillRect(x + Math.cos(a) * r * 1.4 - 0.8, y + Math.sin(a) * r * 1.4 - 0.8, 1.6, 1.6);
          }
        }
      }
      break;
    }
    case "paint": {
      // Paint splashes over the top edge and runs down the front and right faces.
      const color = CONFETTI[seed % CONFETTI.length];
      const run = Math.min(1, t * 1.6);
      const alpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      c.fillStyle = withAlpha(color, 0.85 * alpha);
      outline(c, ring.cx, ring.cz, ring.w * (0.5 + run * 0.5), ring.d * (0.5 + run * 0.5), ring.y);
      c.fill();
      const drips = full ? 6 : 3;
      for (let i = 0; i < drips; i += 1) {
        const onFront = i % 2 === 0;
        const k = rand(seed + i, 1);
        const top: P3 = onFront ? [ring.cx - ring.w / 2 + k * ring.w, ring.y, ring.cz + ring.d / 2] : [ring.cx + ring.w / 2, ring.y, ring.cz + ring.d / 2 - k * ring.d];
        const [sx, sy] = proj(top);
        const len = run * (10 + rand(i, 2) * 16);
        c.fillRect(sx - 1.6, sy, 3.2, len);
        c.beginPath();
        c.arc(sx, sy + len, 2.4, 0, Math.PI * 2);
        c.fill();
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
