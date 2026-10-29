"use client";

import type { SnakeFruit, SnakeFruitChoice } from "@/lib/snake";

/**
 * Hand-drawn cartoon artwork for Snake. Every piece shares one recipe so they read as a set:
 * a flat base color, a cel-shaded crescent toward the lower right, a soft highlight toward the
 * upper left and a confident dark ink outline. Painters work in a 100-unit box centred on 0,0.
 */

type Ctx = CanvasRenderingContext2D;

export const INK = "#2b1b26";

/** Each fruit's main color, used for its eating burst. */
export const FRUIT_COLORS: Record<SnakeFruit, string> = {
  apple: "#e8333a",
  cherry: "#d3123c",
  orange: "#ff9417",
  strawberry: "#f0304a",
  grapes: "#8a3fd1",
  banana: "#ffd23f",
  watermelon: "#ff4d6a",
  lemon: "#ffe03a",
  pineapple: "#f5b52e",
  pear: "#b5d63a",
  peach: "#ffa27a",
  kiwi: "#8cc63f",
  blueberry: "#4a64d8",
  plum: "#9b2f6e",
  mango: "#ffb52e",
};

/** Lock, key, crate and portal pair colors. */
export const PAIR_HUES = ["#f5b700", "#2f9bff", "#ff5fa2", "#4fcf6a", "#a77bff", "#ff8a3d"];

/** Fill a shape cel-shaded: shade color, the base shifted up-left on top, then a highlight and the ink line. */
function cel(ctx: Ctx, shape: () => void, base: string, shade: string, { line = 5, shift = 6, gloss = true } = {}) {
  shape();
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.save();
  shape();
  ctx.clip();
  ctx.translate(-shift, -shift);
  shape();
  ctx.fillStyle = base;
  ctx.fill();
  ctx.restore();
  if (gloss) {
    ctx.save();
    shape();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(-16, -16, 9, 15, 0.7, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(255 255 255 / 0.42)";
    ctx.fill();
    ctx.restore();
  }
  if (line <= 0) return;
  shape();
  ink(ctx, line);
}

function ink(ctx: Ctx, width = 5, color = INK) {
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.stroke();
}

function dot(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function circle(x: number, y: number, r: number) {
  return (ctx: Ctx) => () => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  };
}

function leaf(ctx: Ctx, x: number, y: number, length: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  cel(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(length * 0.5, -length * 0.45, length, 0);
      ctx.quadraticCurveTo(length * 0.5, length * 0.45, 0, 0);
    },
    "#5cc45a",
    "#2f8a3a",
    { line: 4, shift: 3, gloss: false },
  );
  ctx.beginPath();
  ctx.moveTo(length * 0.15, 0);
  ctx.lineTo(length * 0.75, 0);
  ink(ctx, 2.2, "rgb(30 80 40 / 0.6)");
  ctx.restore();
}

function stem(ctx: Ctx, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, width = 6) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ink(ctx, width + 4);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ink(ctx, width, "#7a4a2a");
}

/** Tiny speckles that give larger drawings a printed, hand-made texture. */
function speckle(ctx: Ctx, points: [number, number][], color: string, r = 1.8) {
  for (const [x, y] of points) dot(ctx, x, y, r, color);
}

const PAINTERS: Record<SnakeFruit, (ctx: Ctx, detail: boolean) => void> = {
  apple(ctx, detail) {
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.bezierCurveTo(14, -38, 44, -32, 42, -4);
      ctx.bezierCurveTo(41, 22, 24, 42, 9, 40);
      ctx.bezierCurveTo(4, 39, -4, 39, -9, 40);
      ctx.bezierCurveTo(-24, 42, -41, 22, -42, -4);
      ctx.bezierCurveTo(-44, -32, -14, -38, 0, -24);
      ctx.closePath();
    };
    stem(ctx, 0, -22, 0, -34, 6, -44);
    cel(ctx, shape, "#ee3b3f", "#b01b2c");
    if (detail) speckle(ctx, [[18, 8], [24, -6], [10, 22], [-6, 26], [28, 14]], "rgb(255 220 200 / 0.55)", 1.6);
    leaf(ctx, 6, -36, 26, -0.55);
  },
  cherry(ctx) {
    stem(ctx, -14, 10, -8, -26, 10, -42, 4);
    stem(ctx, 18, 16, 18, -18, 10, -42, 4);
    leaf(ctx, 10, -42, 24, -0.2);
    for (const [x, y] of [
      [-16, 22],
      [18, 26],
    ]) {
      ctx.save();
      ctx.translate(x, y);
      cel(ctx, circle(0, 0, 20)(ctx), "#e2213f", "#8f0a26", { shift: 5 });
      ctx.restore();
    }
  },
  orange(ctx, detail) {
    ctx.save();
    ctx.translate(0, 4);
    cel(ctx, circle(0, 0, 40)(ctx), "#ff9a1f", "#d0600a");
    if (detail) speckle(ctx, [[-16, 16], [12, 20], [22, -2], [-4, 28], [-24, 2], [26, 16], [4, 6], [-10, -6]], "rgb(170 70 0 / 0.35)");
    ctx.restore();
    dot(ctx, 0, -35, 5, INK);
    dot(ctx, 0, -35, 3, "#6d8a2a");
    leaf(ctx, 3, -37, 24, -0.4);
  },
  strawberry(ctx, detail) {
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(0, 44);
      ctx.bezierCurveTo(-30, 32, -43, 4, -38, -14);
      ctx.bezierCurveTo(-33, -31, -12, -31, 0, -27);
      ctx.bezierCurveTo(12, -31, 33, -31, 38, -14);
      ctx.bezierCurveTo(43, 4, 30, 32, 0, 44);
      ctx.closePath();
    };
    cel(ctx, shape, "#f2384f", "#a8142f");
    const seeds = detail
      ? [[-20, -10], [0, -12], [20, -10], [-24, 6], [-8, 4], [8, 4], [24, 6], [-14, 20], [2, 20], [16, 20], [-4, 33], [8, 33]]
      : [[-14, -6], [12, -6], [-6, 12], [10, 14], [0, 28]];
    for (const [x, y] of seeds) {
      ctx.beginPath();
      ctx.ellipse(x, y, 2.4, 3.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#ffe08a";
      ctx.fill();
    }
    for (const turn of [0.95, 0.72, 0.5, 0.28, 0.05]) leaf(ctx, 0, -28, 21, Math.PI * turn);
    stem(ctx, 0, -29, 0, -37, 4, -43, 4);
  },
  grapes(ctx) {
    stem(ctx, 0, -18, 0, -32, 6, -42, 5);
    leaf(ctx, 3, -32, 26, -0.45);
    for (const [x, y] of [
      [-24, -8],
      [0, -8],
      [24, -8],
      [-12, 12],
      [12, 12],
      [0, 32],
    ]) {
      ctx.save();
      ctx.translate(x, y);
      cel(ctx, circle(0, 0, 13)(ctx), "#9a4fe0", "#5a1f9a", { line: 4, shift: 3.5 });
      ctx.restore();
    }
  },
  banana(ctx) {
    ctx.save();
    ctx.rotate(-0.2);
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(-34, -28);
      ctx.quadraticCurveTo(-34, 38, 42, 18);
      ctx.quadraticCurveTo(45, 12, 38, 9);
      ctx.quadraticCurveTo(-8, 12, -22, -30);
      ctx.closePath();
    };
    cel(ctx, shape, "#ffe04f", "#d9a000", { gloss: false });
    ctx.beginPath();
    ctx.moveTo(-27, -20);
    ctx.quadraticCurveTo(-24, 28, 36, 14);
    ink(ctx, 2.5, "rgb(150 100 0 / 0.5)");
    ctx.beginPath();
    ctx.moveTo(-34, -28);
    ctx.lineTo(-30, -39);
    ctx.lineTo(-22, -37);
    ctx.lineTo(-22, -30);
    ctx.closePath();
    ctx.fillStyle = "#6b4a1a";
    ctx.fill();
    ink(ctx, 3.5);
    dot(ctx, 41, 14, 3.5, INK);
    ctx.restore();
  },
  watermelon(ctx, detail) {
    ctx.save();
    ctx.rotate(-0.18);
    ctx.translate(0, -10);
    const rind = () => {
      ctx.beginPath();
      ctx.moveTo(-45, 0);
      ctx.arc(0, 0, 45, Math.PI, 0, true);
      ctx.closePath();
    };
    cel(ctx, rind, "#3fa648", "#22702c", { gloss: false });
    ctx.beginPath();
    ctx.moveTo(-38, 0);
    ctx.arc(0, 0, 38, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = "#d8f5b4";
    ctx.fill();
    const flesh = () => {
      ctx.beginPath();
      ctx.moveTo(-34, 0);
      ctx.arc(0, 0, 34, Math.PI, 0, true);
      ctx.closePath();
    };
    cel(ctx, flesh, "#ff5a73", "#e0304e", { line: 0, shift: 4, gloss: false });
    const seeds = detail ? [[-18, 8], [0, 12], [18, 8], [-9, 22], [9, 22]] : [[-12, 10], [12, 10], [0, 20]];
    for (const [x, y] of seeds) {
      ctx.beginPath();
      ctx.ellipse(x, y, 2.8, 4.4, x / 40, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    rind();
    ink(ctx, 5);
    ctx.restore();
  },
  lemon(ctx, detail) {
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(-44, 2);
      ctx.bezierCurveTo(-40, -6, -36, -10, -32, -14);
      ctx.bezierCurveTo(-18, -34, 18, -34, 32, -14);
      ctx.bezierCurveTo(36, -10, 40, -6, 44, 2);
      ctx.bezierCurveTo(40, 6, 36, 10, 32, 14);
      ctx.bezierCurveTo(18, 34, -18, 34, -32, 14);
      ctx.bezierCurveTo(-36, 10, -40, 6, -44, 2);
      ctx.closePath();
    };
    ctx.save();
    ctx.rotate(-0.35);
    cel(ctx, shape, "#ffe23d", "#d9a800");
    if (detail) speckle(ctx, [[-12, 12], [8, 16], [18, -4], [-20, -2], [2, -14]], "rgb(170 120 0 / 0.35)");
    ctx.restore();
    leaf(ctx, 26, -26, 22, -0.9);
  },
  pineapple(ctx, detail) {
    for (const [angle, length] of [
      [-1.9, 26],
      [-1.57, 32],
      [-1.25, 26],
      [-2.3, 18],
      [-0.85, 18],
    ] as const) {
      ctx.save();
      ctx.translate(0, -18);
      ctx.rotate(angle);
      cel(
        ctx,
        () => {
          ctx.beginPath();
          ctx.moveTo(0, -6);
          ctx.quadraticCurveTo(length * 0.6, -4, length, 0);
          ctx.quadraticCurveTo(length * 0.6, 4, 0, 6);
          ctx.closePath();
        },
        "#5cc45a",
        "#2f8a3a",
        { line: 3.5, shift: 2.5, gloss: false },
      );
      ctx.restore();
    }
    const body = () => {
      ctx.beginPath();
      ctx.ellipse(0, 12, 28, 34, 0, 0, Math.PI * 2);
    };
    cel(ctx, body, "#f9bb36", "#c47a12");
    ctx.save();
    body();
    ctx.clip();
    ctx.beginPath();
    for (let k = -60; k <= 60; k += detail ? 13 : 18) {
      ctx.moveTo(k - 40, -30);
      ctx.lineTo(k + 40, 50);
      ctx.moveTo(k + 40, -30);
      ctx.lineTo(k - 40, 50);
    }
    ink(ctx, 2.4, "rgb(140 80 10 / 0.55)");
    ctx.restore();
    body();
    ink(ctx, 5);
  },
  pear(ctx, detail) {
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.bezierCurveTo(14, -30, 16, -12, 22, -2);
      ctx.bezierCurveTo(40, 14, 34, 42, 0, 42);
      ctx.bezierCurveTo(-34, 42, -40, 14, -22, -2);
      ctx.bezierCurveTo(-16, -12, -14, -30, 0, -30);
      ctx.closePath();
    };
    stem(ctx, 0, -28, 2, -38, 8, -44, 5);
    cel(ctx, shape, "#bfdc45", "#7f9e1d");
    if (detail) speckle(ctx, [[12, 10], [-10, 18], [16, 26], [-4, 30], [4, 4]], "rgb(90 110 20 / 0.45)");
    leaf(ctx, 6, -38, 22, -0.4);
  },
  peach(ctx) {
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.bezierCurveTo(30, -42, 46, -6, 38, 14);
      ctx.bezierCurveTo(30, 38, -30, 38, -38, 14);
      ctx.bezierCurveTo(-46, -6, -30, -42, 0, -30);
      ctx.closePath();
    };
    cel(ctx, shape, "#ffb48a", "#e86a5c");
    ctx.save();
    shape();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(16, 8, 20, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(240 80 90 / 0.35)";
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.bezierCurveTo(-12, -6, -10, 18, 2, 32);
    ink(ctx, 3, "rgb(150 50 50 / 0.6)");
    leaf(ctx, 2, -32, 24, -0.6);
  },
  kiwi(ctx, detail) {
    cel(ctx, circle(0, 0, 42)(ctx), "#9a6b3c", "#6b4522", { gloss: false });
    cel(ctx, circle(0, 0, 33)(ctx), "#93cf45", "#5d9a22", { line: 3, shift: 3, gloss: false });
    dot(ctx, 0, 0, 11, "#f4f8d6");
    const seeds = detail ? 12 : 8;
    for (let i = 0; i < seeds; i += 1) {
      const a = (i / seeds) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 19, Math.sin(a) * 19, 2.2, 3.8, a + Math.PI / 2, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(-16, -18, 6, 10, 0.7, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(255 255 255 / 0.3)";
    ctx.fill();
  },
  blueberry(ctx) {
    ctx.save();
    ctx.translate(0, 4);
    cel(ctx, circle(0, 0, 38)(ctx), "#5a74e6", "#2c3f9e");
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      const b = a + Math.PI / 5;
      ctx.lineTo(Math.cos(a) * 12, -20 + Math.sin(a) * 12);
      ctx.lineTo(Math.cos(b) * 5, -20 + Math.sin(b) * 5);
    }
    ctx.closePath();
    ctx.fillStyle = "#26306e";
    ctx.fill();
    ink(ctx, 3);
    ctx.restore();
    leaf(ctx, 16, -32, 20, -0.5);
  },
  plum(ctx) {
    const shape = () => {
      ctx.beginPath();
      ctx.ellipse(0, 4, 36, 40, 0.25, 0, Math.PI * 2);
    };
    stem(ctx, 2, -32, 2, -40, 8, -46, 4);
    cel(ctx, shape, "#a8357a", "#5e1446");
    ctx.beginPath();
    ctx.moveTo(4, -34);
    ctx.bezierCurveTo(18, -10, 16, 20, 6, 42);
    ink(ctx, 3, "rgb(60 10 40 / 0.6)");
  },
  mango(ctx) {
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(-6, -36);
      ctx.bezierCurveTo(30, -40, 46, 0, 30, 26);
      ctx.bezierCurveTo(16, 46, -26, 44, -36, 16);
      ctx.bezierCurveTo(-44, -6, -30, -34, -6, -36);
      ctx.closePath();
    };
    cel(ctx, shape, "#ffc23a", "#e07a1a");
    ctx.save();
    shape();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(-10, -24, 34, 22, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgb(255 80 50 / 0.5)";
    ctx.fill();
    ctx.restore();
    shape();
    ink(ctx, 5);
    stem(ctx, -6, -34, -6, -40, -2, -44, 4);
    leaf(ctx, -4, -42, 24, -0.2);
  },
};

function paint(ctx: Ctx, x: number, y: number, size: number, body: () => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  body();
  ctx.restore();
}

/** Paint a fruit `size` pixels across, centred on (x, y). */
function paintFruit(ctx: Ctx, fruit: SnakeFruit, x: number, y: number, size: number, detail: boolean) {
  paint(ctx, x, y, size, () => PAINTERS[fruit](ctx, detail));
}

// Painting clips and strokes many paths, so each piece is rendered once per pixel size and stamped.
const sprites = new Map<string, HTMLCanvasElement>();
const SPRITE_PAD = 1.7;

function stamp(ctx: Ctx, key: string, x: number, y: number, size: number, body: (c: Ctx, px: number) => void) {
  if (size < 1) return;
  const m = ctx.getTransform();
  const px = Math.max(4, Math.ceil((size * (Math.hypot(m.a, m.b) || 1)) / 2) * 2);
  const id = `${key}@${px}`;
  let sprite = sprites.get(id);
  if (!sprite) {
    sprite = document.createElement("canvas");
    sprite.width = sprite.height = Math.ceil(px * SPRITE_PAD);
    const c = sprite.getContext("2d");
    if (!c) return;
    c.translate(sprite.width / 2, sprite.height / 2);
    body(c, px);
    if (sprites.size > 600) sprites.clear();
    sprites.set(id, sprite);
  }
  const d = (sprite.width / px) * size;
  ctx.drawImage(sprite, x - d / 2, y - d / 2, d, d);
}

/** Paint a fruit `size` pixels across, centred on (x, y). */
export function drawFruit(ctx: Ctx, fruit: SnakeFruit, x: number, y: number, size: number) {
  const detail = size >= 22;
  stamp(ctx, `${fruit}${detail ? "+" : ""}`, x, y, size, (c, px) => paintFruit(c, fruit, 0, 0, px, detail));
}

export function drawPoison(ctx: Ctx, x: number, y: number, size: number) {
  stamp(ctx, "poison", x, y, size, (c, px) => paintPoison(c, 0, 0, px));
}

export function drawKey(ctx: Ctx, x: number, y: number, size: number, hue: string) {
  stamp(ctx, `key${hue}`, x, y, size, (c, px) => paintKey(c, 0, 0, px, hue));
}

export function drawLockBox(ctx: Ctx, x: number, y: number, size: number, fruit: SnakeFruit, hue: string) {
  stamp(ctx, `lock${fruit}${hue}`, x, y, size, (c, px) => paintLockBox(c, 0, 0, px, fruit, hue));
}

export function drawCrate(ctx: Ctx, x: number, y: number, size: number, fruit: SnakeFruit, hue: string) {
  stamp(ctx, `crate${fruit}${hue}`, x, y, size, (c, px) => paintCrate(c, 0, 0, px, fruit, hue));
}

/** A fruit, or a small heap of three for Fruit Salad. */
export function drawFruitChoice(ctx: Ctx, choice: SnakeFruitChoice, x: number, y: number, size: number) {
  if (choice !== "salad") return drawFruit(ctx, choice, x, y, size);
  drawFruit(ctx, "banana", x - size * 0.17, y - size * 0.14, size * 0.6);
  drawFruit(ctx, "kiwi", x + size * 0.2, y - size * 0.12, size * 0.5);
  drawFruit(ctx, "strawberry", x + size * 0.02, y + size * 0.16, size * 0.58);
}

/** Gray poison fruit with a skull: dull, desaturated and marked so it never passes for food. */
function paintPoison(ctx: Ctx, x: number, y: number, size: number) {
  paint(ctx, x, y, size, () => {
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.bezierCurveTo(14, -38, 44, -32, 42, -4);
      ctx.bezierCurveTo(41, 22, 24, 42, 0, 40);
      ctx.bezierCurveTo(-24, 42, -41, 22, -42, -4);
      ctx.bezierCurveTo(-44, -32, -14, -38, 0, -24);
      ctx.closePath();
    };
    stem(ctx, 0, -22, -4, -34, -10, -42, 5);
    cel(ctx, shape, "#9c98a3", "#5d5966", { gloss: false });
    dot(ctx, 0, 2, 16, "#f4f1ea");
    ctx.beginPath();
    ctx.roundRect(-9, 12, 18, 10, 3);
    ctx.fillStyle = "#f4f1ea";
    ctx.fill();
    dot(ctx, -6, 0, 5, INK);
    dot(ctx, 6, 0, 5, INK);
    ctx.beginPath();
    ctx.moveTo(-4, 14);
    ctx.lineTo(-4, 22);
    ctx.moveTo(4, 14);
    ctx.lineTo(4, 22);
    ink(ctx, 2.5);
  });
}

/** A golden key whose bow carries the color of the box it opens. */
function paintKey(ctx: Ctx, x: number, y: number, size: number, hue: string) {
  paint(ctx, x, y, size, () => {
    ctx.rotate(-0.75);
    const shaft = () => {
      ctx.beginPath();
      ctx.roundRect(-4, -6, 46, 12, 5);
      ctx.rect(26, 4, 8, 14);
      ctx.rect(36, 4, 7, 10);
    };
    cel(ctx, shaft, "#ffd34d", "#c48b00", { line: 4.5, shift: 3, gloss: false });
    ctx.save();
    ctx.translate(-18, 0);
    cel(ctx, circle(0, 0, 22)(ctx), "#ffd34d", "#c48b00", { line: 5, shift: 4, gloss: false });
    dot(ctx, 0, 0, 10, hue);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ink(ctx, 4);
    ctx.restore();
  });
}

/** A barred box with the fruit visible inside and a padlock in the matching color. */
function paintLockBox(ctx: Ctx, x: number, y: number, size: number, fruit: SnakeFruit, hue: string) {
  paint(ctx, x, y, size, () => {
    ctx.beginPath();
    ctx.roundRect(-44, -44, 88, 88, 14);
    ctx.fillStyle = "rgb(30 20 30 / 0.28)";
    ctx.fill();
  });
  drawFruit(ctx, fruit, x, y - size * 0.04, size * 0.66);
  paint(ctx, x, y, size, () => {
    ctx.beginPath();
    for (const bx of [-20, 0, 20]) {
      ctx.moveTo(bx, -42);
      ctx.lineTo(bx, 42);
    }
    ink(ctx, 9);
    ctx.beginPath();
    for (const bx of [-20, 0, 20]) {
      ctx.moveTo(bx, -42);
      ctx.lineTo(bx, 42);
    }
    ink(ctx, 4, "#d9d4de");
    ctx.beginPath();
    ctx.roundRect(-44, -44, 88, 88, 14);
    ink(ctx, 12);
    ctx.beginPath();
    ctx.roundRect(-44, -44, 88, 88, 14);
    ink(ctx, 6, hue);
    ctx.translate(0, 26);
    ctx.beginPath();
    ctx.arc(0, -12, 9, Math.PI, 0);
    ink(ctx, 9);
    ctx.beginPath();
    ctx.arc(0, -12, 9, Math.PI, 0);
    ink(ctx, 4, "#d9d4de");
    cel(
      ctx,
      () => {
        ctx.beginPath();
        ctx.roundRect(-14, -12, 28, 22, 5);
      },
      hue,
      "rgb(0 0 0 / 0.35)",
      { line: 4, shift: 2.5, gloss: false },
    );
    dot(ctx, 0, -2, 3.5, INK);
  });
}

/** A wooden crate with a colored band matching its target and the fruit it holds on a label. */
function paintCrate(ctx: Ctx, x: number, y: number, size: number, fruit: SnakeFruit, hue: string) {
  paint(ctx, x, y, size, () => {
    const box = () => {
      ctx.beginPath();
      ctx.roundRect(-44, -44, 88, 88, 10);
    };
    cel(ctx, box, "#d39457", "#94592b", { gloss: false });
    ctx.beginPath();
    ctx.moveTo(-34, -34);
    ctx.lineTo(34, 34);
    ctx.moveTo(-44, -18);
    ctx.lineTo(44, -18);
    ctx.moveTo(-44, 18);
    ctx.lineTo(44, 18);
    ink(ctx, 3, "rgb(90 50 20 / 0.6)");
    ctx.beginPath();
    ctx.rect(-44, -6, 88, 12);
    ctx.fillStyle = hue;
    ctx.fill();
    ink(ctx, 3);
    dot(ctx, 0, 0, 19, "#fff6e4");
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI * 2);
    ink(ctx, 3.5);
    for (const [nx, ny] of [
      [-36, -36],
      [36, -36],
      [-36, 36],
      [36, 36],
    ]) dot(ctx, nx, ny, 3, INK);
    box();
    ink(ctx, 5.5);
  });
  drawFruit(ctx, fruit, x, y, size * 0.34);
}

/** The pad a crate must be pushed onto. */
export function drawTarget(ctx: Ctx, x: number, y: number, size: number, hue: string, pulse: number) {
  paint(ctx, x, y, size, () => {
    ctx.beginPath();
    ctx.arc(0, 0, 38 + pulse * 4, 0, Math.PI * 2);
    ctx.fillStyle = hue;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash([10, 8]);
    ink(ctx, 5, hue);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(-14, -14);
    ctx.lineTo(14, 14);
    ctx.moveTo(14, -14);
    ctx.lineTo(-14, 14);
    ink(ctx, 9);
    ctx.beginPath();
    ctx.moveTo(-14, -14);
    ctx.lineTo(14, 14);
    ctx.moveTo(14, -14);
    ctx.lineTo(-14, 14);
    ink(ctx, 5, hue);
  });
}

/** A swirling portal; linked portals share a color. `spin` turns the swirl. */
export function drawPortal(ctx: Ctx, x: number, y: number, size: number, hue: string, spin: number) {
  paint(ctx, x, y, size, () => {
    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 44, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#1c1428";
    ctx.fill();
    ctx.save();
    ctx.rotate(spin);
    for (let arm = 0; arm < 3; arm += 1) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      for (let k = 0; k <= 16; k += 1) {
        const a = k * 0.28;
        const r = 4 + k * 2.3;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ink(ctx, 6, hue);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, 0, 42, 42, 0, 0, Math.PI * 2);
    ink(ctx, 12);
    ctx.beginPath();
    ctx.ellipse(0, 0, 42, 42, 0, 0, Math.PI * 2);
    ink(ctx, 7, hue);
  });
}

/** A rounded boulder (Obstacles). */
export function drawStone(ctx: Ctx, x: number, y: number, size: number, seed: number) {
  paint(ctx, x, y, size, () => {
    const wob = (k: number) => 40 + Math.sin(seed * 1.7 + k * 2.3) * 4;
    const shape = () => {
      ctx.beginPath();
      const start = (-0.5 / 8) * Math.PI * 2;
      ctx.moveTo(Math.cos(start) * wob(-0.5), Math.sin(start) * wob(-0.5));
      for (let k = 0; k < 8; k += 1) {
        const a = (k / 8) * Math.PI * 2;
        const r = wob(k);
        const next = ((k + 0.5) / 8) * Math.PI * 2;
        ctx.quadraticCurveTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08, Math.cos(next) * wob(k + 0.5), Math.sin(next) * wob(k + 0.5));
      }
      ctx.closePath();
    };
    cel(ctx, shape, "#a39c95", "#6b645e");
    ctx.beginPath();
    ctx.moveTo(10, -12);
    ctx.lineTo(18, 0);
    ctx.lineTo(12, 12);
    ink(ctx, 3, "rgb(60 50 50 / 0.6)");
  });
}

/** A red brick block (Wall). */
export function drawBrick(ctx: Ctx, x: number, y: number, size: number) {
  paint(ctx, x, y, size, () => {
    const shape = () => {
      ctx.beginPath();
      ctx.roundRect(-45, -45, 90, 90, 12);
    };
    cel(ctx, shape, "#d7603f", "#93351f", { gloss: false });
    ctx.beginPath();
    ctx.moveTo(-45, -15);
    ctx.lineTo(45, -15);
    ctx.moveTo(-45, 15);
    ctx.lineTo(45, 15);
    ctx.moveTo(0, -45);
    ctx.lineTo(0, -15);
    ctx.moveTo(-22, -15);
    ctx.lineTo(-22, 15);
    ctx.moveTo(22, -15);
    ctx.lineTo(22, 15);
    ctx.moveTo(0, 15);
    ctx.lineTo(0, 45);
    ink(ctx, 4, "#f0d6c4");
    shape();
    ink(ctx, 5.5);
  });
}

/** A carved stone snake segment (Statue). */
export function drawStatue(ctx: Ctx, x: number, y: number, size: number) {
  paint(ctx, x, y, size, () => {
    const shape = () => {
      ctx.beginPath();
      ctx.roundRect(-42, -42, 84, 84, 30);
    };
    cel(ctx, shape, "#a7b0a2", "#6a7466");
    ctx.beginPath();
    ctx.arc(-12, -6, 10, 0.2, Math.PI - 0.2);
    ctx.moveTo(22, 4);
    ctx.arc(12, 4, 10, 0.2, Math.PI - 0.2);
    ctx.moveTo(4, 20);
    ctx.arc(-4, 20, 8, 0.2, Math.PI - 0.2);
    ink(ctx, 3, "rgb(50 60 50 / 0.55)");
    dot(ctx, 24, -24, 6, "#6fa35a");
  });
}

/** A Dimension crystal; inactive layers show only a dashed ghost of it. */
export function drawCrystal(ctx: Ctx, x: number, y: number, size: number, hue: string, active: boolean) {
  paint(ctx, x, y, size, () => {
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.lineTo(36, -14);
      ctx.lineTo(26, 40);
      ctx.lineTo(-26, 40);
      ctx.lineTo(-36, -14);
      ctx.closePath();
    };
    if (!active) {
      shape();
      ctx.setLineDash([8, 8]);
      ink(ctx, 4, hue);
      ctx.setLineDash([]);
      return;
    }
    cel(ctx, shape, hue, "rgb(20 10 40 / 0.45)");
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.lineTo(0, 40);
    ctx.moveTo(-36, -14);
    ctx.lineTo(0, 0);
    ctx.lineTo(36, -14);
    ink(ctx, 2.5, "rgb(255 255 255 / 0.5)");
    shape();
    ink(ctx, 5);
  });
}

/** A landmine with a blinking light; `blink` is 0–1. */
export function drawMine(ctx: Ctx, x: number, y: number, size: number, blink: number) {
  paint(ctx, x, y, size, () => {
    ctx.beginPath();
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
      ctx.lineTo(Math.cos(a) * 38, Math.sin(a) * 38);
    }
    ink(ctx, 9);
    cel(ctx, circle(0, 0, 28)(ctx), "#4a4452", "#25202c");
    dot(ctx, 0, -4, 8, blink > 0.5 ? "#ff3b3b" : "#7a1f1f");
    ctx.beginPath();
    ctx.arc(0, -4, 8, 0, Math.PI * 2);
    ink(ctx, 3);
  });
}
