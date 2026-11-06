"use client";

import type { GameLook } from "@/lib/game-cosmetics";
import { withAlpha } from "./engine";
import { GAME_PALETTES } from "./palettes";

/**
 * Space Blaster cosmetics: ship hull paint, engine trails, laser colors and sector backdrops with
 * matching boss plating. Drawing only: ship shape and hitbox, upgrade ramps (each weapon keeps
 * three clearly brighter tiers), overdrive gold, enemy fire and the enraged boss red never change.
 */

type Ctx = CanvasRenderingContext2D;

const accent = GAME_PALETTES["space-blaster"].accent;

type Hull = { wingEdge: string; wingMid: string; bodyEdge: string; bodyLight: string; bodyShade: string; stripe: string; glassTop: string; glassBottom: string; outline: string };
type Trail = { flame: string; cycle: readonly string[] | null; sparks: boolean };
type Weapon = { tiers: [string, string, string]; core: string; width: number; length: number };
type Sector = { base: string; tints: string[]; dust: string; plating: [string, string, string]; core: string; lights: string };

export type BlasterArtStyle = "" | "pixel" | "crt" | "comic" | "hyperglow";
const ART_STYLES: readonly BlasterArtStyle[] = ["pixel", "crt", "comic", "hyperglow"];
const INK = "#0b0716";

export type BlasterTheme = { key: string; style: BlasterArtStyle; hull: Hull; trail: Trail; weapon: Weapon; sector: Sector };

const HULLS: Record<string, Hull> = {
  "": { wingEdge: "#26346a", wingMid: "#7f9de0", bodyEdge: "#8ea2d8", bodyLight: "#f2f7ff", bodyShade: "#5a6ca8", stripe: accent, glassTop: "#e9fbff", glassBottom: "#1a6f9a", outline: accent },
  crimson: { wingEdge: "#4a1220", wingMid: "#e0506a", bodyEdge: "#d88e9a", bodyLight: "#fff2f4", bodyShade: "#a85a6a", stripe: "#ffd84a", glassTop: "#fff3d9", glassBottom: "#9a3a1a", outline: "#ff6b81" },
  monarch: { wingEdge: "#5a3d0c", wingMid: "#ffcf4a", bodyEdge: "#e8c66e", bodyLight: "#fffbe6", bodyShade: "#b08a2e", stripe: "#ffffff", glassTop: "#f3e8ff", glassBottom: "#7a3aa0", outline: "#ffd84a" },
  stealth: { wingEdge: "#14151c", wingMid: "#4a4f63", bodyEdge: "#3a3e4f", bodyLight: "#a4aac2", bodyShade: "#22252f", stripe: "#ff3d6e", glassTop: "#ffd2dc", glassBottom: "#7a0f2a", outline: "#b8bed6" },
  viper: { wingEdge: "#0b3a2a", wingMid: "#3de0a0", bodyEdge: "#8ee0bf", bodyLight: "#f0fff8", bodyShade: "#3a8a6a", stripe: "#d6ff5c", glassTop: "#f0fff0", glassBottom: "#1a7a5a", outline: "#5dffb0" },
  hornet: { wingEdge: "#1a1608", wingMid: "#ffd23d", bodyEdge: "#3a3424", bodyLight: "#fff6c9", bodyShade: "#8a6f1a", stripe: "#14120a", glassTop: "#ffe8b0", glassBottom: "#7a4a0a", outline: "#ffe066" },
  arctic: { wingEdge: "#5a7a9a", wingMid: "#e8f4ff", bodyEdge: "#b8d4ec", bodyLight: "#ffffff", bodyShade: "#7a9ab8", stripe: "#5fc8ff", glassTop: "#e0f8ff", glassBottom: "#1a5a8a", outline: "#cfeeff" },
  phantom: { wingEdge: "#1a0a2e", wingMid: "#6a3ab0", bodyEdge: "#7a5aa8", bodyLight: "#e8d8ff", bodyShade: "#3a2260", stripe: "#ff7ad9", glassTop: "#ffe0f6", glassBottom: "#9a1a6a", outline: "#c49bff" },
};

// Hex so glow sprites (and their cache) stay finite.
const RAINBOW = ["#ff5f6d", "#ff9a4a", "#ffd84a", "#9dff5c", "#4fffc4", "#4fd8ff", "#7d8bff", "#c77dff", "#ff7ad9"];
const AURORA = ["#4fffc4", "#4fd8ff", "#7d8bff", "#c77dff", "#7d8bff", "#4fd8ff"];

const TRAILS: Record<string, Trail> = {
  "": { flame: "#ff9a4a", cycle: null, sparks: false },
  plasma: { flame: "#5fd8ff", cycle: null, sparks: false },
  "violet-wake": { flame: "#c77dff", cycle: null, sparks: false },
  comet: { flame: "#fff3c4", cycle: null, sparks: true },
  rainbow: { flame: "#ff7ad9", cycle: RAINBOW, sparks: false },
  toxic: { flame: "#8dff4a", cycle: null, sparks: false },
  inferno: { flame: "#ff4d2e", cycle: null, sparks: true },
  aurora: { flame: "#4fffc4", cycle: AURORA, sparks: false },
};

const WEAPONS: Record<string, Weapon> = {
  "": { tiers: [accent, "#c49bff", "#ffd84a"], core: "#ffffff", width: 2, length: 13 },
  ruby: { tiers: ["#ff5d73", "#ff8fb1", "#ffd0e0"], core: "#ffffff", width: 2, length: 13 },
  mint: { tiers: ["#5dffd0", "#5dc8ff", "#e0fffa"], core: "#ffffff", width: 2, length: 13 },
  lance: { tiers: ["#ffb347", "#ff8a3d", "#fff0a0"], core: "#fffbe6", width: 1.5, length: 19 },
  void: { tiers: ["#b48cff", "#ff7ad9", "#ffffff"], core: "#f3e8ff", width: 3, length: 10 },
  frost: { tiers: ["#7fd8ff", "#b8ecff", "#ffffff"], core: "#ffffff", width: 2.5, length: 12 },
  "rose-gold": { tiers: ["#ff9ab8", "#ffc4a8", "#fff0e0"], core: "#fffaf5", width: 2, length: 14 },
  needle: { tiers: ["#ff5fd2", "#ff9ae6", "#ffe0f6"], core: "#ffffff", width: 1, length: 22 },
};

const SECTORS: Record<string, Sector> = {
  "": { base: "#060920", tints: ["#5b2bb5", "#1b6fb8", "#b02a7a", "#1f8fa8", "#3a2a9a"], dust: "#cfe0ff", plating: ["#9aa2cc", "#4a4f7c", "#1b1d33"], core: "#ff7ad9", lights: "#ffb347" },
  "crimson-rift": { base: "#140509", tints: ["#b5242b", "#7a1b4f", "#d4572a", "#5a1430", "#9a2a5a"], dust: "#ffd6c9", plating: ["#d0a49a", "#7c3a3a", "#2a1014"], core: "#ffb347", lights: "#ffd84a" },
  emerald: { base: "#03120c", tints: ["#1f8a5a", "#1b6f78", "#4ab02a", "#0f5a4a", "#2a9a7a"], dust: "#d0ffe8", plating: ["#a2ccb8", "#3f7c64", "#13261f"], core: "#5dffb0", lights: "#d6ff5c" },
  ice: { base: "#050c18", tints: ["#3a8fd8", "#7ac8ff", "#2a5ab0", "#9ae0ff", "#4a6ad0"], dust: "#eaf6ff", plating: ["#e0f2ff", "#6f9ac4", "#1a2c48"], core: "#8fe9ff", lights: "#ffffff" },
  solar: { base: "#120a02", tints: ["#d88a1b", "#b0461b", "#ffb347", "#8a2a1a", "#d4a02a"], dust: "#fff0c9", plating: ["#ffe0a0", "#a8742a", "#2e1a08"], core: "#fff36b", lights: "#ff8a3d" },
  abyss: { base: "#020a12", tints: ["#0f5a7a", "#1b8a8a", "#0a3a6a", "#2ab0b0", "#123a5a"], dust: "#c9f6ff", plating: ["#a8d8e0", "#2f6a78", "#0a1c24"], core: "#4fffc4", lights: "#7df9ff" },
  "amethyst-nebula": { base: "#0c0518", tints: ["#7a2ab5", "#b52a9a", "#4a1b8a", "#d45ad4", "#5a2aa0"], dust: "#f0d9ff", plating: ["#e0c8ff", "#6a3a9a", "#1c0f30"], core: "#c77dff", lights: "#ff7ad9" },
  obsidian: { base: "#040406", tints: ["#2a2a3a", "#3a3050", "#1a2a3a", "#4a4a5a", "#2a1a3a"], dust: "#e0e4f0", plating: ["#c8ccd8", "#4a4c5c", "#121218"], core: "#7df9ff", lights: "#ffffff" },
};

/** Boss core color once it drops below half health; shared by every sector. */
export const ENRAGED = "#ff4d6d";

export function blasterTheme(look: GameLook): BlasterTheme {
  const hull = look.hull ?? "";
  const trail = look.trail ?? "";
  const weapon = look.weapon ?? "";
  const sector = look.sector ?? "";
  const style = ART_STYLES.find((s) => s === look.style) ?? "";
  return {
    key: [hull, trail, weapon, sector, style].join("|"),
    style,
    hull: HULLS[hull] ?? HULLS[""],
    trail: TRAILS[trail] ?? TRAILS[""],
    weapon: WEAPONS[weapon] ?? WEAPONS[""],
    sector: SECTORS[sector] ?? SECTORS[""],
  };
}

/** Current engine flame color (overdrive gold always wins so the power-up stays readable). */
export function flameColor(trail: Trail, overdrive: boolean, now: number) {
  if (overdrive) return "#ffd84a";
  return trail.cycle ? trail.cycle[Math.floor(now / 60) % trail.cycle.length] : trail.flame;
}

const glowSprites = new Map<string, HTMLCanvasElement>();

function glowSprite(color: string) {
  let sprite = glowSprites.get(color);
  if (!sprite) {
    sprite = document.createElement("canvas");
    sprite.width = 64;
    sprite.height = 64;
    const g = sprite.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, withAlpha(color, 1));
      grad.addColorStop(0.22, withAlpha(color, 0.55));
      grad.addColorStop(0.55, withAlpha(color, 0.14));
      grad.addColorStop(1, withAlpha(color, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    if (glowSprites.size > 256) glowSprites.clear();
    glowSprites.set(color, sprite);
  }
  return sprite;
}

/** Soft additive-style glow blob (call with "lighter" compositing for light emission). */
export function glow(c: Ctx, x: number, y: number, rx: number, color: string, alpha = 1, ry = rx) {
  c.globalAlpha = Math.max(0, Math.min(1, alpha));
  c.drawImage(glowSprite(color), x - rx, y - ry, rx * 2, ry * 2);
  c.globalAlpha = 1;
}

/** The scrolling backdrop, painted once per sector: soft nebula clouds and faint dust, tiling vertically. */
export function paintNebula(sector: Sector, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  g.scale(2, 2);
  g.fillStyle = sector.base;
  g.fillRect(0, 0, width, height);
  for (let i = 0; i < 10; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = 90 + Math.random() * 170;
    const tint = sector.tints[i % sector.tints.length];
    for (const oy of [-height, 0, height]) {
      const grad = g.createRadialGradient(x, y + oy, 0, x, y + oy, r);
      grad.addColorStop(0, withAlpha(tint, 0.2));
      grad.addColorStop(0.5, withAlpha(tint, 0.07));
      grad.addColorStop(1, withAlpha(tint, 0));
      g.fillStyle = grad;
      g.fillRect(x - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 280; i += 1) {
    g.fillStyle = withAlpha(sector.dust, Math.random() * 0.35);
    g.fillRect(Math.random() * width, Math.random() * height, 0.8, 0.8);
  }
  return canvas;
}

/** Player ship centered at the origin (flames, hull, cockpit, nav lights). */
export function drawShipBody(c: Ctx, theme: BlasterTheme, bank: number, flame: string, now: number, animate: boolean, alpha = 1) {
  const h = theme.hull;
  c.globalCompositeOperation = "lighter";
  const flicker = animate ? 1 + Math.sin(now / 30) * 0.15 : 1;
  glow(c, -6, 18, 7 * flicker, flame, 0.95, 12 * flicker);
  glow(c, 6, 18, 7 * flicker, flame, 0.95, 12 * flicker);
  glow(c, 0, 4, 36, h.outline, 0.18);
  c.globalCompositeOperation = "source-over";
  c.globalAlpha = alpha;
  c.save();
  c.scale(1 - Math.abs(bank) * 0.16, 1);
  const wing = c.createLinearGradient(-24, 0, 24, 0);
  wing.addColorStop(0, h.wingEdge);
  wing.addColorStop(0.5 - bank * 0.25, h.wingMid);
  wing.addColorStop(1, h.wingEdge);
  c.fillStyle = wing;
  c.beginPath();
  c.moveTo(0, -8);
  c.lineTo(23, 11);
  c.lineTo(21, 18);
  c.lineTo(8, 14);
  c.lineTo(-8, 14);
  c.lineTo(-21, 18);
  c.lineTo(-23, 11);
  c.closePath();
  c.fill();
  const comic = theme.style === "comic";
  if (comic) {
    c.strokeStyle = INK;
    c.lineWidth = 3;
    c.lineJoin = "round";
    c.stroke();
  }
  c.strokeStyle = withAlpha(h.outline, 0.8);
  c.lineWidth = 1.2;
  c.stroke();
  const body = c.createLinearGradient(-8, 0, 8, 0);
  body.addColorStop(0, h.bodyEdge);
  body.addColorStop(0.45 - bank * 0.2, h.bodyLight);
  body.addColorStop(1, h.bodyShade);
  c.fillStyle = body;
  c.beginPath();
  c.moveTo(0, -25);
  c.bezierCurveTo(6, -15, 8, 0, 7, 15);
  c.lineTo(-7, 15);
  c.bezierCurveTo(-8, 0, -6, -15, 0, -25);
  c.fill();
  if (comic) {
    c.strokeStyle = INK;
    c.lineWidth = 2.4;
    c.stroke();
  }
  c.fillStyle = h.stripe;
  c.fillRect(-1, -2, 2, 14);
  const glass = c.createLinearGradient(0, -14, 0, 0);
  glass.addColorStop(0, h.glassTop);
  glass.addColorStop(1, h.glassBottom);
  c.fillStyle = glass;
  c.beginPath();
  c.ellipse(0, -8, 3.4, 7, 0, 0, Math.PI * 2);
  c.fill();
  const on = !animate || Math.floor(now / 400) % 2 === 0;
  c.fillStyle = on ? "#ff5d5d" : "#5a2030";
  c.fillRect(-22, 11, 2.5, 2.5);
  c.fillStyle = on ? "#7dff9a" : "#205a30";
  c.fillRect(19.5, 11, 2.5, 2.5);
  c.restore();
  c.globalAlpha = 1;
}

/** Player laser bolt: tinted glow plus a bright core. */
export function drawLaser(c: Ctx, weapon: Weapon, x: number, y: number, color: string) {
  c.globalCompositeOperation = "lighter";
  glow(c, x, y, 3 + weapon.width * 1.5, color, 0.9, weapon.length + 3);
  c.fillStyle = weapon.core;
  c.fillRect(x - weapon.width / 2, y - weapon.length * 0.6, weapon.width, weapon.length);
  c.globalCompositeOperation = "source-over";
}

/** Boss hull centered at the origin. `flash` whitens it when hit. */
export function drawBossBody(c: Ctx, sector: Sector, enraged: boolean, flash: boolean, now: number, style: BlasterArtStyle = "") {
  const core = enraged ? ENRAGED : sector.core;
  c.globalCompositeOperation = "lighter";
  glow(c, 0, 0, 90, core, 0.25 + Math.sin(now / 160) * 0.08);
  for (const side of [-1, 1]) glow(c, side * 40, -38, 14, sector.lights, 0.8);
  c.globalCompositeOperation = "source-over";
  const hull = c.createLinearGradient(0, -50, 0, 50);
  hull.addColorStop(0, sector.plating[0]);
  hull.addColorStop(0.45, sector.plating[1]);
  hull.addColorStop(1, sector.plating[2]);
  c.fillStyle = flash ? "#ffffff" : hull;
  c.beginPath();
  c.moveTo(-86, -10);
  c.lineTo(-60, -40);
  c.lineTo(-22, -46);
  c.lineTo(22, -46);
  c.lineTo(60, -40);
  c.lineTo(86, -10);
  c.lineTo(70, 22);
  c.lineTo(36, 30);
  c.lineTo(20, 48);
  c.lineTo(-20, 48);
  c.lineTo(-36, 30);
  c.lineTo(-70, 22);
  c.closePath();
  c.fill();
  if (style === "comic") {
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.lineJoin = "round";
    c.stroke();
  }
  c.strokeStyle = withAlpha(core, 0.6);
  c.lineWidth = 2;
  c.stroke();
  c.strokeStyle = "rgb(10 10 30 / 0.5)";
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(-60, -10);
  c.lineTo(-30, 10);
  c.moveTo(60, -10);
  c.lineTo(30, 10);
  c.moveTo(-22, -46);
  c.lineTo(-14, -16);
  c.moveTo(22, -46);
  c.lineTo(14, -16);
  c.stroke();
  for (const side of [-1, 1]) {
    c.fillStyle = flash ? "#ffffff" : "#2a2440";
    c.beginPath();
    c.arc(side * 54, 8, 9, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = core;
    c.beginPath();
    c.arc(side * 54, 10, 3, 0, Math.PI * 2);
    c.fill();
  }
  const pulse = 1 + Math.sin(now / 120) * 0.12;
  const coreGrad = c.createRadialGradient(0, 6, 0, 0, 6, 16 * pulse);
  coreGrad.addColorStop(0, "#ffffff");
  coreGrad.addColorStop(0.4, core);
  coreGrad.addColorStop(1, withAlpha(core, 0));
  c.fillStyle = coreGrad;
  c.beginPath();
  c.arc(0, 6, 16 * pulse, 0, Math.PI * 2);
  c.fill();
}

const scratch: Partial<Record<"small" | "pattern", HTMLCanvasElement>> = {};
const patterns = new Map<string, CanvasPattern | null>();

function scratchCanvas(name: "small" | "pattern", width: number, height: number) {
  let canvas = scratch[name];
  if (!canvas) {
    canvas = document.createElement("canvas");
    scratch[name] = canvas;
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

function overlayPattern(c: Ctx, kind: "scanlines" | "halftone", unit: number) {
  const key = `${kind}:${unit}`;
  if (patterns.has(key)) return patterns.get(key) ?? null;
  const tile = document.createElement("canvas");
  const g = tile.getContext("2d");
  if (kind === "scanlines") {
    tile.width = 1;
    tile.height = unit * 3;
    if (g) {
      g.fillStyle = "rgba(0, 0, 0, 0.32)";
      g.fillRect(0, unit * 2, 1, unit);
    }
  } else {
    tile.width = unit * 4;
    tile.height = unit * 4;
    if (g) {
      g.fillStyle = "rgba(0, 0, 0, 0.22)";
      for (const [x, y] of [[1, 1], [3, 3]]) {
        g.beginPath();
        g.arc(x * unit, y * unit, unit * 0.7, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const pattern = c.createPattern(tile, "repeat");
  patterns.set(key, pattern);
  return pattern;
}

/**
 * Restyles everything already drawn on `c`'s canvas (call before the HUD). Hues are kept, so pickups,
 * enemy fire and upgrade tiers stay recognizable.
 */
export function applyArtStyle(c: Ctx, style: BlasterArtStyle, now: number, animate: boolean) {
  if (!style) return;
  const { width, height } = c.canvas;
  if (!width || !height) return;
  const unit = Math.max(1, Math.round(height / 360));
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  if (style === "pixel" || style === "hyperglow") {
    const block = style === "pixel" ? unit * 3 : unit * 6;
    const small = scratchCanvas("small", Math.ceil(width / block), Math.ceil(height / block));
    const g = small.getContext("2d");
    if (g) {
      g.imageSmoothingEnabled = true;
      g.clearRect(0, 0, small.width, small.height);
      g.drawImage(c.canvas, 0, 0, small.width, small.height);
      if (style === "pixel") {
        c.imageSmoothingEnabled = false;
        c.drawImage(small, 0, 0, small.width * block, small.height * block);
      } else {
        // A blurred copy screened on top blooms the bright lights without shifting their colors.
        c.imageSmoothingEnabled = true;
        c.globalCompositeOperation = "screen";
        c.globalAlpha = 0.55;
        c.drawImage(small, 0, 0, small.width * block, small.height * block);
      }
    }
  } else if (style === "crt") {
    const lines = overlayPattern(c, "scanlines", unit);
    if (lines) {
      c.fillStyle = lines;
      c.fillRect(0, 0, width, height);
    }
    if (animate) {
      const band = ((now / 6) % (height + 120)) - 60;
      const roll = c.createLinearGradient(0, band - 60, 0, band + 60);
      roll.addColorStop(0, "rgba(255, 255, 255, 0)");
      roll.addColorStop(0.5, "rgba(255, 255, 255, 0.04)");
      roll.addColorStop(1, "rgba(255, 255, 255, 0)");
      c.fillStyle = roll;
      c.fillRect(0, band - 60, width, 120);
    }
    const vignette = c.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.45)");
    c.fillStyle = vignette;
    c.fillRect(0, 0, width, height);
  } else if (style === "comic") {
    const dots = overlayPattern(c, "halftone", unit * 2);
    if (dots) {
      c.fillStyle = dots;
      c.fillRect(0, 0, width, height);
    }
  }
  c.restore();
}
