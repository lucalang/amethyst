"use client";

import type { SnakeFruit, SnakeFruitChoice } from "@/lib/snake";

/** Each fruit's main color, used for its eating burst. */
export const FRUIT_COLORS: Record<SnakeFruit, string> = {
  apple: "#e8333a",
  cherry: "#d3123c",
  orange: "#ff9417",
  strawberry: "#f0304a",
  grapes: "#8a3fd1",
  banana: "#ffd23f",
  watermelon: "#ff4d6a",
};

type Ctx = CanvasRenderingContext2D;

function radial(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]) {
  const gradient = ctx.createRadialGradient(x, y, r * 0.08, x, y, r);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  return gradient;
}

function outline(ctx: Ctx, color: string, width = 4) {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function shine(ctx: Ctx, x: number, y: number, rx: number, ry: number, rotation = -0.6, alpha = 0.55) {
  ctx.fillStyle = `rgb(255 255 255 / ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  ctx.fill();
}

function leaf(ctx: Ctx, x: number, y: number, length: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(length * 0.5, -length * 0.42, length, 0);
  ctx.quadraticCurveTo(length * 0.5, length * 0.42, 0, 0);
  ctx.fillStyle = "#3fae4a";
  ctx.fill();
  outline(ctx, "#1f6b2b", 3);
  ctx.beginPath();
  ctx.moveTo(length * 0.1, 0);
  ctx.lineTo(length * 0.8, 0);
  ctx.strokeStyle = "rgb(255 255 255 / 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function stem(ctx: Ctx, points: [number, number, number, number, number, number], width = 5) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  ctx.quadraticCurveTo(points[2], points[3], points[4], points[5]);
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = "#6b4226";
  ctx.stroke();
}

/** Artwork in a 100-unit box centred on the origin. `detail` adds texture that only reads at larger sizes. */
const PAINTERS: Record<SnakeFruit, (ctx: Ctx, detail: boolean) => void> = {
  apple(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -24);
    ctx.bezierCurveTo(14, -36, 42, -32, 41, -4);
    ctx.bezierCurveTo(40, 22, 24, 41, 9, 39);
    ctx.bezierCurveTo(4, 38, -4, 38, -9, 39);
    ctx.bezierCurveTo(-24, 41, -40, 22, -41, -4);
    ctx.bezierCurveTo(-42, -32, -14, -36, 0, -24);
    ctx.fillStyle = radial(ctx, -14, -12, 56, [[0, "#ff8a7a"], [0.45, "#e8333a"], [1, "#9e1420"]]);
    ctx.fill();
    outline(ctx, "#6e0d16");
    stem(ctx, [0, -22, 0, -34, 6, -44]);
    leaf(ctx, 6, -34, 26, -0.55);
    shine(ctx, -20, -10, 7, 12, 0.5, 0.5);
  },
  cherry(ctx) {
    stem(ctx, [-14, 12, -6, -24, 10, -42], 4);
    stem(ctx, [18, 18, 18, -18, 10, -42], 4);
    leaf(ctx, 10, -42, 24, -0.25);
    for (const [x, y] of [
      [-16, 22],
      [18, 26],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 19, 0, Math.PI * 2);
      ctx.fillStyle = radial(ctx, x - 7, y - 7, 24, [[0, "#ff6b7d"], [0.5, "#d3123c"], [1, "#7d0620"]]);
      ctx.fill();
      outline(ctx, "#5c0417");
      shine(ctx, x - 7, y - 7, 4, 7, 0.6, 0.6);
    }
  },
  orange(ctx, detail) {
    ctx.beginPath();
    ctx.arc(0, 4, 40, 0, Math.PI * 2);
    ctx.fillStyle = radial(ctx, -14, -10, 58, [[0, "#ffc56b"], [0.5, "#ff9417"], [1, "#c25a00"]]);
    ctx.fill();
    outline(ctx, "#8a3d00");
    if (detail) {
      ctx.fillStyle = "rgb(150 60 0 / 0.28)";
      for (const [x, y] of [
        [-18, 18],
        [12, 22],
        [22, -2],
        [-4, 30],
        [-26, 2],
        [26, 18],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.arc(0, -35, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#5d7a1f";
    ctx.fill();
    leaf(ctx, 2, -36, 24, -0.35);
    shine(ctx, -18, -12, 7, 12, 0.6, 0.45);
  },
  strawberry(ctx, detail) {
    ctx.beginPath();
    ctx.moveTo(0, 44);
    ctx.bezierCurveTo(-28, 32, -42, 4, -37, -14);
    ctx.bezierCurveTo(-32, -30, -12, -30, 0, -26);
    ctx.bezierCurveTo(12, -30, 32, -30, 37, -14);
    ctx.bezierCurveTo(42, 4, 28, 32, 0, 44);
    ctx.fillStyle = radial(ctx, -12, -8, 56, [[0, "#ff7a86"], [0.5, "#f0304a"], [1, "#a0102a"]]);
    ctx.fill();
    outline(ctx, "#6b0a1d");
    ctx.fillStyle = "#ffe08a";
    const seeds = detail
      ? [[-20, -10], [0, -12], [20, -10], [-24, 6], [-8, 4], [8, 4], [24, 6], [-14, 20], [2, 20], [16, 20], [-4, 33], [8, 33]]
      : [[-14, -6], [12, -6], [-6, 12], [10, 14], [0, 28]];
    for (const [x, y] of seeds) {
      ctx.beginPath();
      ctx.ellipse(x, y, 2.4, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const turn of [0.95, 0.72, 0.5, 0.28, 0.05]) leaf(ctx, 0, -27, 21, Math.PI * turn);
    stem(ctx, [0, -28, 0, -36, 4, -42], 4);
    shine(ctx, -18, -6, 5, 10, 0.4, 0.45);
  },
  grapes(ctx) {
    stem(ctx, [0, -18, 0, -32, 6, -42], 5);
    leaf(ctx, 3, -31, 26, -0.45);
    const berries: [number, number][] = [
      [0, 32],
      [-12, 12],
      [12, 12],
      [-24, -8],
      [0, -8],
      [24, -8],
    ];
    for (const [x, y] of berries) berry(ctx, x, y);
  },
  banana(ctx) {
    ctx.save();
    ctx.rotate(-0.2);
    ctx.beginPath();
    ctx.moveTo(-34, -28);
    ctx.quadraticCurveTo(-34, 36, 42, 18);
    ctx.quadraticCurveTo(44, 12, 38, 10);
    ctx.quadraticCurveTo(-8, 12, -22, -30);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(-30, 30, 0, -10);
    gradient.addColorStop(0, "#e0a800");
    gradient.addColorStop(0.5, "#ffd23f");
    gradient.addColorStop(1, "#fff09a");
    ctx.fillStyle = gradient;
    ctx.fill();
    outline(ctx, "#8a6100");
    ctx.beginPath();
    ctx.moveTo(-27, -22);
    ctx.quadraticCurveTo(-24, 28, 38, 14);
    ctx.strokeStyle = "rgb(160 110 0 / 0.45)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-34, -28);
    ctx.lineTo(-30, -38);
    ctx.lineTo(-23, -36);
    ctx.lineTo(-22, -30);
    ctx.closePath();
    ctx.fillStyle = "#6b4a1a";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(41, 15, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#4a3210";
    ctx.fill();
    ctx.restore();
  },
  watermelon(ctx, detail) {
    ctx.save();
    ctx.rotate(-0.18);
    ctx.translate(0, -10);
    ctx.beginPath();
    ctx.moveTo(-44, 0);
    ctx.arc(0, 0, 44, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = "#2f8f3a";
    ctx.fill();
    outline(ctx, "#174d1f");
    ctx.beginPath();
    ctx.moveTo(-38, 0);
    ctx.arc(0, 0, 38, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = "#c9f2a4";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-34, 0);
    ctx.arc(0, 0, 34, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, 0, 0, 36, [[0, "#ff8095"], [0.7, "#ff4d6a"], [1, "#e0304e"]]);
    ctx.fill();
    ctx.fillStyle = "#2a1a1e";
    const seeds = detail
      ? [[-18, 8], [0, 12], [18, 8], [-9, 22], [9, 22]]
      : [[-12, 10], [12, 10], [0, 20]];
    for (const [x, y] of seeds) {
      ctx.beginPath();
      ctx.ellipse(x, y, 2.6, 4.2, x / 40, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
};

function berry(ctx: Ctx, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y, 12.5, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, x - 5, y - 5, 16, [[0, "#c58cff"], [0.5, "#8a3fd1"], [1, "#4b1880"]]);
  ctx.fill();
  outline(ctx, "#33105a", 3);
  shine(ctx, x - 4, y - 5, 2.6, 4.2, 0.6, 0.55);
}

/** Paint a fruit `size` pixels across, centred on (x, y). */
export function drawFruit(ctx: Ctx, fruit: SnakeFruit, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = "round";
  PAINTERS[fruit](ctx, size >= 20);
  ctx.restore();
}

/** A fruit, or a small heap of three for Fruit Salad. */
export function drawFruitChoice(ctx: Ctx, choice: SnakeFruitChoice, x: number, y: number, size: number) {
  if (choice !== "salad") return drawFruit(ctx, choice, x, y, size);
  drawFruit(ctx, "banana", x - size * 0.17, y - size * 0.14, size * 0.62);
  drawFruit(ctx, "grapes", x + size * 0.2, y - size * 0.1, size * 0.58);
  drawFruit(ctx, "apple", x, y + size * 0.16, size * 0.62);
}
