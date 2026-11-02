import {
  AdditiveBlending,
  BoxGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import { glowSprite } from "./core";
import {
  AMETHYST,
  clamp01,
  easeBack,
  easeInOut,
  easeOut,
  GOLD,
  lerp,
  paint,
  type PieceBuilder,
  random,
  ROSE,
  slab,
  smooth,
} from "./kit";

const TAU = Math.PI * 2;

/** Little screen paintings for the hall's cabinets, one per game. */
const SCREENS: ((ctx: CanvasRenderingContext2D, w: number, h: number) => void)[] = [
  (ctx, w, h) => {
    const colors = ["#3b2a5c", "#bd9bff", "#8a5cff", "#f472a8", "#ffc35a", "#5a3d8c", "#ff8a5c", "#a57cff", "#ffd6f0"];
    const s = (h - 40) / 3;
    colors.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(w / 2 - 1.5 * s + (i % 3) * s + 4, 20 + Math.floor(i / 3) * s + 4, s - 8, s - 8, 10);
      ctx.fill();
    });
  },
  (ctx, w, h) => {
    ctx.fillStyle = "#4fd6ec";
    for (const [x, gap] of [[0.25, 0.45], [0.7, 0.6]]) {
      ctx.fillRect(w * x, 0, 26, h * gap - 40);
      ctx.fillRect(w * x, h * gap + 40, 26, h);
    }
    ctx.fillStyle = "#bd9bff";
    ctx.beginPath();
    ctx.moveTo(w * 0.45, h * 0.5);
    ctx.lineTo(w * 0.52, h * 0.42);
    ctx.lineTo(w * 0.59, h * 0.5);
    ctx.lineTo(w * 0.52, h * 0.58);
    ctx.fill();
  },
  (ctx, w, h) => {
    ctx.strokeStyle = "#4dd67a";
    ctx.lineWidth = 22;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h * 0.75);
    ctx.lineTo(w * 0.6, h * 0.75);
    ctx.lineTo(w * 0.6, h * 0.4);
    ctx.lineTo(w * 0.35, h * 0.4);
    ctx.stroke();
    ctx.fillStyle = "#ff4d6a";
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.3, 14, 0, TAU);
    ctx.fill();
  },
  (ctx, w, h) => {
    const s = (h - 30) / 3;
    ctx.strokeStyle = "#cbb8ff";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 - 1.5 * s + i * s, 15);
      ctx.lineTo(w / 2 - 1.5 * s + i * s, h - 15);
      ctx.moveTo(w / 2 - 1.5 * s, 15 + i * s);
      ctx.lineTo(w / 2 + 1.5 * s, 15 + i * s);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${s * 0.6}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [i, digit] of [[0, "5"], [4, "3"], [8, "9"], [2, "7"]] as const) ctx.fillText(digit, w / 2 - s + (i % 3) * s, 15 + s / 2 + Math.floor(i / 3) * s);
  },
  (ctx, w, h) => {
    for (const [x, y, r, color] of [[0.3, 0.6, 26, "#ff9a3c"], [0.55, 0.35, 30, "#4dd67a"], [0.75, 0.65, 22, "#ff4d6a"]] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(w * x, h * y, r, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.85);
    ctx.lineTo(w * 0.9, h * 0.15);
    ctx.stroke();
  },
  (ctx, w, h) => {
    const colors = ["#5a3d8c", "#8a5cff", "#bd9bff", "#f472a8", "#ff8a5c", "#ffc35a"];
    colors.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(w / 2 - 70 + Math.sin(i * 2.1) * 14, h - 30 - (i + 1) * 28, 140 - i * 6, 24);
    });
  },
];
const SCREEN_GLOW = [0xa57cff, 0x4fd6ec, 0x4dd67a, 0xcbb8ff, 0xff9a3c, 0xf472a8];

export const arcade: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const hall = new Group();
  group.add(hall);
  const body = keep(new BoxGeometry(0.72, 2, 0.7));
  const bodyMaterial = keep(new MeshStandardMaterial({ color: 0x1a1030, metalness: 0.4, roughness: 0.45 }));
  const marqueeGeometry = keep(new BoxGeometry(0.74, 0.26, 0.74));
  const panelGeometry = keep(new BoxGeometry(0.72, 0.06, 0.34));
  const screenGeometry = keep(new PlaneGeometry(0.58, 0.5));
  const knob = keep(new SphereGeometry(0.05, 12, 8));
  const stick = keep(new CylinderGeometry(0.015, 0.015, 0.14, 6));
  const edges = keep(new EdgesGeometry(body));
  const cabinets = SCREENS.map((draw, i) => {
    const cabinet = new Group();
    const color = SCREEN_GLOW[i];
    cabinet.add(new Mesh(body, bodyMaterial));
    cabinet.add(new LineSegments(edges, keep(new LineBasicMaterial({ color, transparent: true, opacity: 0.55, blending: AdditiveBlending }))));
    const marquee = new Mesh(marqueeGeometry, keep(new MeshBasicMaterial({ color })));
    marquee.position.y = 1.13;
    const screen = new Mesh(screenGeometry, keep(new MeshBasicMaterial({ map: kit.texture(paint(256, 220, (ctx) => {
      ctx.fillStyle = "#0b0716";
      ctx.fillRect(0, 0, 256, 220);
      draw(ctx, 256, 220);
    })) })));
    screen.position.set(0, 0.48, 0.355);
    screen.rotation.x = -0.12;
    const panel = new Mesh(panelGeometry, bodyMaterial);
    panel.position.set(0, -0.02, 0.45);
    panel.rotation.x = 0.35;
    const ball = new Mesh(knob, keep(new MeshBasicMaterial({ color })));
    ball.position.set(-0.15, 0.1, 0.47);
    const shaft = new Mesh(stick, bodyMaterial);
    shaft.position.set(-0.15, 0.04, 0.47);
    cabinet.add(marquee, screen, panel, ball, shaft);
    const a = (i - 2.5) * 0.3;
    cabinet.position.set(Math.sin(a) * 3.4, -0.2, 3.4 - Math.cos(a) * 3.4 - 0.6);
    cabinet.rotation.y = -a;
    hall.add(cabinet);
    return cabinet;
  });

  const sign = new Mesh(
    keep(new PlaneGeometry(3, 0.75)),
    keep(
      new MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        map: kit.texture(
          paint(1024, 256, (ctx) => {
            ctx.font = "800 170px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "#f472a8";
            ctx.shadowBlur = 40;
            ctx.fillStyle = "#ffe1f0";
            ctx.fillText("ARCADE", 512, 136);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "#f472a8";
            ctx.lineWidth = 6;
            ctx.strokeText("ARCADE", 512, 136);
          }),
        ),
      }),
    ),
  );
  sign.position.set(0, 1.75, -0.4);
  const signGlow = glowSprite(kit, "rgba(244,114,168,0.5)", 4.5);
  signGlow.position.set(0, 1.75, -0.6);
  hall.add(sign, signGlow);

  const coinGeometry = keep(new CylinderGeometry(0.16, 0.16, 0.035, 32));
  const coinMaterial = keep(new MeshStandardMaterial({ color: GOLD, metalness: 0.95, roughness: 0.22, emissive: 0x4a2a00 }));
  const rand = random(5);
  const coins = Array.from({ length: 12 }, () => {
    const coin = new Mesh(coinGeometry, coinMaterial);
    hall.add(coin);
    return { coin, angle: rand() * TAU, radius: 1 + rand() * 1.6, y: rand() * 2.4 - 0.9, speed: 0.3 + rand() * 0.4 };
  });

  return {
    group,
    key: new Color(0xffd6f0),
    rim: new Color(0x4fd6ec),
    place(layout) {
      hall.scale.setScalar(layout === "tall" ? 0.66 : 0.72);
    },
    update({ t, hold, clock, idle }) {
      cabinets.forEach((cabinet, i) => {
        const enter = easeOut(smooth(-0.75 + i * 0.06, -0.2 + i * 0.06, t));
        cabinet.scale.setScalar(Math.max(0.001, enter));
      });
      sign.material.opacity = 0.75 + (idle ? Math.sin(clock * 3) * 0.08 + Math.sin(clock * 17) * 0.04 : 0.15);
      coins.forEach(({ coin, angle, radius, y, speed }, i) => {
        const a = angle + (idle ? clock * speed : 0) + hold * 2;
        coin.position.set(Math.cos(a) * radius, y + Math.sin(a * 2 + i) * 0.15, 1.2 + Math.sin(a) * radius * 0.4);
        coin.rotation.set(Math.PI / 2, 0, a * 2);
      });
    },
  };
};

/* 2048 */

const TILE_COLORS: Record<number, [string, string]> = {
  2: ["#efe6ff", "#3b2a5c"],
  4: ["#dccbff", "#3b2a5c"],
  8: ["#bd9bff", "#1b0b2e"],
  16: ["#a57cff", "#ffffff"],
  32: ["#8a5cff", "#ffffff"],
  64: ["#6b3fe0", "#ffffff"],
  128: ["#f472a8", "#ffffff"],
  256: ["#e2508c", "#ffffff"],
  512: ["#ff8a5c", "#ffffff"],
  1024: ["#ffa94d", "#ffffff"],
  2048: ["#ffc35a", "#3d1f00"],
};

export const game2048: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const board = new Group();
  group.add(board);
  const pitch = 0.8;
  const face = kit.texture(
    paint(512, 512, (ctx) => {
      ctx.fillStyle = "#1c1330";
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "#2c2046";
      for (let i = 0; i < 16; i++) {
        ctx.beginPath();
        ctx.roundRect(26 + (i % 4) * 117, 26 + Math.floor(i / 4) * 117, 108, 108, 16);
        ctx.fill();
      }
    }),
  );
  const side = keep(new MeshStandardMaterial({ color: 0x140d24, roughness: 0.5, metalness: 0.3 }));
  board.add(new Mesh(keep(slab(3.4, 3.4, 0.2, 0.26, 0.03)), [keep(new MeshStandardMaterial({ map: face, roughness: 0.6 })), side]));
  const tileGeometry = keep(slab(0.7, 0.7, 0.16, 0.11, 0.02));
  const materials = new Map<number, Material[]>();
  const tileMaterials = (value: number) => {
    let found = materials.get(value);
    if (!found) {
      const [bg, fg] = TILE_COLORS[value];
      const map = kit.texture(
        paint(128, 128, (ctx) => {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, 128, 128);
          const label = String(value);
          ctx.font = `800 ${label.length > 3 ? 38 : label.length > 2 ? 46 : 58}px system-ui, sans-serif`;
          ctx.fillStyle = fg;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, 64, 68);
        }),
      );
      found = [
        keep(new MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: value === 2048 ? 0.7 : 0.28, roughness: 0.35 })),
        keep(new MeshStandardMaterial({ color: new Color(bg).multiplyScalar(0.55), roughness: 0.4 })),
      ];
      materials.set(value, found);
    }
    return found;
  };
  // A late-game board, swiped left: only the top row moves, merging two 1024s.
  const values = [
    [512, 1024, 0, 1024],
    [256, 128, 64, 32],
    [8, 16, 4, 2],
    [2, 4, 2, 0],
  ];
  const cell = (row: number, col: number) => new Vector3((col - 1.5) * pitch, (1.5 - row) * pitch, 0.19);
  const tiles: { mesh: Mesh; home: Vector3; order: number }[] = [];
  values.forEach((row, r) =>
    row.forEach((value, c) => {
      if (!value) return;
      const mesh = new Mesh(tileGeometry, tileMaterials(value));
      board.add(mesh);
      tiles.push({ mesh, home: cell(r, c), order: tiles.length });
    }),
  );
  const merged = tiles[1];
  const mover = tiles[2];
  const spawn = new Mesh(tileGeometry, tileMaterials(2));
  board.add(spawn);
  const spawnAt = cell(0, 3);
  const glow = glowSprite(kit, "rgba(255,195,90,0.8)", 2.6);
  board.add(glow);
  tileMaterials(2048);

  return {
    group,
    key: new Color(0xffe8c7),
    rim: new Color(AMETHYST),
    place(layout) {
      board.rotation.set(layout === "tall" ? -0.2 : -0.28, layout === "tall" ? 0 : -0.3, 0.04);
      board.scale.setScalar(layout === "tall" ? 0.95 : 1);
    },
    update({ t, hold, clock, idle }) {
      for (const tile of tiles) {
        const enter = easeOut(smooth(-0.7 + tile.order * 0.025, -0.25 + tile.order * 0.025, t));
        tile.mesh.position.copy(tile.home);
        tile.mesh.position.z += (1 - enter) * 2.5;
        tile.mesh.scale.setScalar(Math.max(0.001, enter));
      }
      const slide = easeInOut(smooth(0.15, 0.45, hold));
      mover.mesh.position.x = lerp(mover.home.x, merged.home.x, slide);
      const done = hold >= 0.45;
      mover.mesh.visible = !done;
      merged.mesh.material = tileMaterials(done ? 2048 : 1024);
      const pop = smooth(0.45, 0.62, hold);
      merged.mesh.scale.setScalar(done ? 1 + Math.sin(pop * Math.PI) * 0.28 : merged.mesh.scale.x);
      merged.mesh.position.z += done ? 0.15 + (idle ? Math.sin(clock * 2) * 0.03 : 0) : 0;
      glow.position.copy(merged.mesh.position);
      glow.material.opacity = smooth(0.45, 0.6, hold);
      spawn.position.copy(spawnAt);
      spawn.scale.setScalar(Math.max(0.001, easeBack(smooth(0.7, 0.85, hold))));
    },
  };
};

/* Flutter */

export const gameFlutter: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const course = new Group();
  group.add(course);
  const crystal = keep(
    new MeshPhysicalMaterial({ color: 0x7fe6ff, emissive: 0x0b3b55, emissiveIntensity: 0.6, roughness: 0.12, metalness: 0.1, clearcoat: 1, iridescence: 0.6, flatShading: true }),
  );
  const prism = keep(new CylinderGeometry(0.3, 0.3, 1, 6));
  const tip = keep(new ConeGeometry(0.3, 0.45, 6));
  const pillars = [
    { x: -1.7, gap: 0.55, z: -0.3 },
    { x: 0, gap: -0.45, z: 0.1 },
    { x: 1.7, gap: 0.35, z: -0.2 },
  ];
  const half = 0.72;
  const columns = pillars.map(({ x, gap, z }) => {
    const column = new Group();
    for (const dir of [1, -1]) {
      const end = gap + dir * half;
      const length = 2.4 - dir * end;
      const shaft = new Mesh(prism, crystal);
      shaft.scale.y = length;
      shaft.position.y = end + dir * (length / 2 + 0.2);
      const point = new Mesh(tip, crystal);
      point.position.y = end + dir * 0.02;
      point.rotation.z = dir > 0 ? Math.PI : 0;
      column.add(shaft, point);
    }
    column.position.set(x, 0, z);
    course.add(column);
    return column;
  });

  const bird = new Group();
  const bodyMaterial = keep(new MeshPhysicalMaterial({ color: 0xb48cff, emissive: 0x3b1785, emissiveIntensity: 0.6, roughness: 0.15, clearcoat: 1, flatShading: true }));
  const birdBody = new Mesh(keep(new OctahedronGeometry(0.24, 0)), bodyMaterial);
  birdBody.scale.set(1.35, 1, 1);
  const wingShape = new Shape();
  wingShape.moveTo(-0.14, 0);
  wingShape.lineTo(0.14, 0);
  wingShape.lineTo(-0.05, 0.42);
  wingShape.lineTo(-0.14, 0);
  const wingGeometry = keep(new ShapeGeometry(wingShape));
  const wingMaterial = keep(new MeshBasicMaterial({ color: 0xf0e6ff, side: DoubleSide, transparent: true, opacity: 0.9 }));
  const wings = [1, -1].map((dir) => {
    const pivot = new Group();
    const wing = new Mesh(wingGeometry, wingMaterial);
    wing.rotation.x = (dir * Math.PI) / 2;
    pivot.add(wing);
    pivot.position.y = 0.08;
    bird.add(pivot);
    return { pivot, dir };
  });
  const eye = new Mesh(keep(new SphereGeometry(0.05, 10, 8)), keep(new MeshBasicMaterial({ color: 0xffffff })));
  eye.position.set(0.18, 0.07, 0.1);
  bird.add(birdBody, eye);
  bird.scale.setScalar(1.5);
  const birdGlow = glowSprite(kit, "rgba(190,150,255,0.6)", 1.3);
  bird.add(birdGlow);
  course.add(bird);
  const path = new CatmullRomCurve3([
    new Vector3(-3, -0.2, 0.2),
    new Vector3(-1.7, 0.55, 0),
    new Vector3(-0.85, 0.2, 0.2),
    new Vector3(0, -0.45, 0.35),
    new Vector3(0.85, 0, 0.2),
    new Vector3(1.7, 0.35, 0.1),
    new Vector3(3, 0.8, 0.2),
  ]);
  const trailMaterial = keep(new MeshBasicMaterial({ color: 0xd9c6ff, transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false }));
  const trailGeometry = keep(new OctahedronGeometry(0.05, 0));
  const trail = Array.from({ length: 10 }, () => {
    const spark = new Mesh(trailGeometry, trailMaterial);
    course.add(spark);
    return spark;
  });
  const ahead = new Vector3();

  return {
    group,
    key: new Color(0xd6f6ff),
    rim: new Color(AMETHYST),
    place(layout) {
      course.scale.setScalar(layout === "tall" ? 0.74 : 0.85);
      course.rotation.y = layout === "tall" ? 0 : -0.25;
    },
    update({ t, hold, clock, idle }) {
      columns.forEach((column, i) => {
        const enter = easeOut(smooth(-0.7 + i * 0.1, -0.2 + i * 0.1, t));
        column.scale.set(1, Math.max(0.001, enter), 1);
      });
      const s = 0.04 + hold * 0.92;
      path.getPoint(s, bird.position);
      if (idle) bird.position.y += Math.sin(clock * 3) * 0.04;
      path.getPoint(Math.min(1, s + 0.02), ahead);
      bird.rotation.z = Math.atan2(ahead.y - bird.position.y, ahead.x - bird.position.x) * 0.8;
      const phase = idle ? clock * 14 : hold * 70;
      for (const { pivot, dir } of wings) pivot.rotation.x = dir * (0.3 + Math.sin(phase) * 0.7);
      trail.forEach((spark, i) => {
        path.getPoint(Math.max(0, s - (i + 1) * 0.012), spark.position);
        spark.scale.setScalar(1 - i / trail.length);
      });
    },
  };
};

/* Snake */

const SNAKE_PATH: [number, number][] = [
  [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [7, 6], [7, 5], [6, 5], [5, 5], [4, 5], [3, 5], [2, 5], [1, 5], [1, 4],
  [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [7, 2], [7, 1], [6, 1], [5, 1], [4, 1], [3, 1],
];
const SNAKE_FRUIT = [10, 18, 25];

export const gameSnake: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const board = new Group();
  group.add(board);
  const size = 3.6;
  const step = size / 9;
  const face = kit.texture(
    paint(576, 576, (ctx) => {
      for (let i = 0; i < 81; i++) {
        ctx.fillStyle = (i + Math.floor(i / 9)) % 2 ? "#12301f" : "#173b27";
        ctx.fillRect((i % 9) * 64, Math.floor(i / 9) * 64, 64, 64);
      }
    }),
  );
  const side = keep(new MeshStandardMaterial({ color: 0x0c1a12, roughness: 0.6, metalness: 0.2 }));
  board.add(new Mesh(keep(slab(size + 0.2, size + 0.2, 0.18, 0.2, 0.03)), [keep(new MeshStandardMaterial({ map: face, roughness: 0.8 })), side]));
  const point = (s: number, target: Vector3) => {
    const i = Math.max(0, Math.min(SNAKE_PATH.length - 2, Math.floor(s)));
    const f = Math.min(1, Math.max(0, s - i));
    const [c0, r0] = SNAKE_PATH[i];
    const [c1, r1] = SNAKE_PATH[i + 1];
    return target.set((lerp(c0, c1, f) - 4) * step, (4 - lerp(r0, r1, f)) * step, 0.26);
  };
  const skin = keep(new MeshStandardMaterial({ color: 0x4dd67a, emissive: 0x0d3b1c, roughness: 0.35, metalness: 0.05 }));
  const segmentGeometry = keep(new SphereGeometry(0.17, 20, 14));
  const segments = Array.from({ length: 12 }, () => {
    const mesh = new Mesh(segmentGeometry, skin);
    board.add(mesh);
    return mesh;
  });
  const head = new Group();
  const headMesh = new Mesh(segmentGeometry, skin);
  headMesh.scale.set(1.3, 1.2, 1.05);
  head.add(headMesh);
  const white = keep(new MeshBasicMaterial({ color: 0xffffff }));
  const black = keep(new MeshBasicMaterial({ color: 0x0a0a0a }));
  const eyeGeometry = keep(new SphereGeometry(0.06, 10, 8));
  const pupilGeometry = keep(new SphereGeometry(0.032, 8, 6));
  for (const side of [1, -1]) {
    const eye = new Mesh(eyeGeometry, white);
    eye.position.set(0.1, side * 0.1, 0.14);
    const pupil = new Mesh(pupilGeometry, black);
    pupil.position.set(0.14, side * 0.1, 0.17);
    head.add(eye, pupil);
  }
  board.add(head);
  const fruitMaterial = keep(new MeshStandardMaterial({ color: 0xff3d5a, emissive: 0x4a0010, roughness: 0.3 }));
  const leafMaterial = keep(new MeshBasicMaterial({ color: 0x6fe08a }));
  const fruitGeometry = keep(new SphereGeometry(0.15, 18, 12));
  const leafGeometry = keep(new ConeGeometry(0.05, 0.14, 6));
  const fruits = SNAKE_FRUIT.map((index) => {
    const fruit = new Group();
    const leaf = new Mesh(leafGeometry, leafMaterial);
    leaf.position.set(0.04, 0.16, 0);
    leaf.rotation.z = -0.6;
    fruit.add(new Mesh(fruitGeometry, fruitMaterial), leaf);
    point(index, fruit.position);
    board.add(fruit);
    return { fruit, index };
  });
  const ahead = new Vector3();

  return {
    group,
    key: new Color(0xe9fff0),
    rim: new Color(0x4dd67a),
    place(layout) {
      board.rotation.set(-0.85, layout === "tall" ? 0 : -0.22, layout === "tall" ? 0 : -0.1);
      board.scale.setScalar(layout === "tall" ? 0.95 : 1);
    },
    update({ t, hold, clock, idle }) {
      const s = 3 + hold * (SNAKE_PATH.length - 4.2) + smooth(-0.6, 0, t) * 0.8 - 0.8;
      const eaten = fruits.filter(({ index }) => s >= index).length;
      const length = 4 + eaten * 2;
      segments.forEach((mesh, k) => {
        mesh.visible = k < length;
        if (mesh.visible) {
          point(s - (k + 1) * 0.55, mesh.position);
          mesh.scale.setScalar(1 - (k / length) * 0.35);
        }
      });
      point(s, head.position);
      point(s + 0.1, ahead);
      head.rotation.z = Math.atan2(ahead.y - head.position.y, ahead.x - head.position.x);
      for (const { fruit, index } of fruits) {
        fruit.scale.setScalar(Math.max(0.001, 1 - smooth(index - 0.5, index, s)));
        fruit.rotation.z = idle ? Math.sin(clock * 2 + index) * 0.2 : 0;
      }
    },
  };
};

/* Sudoku */

const SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const GIVEN = "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";

export const gameSudoku: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const board = new Group();
  group.add(board);
  const size = 3.6;
  const step = size / 9;
  const face = kit.texture(
    paint(900, 900, (ctx) => {
      ctx.fillStyle = "#161226";
      ctx.fillRect(0, 0, 900, 900);
      for (let i = 0; i <= 9; i++) {
        ctx.strokeStyle = i % 3 ? "rgba(203,184,255,0.25)" : "#a57cff";
        ctx.lineWidth = i % 3 ? 2 : 6;
        ctx.beginPath();
        ctx.moveTo(i * 100, 0);
        ctx.lineTo(i * 100, 900);
        ctx.moveTo(0, i * 100);
        ctx.lineTo(900, i * 100);
        ctx.stroke();
      }
      ctx.fillStyle = "#f3eeff";
      ctx.font = "600 60px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < 81; i++) if (GIVEN[i] !== ".") ctx.fillText(GIVEN[i], (i % 9) * 100 + 50, Math.floor(i / 9) * 100 + 54);
    }),
  );
  const side = keep(new MeshStandardMaterial({ color: 0x0f0b1a, roughness: 0.5, metalness: 0.3 }));
  board.add(new Mesh(keep(slab(size, size, 0.12, 0.1, 0.02)), [keep(new MeshStandardMaterial({ map: face, emissiveMap: face, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.7 })), side]));
  const digits = Array.from({ length: 9 }, (_, d) =>
    keep(
      new MeshBasicMaterial({
        transparent: true,
        map: kit.texture(
          paint(128, 128, (ctx) => {
            ctx.fillStyle = "#c9a8ff";
            ctx.font = "700 84px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(d + 1), 64, 70);
          }),
        ),
      }),
    ),
  );
  const cellGeometry = keep(new PlaneGeometry(step * 0.95, step * 0.95));
  const rand = random(81);
  const fills: { mesh: Mesh; at: number; box: number; r: number }[] = [];
  for (let i = 0; i < 81; i++) {
    if (GIVEN[i] !== ".") continue;
    const mesh = new Mesh(cellGeometry, digits[Number(SOLUTION[i]) - 1]);
    mesh.position.set(((i % 9) - 4) * step, (4 - Math.floor(i / 9)) * step, 0.075);
    board.add(mesh);
    fills.push({ mesh, at: 0, box: Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3), r: rand() });
  }
  // Fill box by box, in a shuffled order within each box.
  fills.sort((a, b) => a.box - b.box || a.r - b.r).forEach((fill, order) => (fill.at = 0.06 + (order / fills.length) * 0.82));
  const cursor = new Mesh(cellGeometry, keep(new MeshBasicMaterial({ color: AMETHYST, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false })));
  board.add(cursor);
  const glow = glowSprite(kit, "rgba(165,124,255,0.4)", 6);
  glow.position.z = -0.5;
  board.add(glow);

  return {
    group,
    key: new Color(0xf3eeff),
    rim: new Color(AMETHYST),
    place(layout) {
      board.rotation.set(-0.22, layout === "tall" ? 0 : -0.32, 0);
      board.scale.setScalar(layout === "tall" ? 0.95 : 0.75);
    },
    update({ hold, clock, idle }) {
      let latest: Mesh | null = null;
      for (const { mesh, at } of fills) {
        const k = smooth(at, at + 0.04, hold);
        mesh.visible = k > 0.001;
        mesh.scale.setScalar(Math.max(0.001, easeBack(k)));
        if (k > 0) latest = mesh;
      }
      cursor.visible = latest !== null && hold < 0.95;
      if (latest) cursor.position.set(latest.position.x, latest.position.y, 0.07);
      glow.material.opacity = 0.6 + smooth(0.85, 0.95, hold) * 0.4 + (idle ? Math.sin(clock) * 0.1 : 0);
    },
  };
};

/* Fruit Slice */

const FRUITS = [
  { skin: 0xff9a3c, flesh: 0xffc56b, r: 0.34 },
  { skin: 0x2f9e4f, flesh: 0xff4d6a, r: 0.46 },
  { skin: 0xd8283c, flesh: 0xfff1d6, r: 0.32 },
  { skin: 0x8a6a3a, flesh: 0x7fd65a, r: 0.27 },
  { skin: 0xffe14d, flesh: 0xfff6b0, r: 0.3 },
];

export const gameFruitSlice: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const field = new Group();
  group.add(field);
  // The swipe runs along y = 0.75 - 0.32x; fruit sits on it, the bomb below it.
  const line = (x: number) => 0.75 - 0.32 * x;
  const angle = Math.atan(-0.32);
  const xs = [-1.9, -0.95, 0.05, 1.0, 1.95];
  const hemisphere = new Map<number, SphereGeometry>();
  const disc = new Map<number, CircleGeometry>();
  const fruits = FRUITS.map(({ skin, flesh, r }, i) => {
    if (!hemisphere.has(r)) {
      hemisphere.set(r, keep(new SphereGeometry(r, 28, 14, 0, TAU, 0, Math.PI / 2)));
      disc.set(r, keep(new CircleGeometry(r * 0.96, 28)));
    }
    const skinMaterial = keep(new MeshStandardMaterial({ color: skin, roughness: 0.35, emissive: new Color(skin).multiplyScalar(0.15) }));
    const fleshMaterial = keep(new MeshBasicMaterial({ color: flesh, side: DoubleSide }));
    const holder = new Group();
    // Spins about the cut's normal so the cut stays on the swipe.
    const spinner = new Group();
    holder.add(spinner);
    const halves = [1, -1].map((dir) => {
      const half = new Group();
      half.add(new Mesh(hemisphere.get(r), skinMaterial));
      const cut = new Mesh(disc.get(r), fleshMaterial);
      cut.rotation.x = Math.PI / 2;
      half.add(cut);
      if (dir < 0) half.rotation.x = Math.PI;
      const pivot = new Group();
      pivot.add(half);
      spinner.add(pivot);
      return { pivot, dir };
    });
    holder.rotation.z = angle;
    const juice = glowSprite(kit, `rgba(${(flesh >> 16) & 255},${(flesh >> 8) & 255},${flesh & 255},0.9)`, 1.6);
    field.add(holder, juice);
    const x = xs[i];
    const home = new Vector3(x, line(x) + (i % 2 ? 0.08 : -0.08), (i % 3) * 0.25 - 0.2);
    juice.position.copy(home);
    return { holder, spinner, halves, juice, home, x, spin: random(i + 3)() * TAU };
  });
  const bomb = new Group();
  bomb.add(new Mesh(keep(new SphereGeometry(0.32, 24, 16)), keep(new MeshStandardMaterial({ color: 0x1a1420, roughness: 0.25, metalness: 0.6 }))));
  const fuse = new Mesh(keep(new CylinderGeometry(0.03, 0.03, 0.2, 6)), keep(new MeshBasicMaterial({ color: 0x8a7a6a })));
  fuse.position.y = 0.38;
  const spark = glowSprite(kit, "rgba(255,120,60,1)", 0.55);
  spark.position.y = 0.5;
  bomb.add(fuse, spark);
  bomb.position.set(-0.55, -0.85, 0.2);
  field.add(bomb);
  const bladeMaterial = keep(
    new MeshBasicMaterial({
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      map: kit.texture(
        paint(512, 32, (ctx) => {
          const fade = ctx.createLinearGradient(0, 0, 512, 0);
          fade.addColorStop(0, "rgba(255,255,255,0)");
          fade.addColorStop(0.85, "rgba(240,230,255,0.9)");
          fade.addColorStop(1, "rgba(255,255,255,1)");
          ctx.fillStyle = fade;
          ctx.beginPath();
          ctx.moveTo(0, 16);
          ctx.lineTo(512, 4);
          ctx.lineTo(512, 28);
          ctx.fill();
        }),
      ),
    }),
  );
  const blade = new Mesh(keep(new PlaneGeometry(1, 0.14)), bladeMaterial);
  blade.geometry.translate(-0.5, 0, 0);
  blade.rotation.z = angle;
  field.add(blade);
  const start = -2.9;

  return {
    group,
    key: new Color(0xfff1d6),
    rim: new Color(ROSE),
    place(layout) {
      field.scale.setScalar(layout === "tall" ? 0.78 : 1);
      field.rotation.y = layout === "tall" ? 0 : -0.2;
    },
    update({ t, hold, clock, idle }) {
      const enter = easeOut(smooth(-0.7, -0.1, t));
      const head = lerp(start, 3, easeInOut(smooth(0.12, 0.7, hold)));
      const tail = lerp(start, 3, easeInOut(smooth(0.2, 0.9, hold)));
      const length = Math.max(0.001, head - tail);
      blade.position.set(head, line(head), 0.4);
      blade.scale.x = length / Math.cos(angle);
      blade.visible = head > start + 0.01 && length > 0.02;
      fruits.forEach(({ holder, spinner, halves, juice, home, x, spin }, i) => {
        const cut = smooth(x - 0.05, x + 0.9, head);
        holder.position.copy(home);
        holder.position.y += -(1 - enter) * (3 + i * 0.4) - cut * cut * 0.9;
        spinner.rotation.y = spin + (idle ? clock * 0.6 : hold * 2);
        for (const { pivot, dir } of halves) {
          pivot.position.y = dir * easeOut(cut) * 0.32;
          pivot.rotation.x = dir * cut * 0.8;
        }
        juice.material.opacity = Math.sin(clamp01(cut * 1.6) * Math.PI) * 0.9;
        juice.scale.setScalar(0.6 + cut * 1.8);
      });
      bomb.position.y = -0.85 - (1 - enter) * 3 + (idle ? Math.sin(clock * 1.7) * 0.06 : 0);
      bomb.rotation.z = idle ? Math.sin(clock) * 0.2 : 0;
      spark.material.opacity = idle ? 0.7 + Math.sin(clock * 23) * 0.3 : 1;
    },
  };
};

/* Tower Stacker */

export const gameStacker: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const tower = new Group();
  group.add(tower);
  const height = 0.3;
  const box = keep(new BoxGeometry(1, 1, 1));
  const from = new Color(0x5a3d8c);
  const mid = new Color(AMETHYST);
  const to = new Color(GOLD);
  const offsets = [0, 0.12, -0.1, 0.16, 0.06, -0.14, 0.1, -0.08, 0.12, -0.06];
  let width = 1.3;
  let depth = 1.3;
  let cx = 0;
  let cz = 0;
  const levels = offsets.map((offset, k) => {
    const alongX = k % 2 === 0;
    const color = k < 5 ? from.clone().lerp(mid, k / 5) : mid.clone().lerp(to, (k - 5) / 4);
    const material = keep(new MeshStandardMaterial({ color, emissive: color.clone().multiplyScalar(0.25), roughness: 0.35, metalness: 0.15 }));
    const prev = { width, depth, cx, cz };
    if (alongX) {
      width -= Math.abs(offset);
      cx += offset / 2;
    } else {
      depth -= Math.abs(offset);
      cz += offset / 2;
    }
    const mesh = new Mesh(box, material);
    mesh.scale.set(width, height, depth);
    tower.add(mesh);
    // The trimmed overhang that falls away.
    const cutSize = Math.abs(offset);
    const sign = Math.sign(offset) || 1;
    const chip = new Mesh(box, material);
    chip.scale.set(alongX ? cutSize : width, height, alongX ? depth : cutSize);
    const chipAt = alongX
      ? new Vector3(prev.cx + (sign * prev.width) / 2 + offset / 2, k * height, cz)
      : new Vector3(cx, k * height, prev.cz + (sign * prev.depth) / 2 + offset / 2);
    tower.add(chip);
    return { mesh, chip, chipAt, at: new Vector3(cx, k * height, cz), alongX, cut: cutSize > 0.001 };
  });
  const base = new Mesh(keep(slab(2.6, 2.6, 0.2, 0.3, 0.03)), keep(new MeshStandardMaterial({ color: 0x140d24, roughness: 0.4, metalness: 0.4 })));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -height / 2 - 0.1;
  tower.add(base);
  const first = 4;
  const glow = glowSprite(kit, "rgba(255,195,90,0.5)", 3);
  tower.add(glow);

  return {
    group,
    key: new Color(0xfff1dc),
    rim: new Color(AMETHYST),
    place(layout) {
      group.scale.setScalar(layout === "tall" ? 0.85 : 1);
    },
    update({ t, hold, clock, idle }) {
      const added = (levels.length - first) * hold;
      levels.forEach(({ mesh, chip, chipAt, at, alongX, cut }, k) => {
        if (k < first) {
          const enter = easeOut(smooth(-0.75 + k * 0.08, -0.3 + k * 0.08, t));
          mesh.position.copy(at);
          mesh.position.y += (1 - enter) * 3;
          mesh.visible = enter > 0.001;
          chip.visible = false;
          return;
        }
        const local = added - (k - first);
        mesh.visible = local > 0;
        const slide = easeOut(smooth(0, 0.6, local));
        const drop = smooth(0.6, 0.8, local);
        mesh.position.copy(at);
        const travel = (1 - slide) * 2.6 * (k % 4 < 2 ? 1 : -1);
        if (alongX) mesh.position.x += travel;
        else mesh.position.z += travel;
        mesh.position.y += (1 - drop) * 0.25;
        const fall = clamp01((local - 0.8) / 0.5);
        chip.visible = cut && local > 0.8 && fall < 1;
        chip.position.copy(chipAt);
        chip.position.y -= fall * fall * 3;
        chip.rotation.set(alongX ? 0 : fall * 1.5, 0, alongX ? -fall * 1.5 : 0);
      });
      const top = first - 1 + added;
      tower.position.y = -0.9 - top * height * 0.5;
      tower.rotation.y = 0.65 + (idle ? clock * 0.12 : hold * 0.6);
      glow.position.y = top * height + 0.3;
      glow.material.opacity = smooth(0.85, 1, hold);
    },
  };
};

/* Coin Slots */

const SLOT_SYMBOLS: ((ctx: CanvasRenderingContext2D) => void)[] = [
  (ctx) => {
    ctx.fillStyle = "#a57cff";
    ctx.beginPath();
    ctx.moveTo(-30, -26);
    ctx.lineTo(30, -26);
    ctx.lineTo(48, -6);
    ctx.lineTo(0, 46);
    ctx.lineTo(-48, -6);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.moveTo(-30, -26);
    ctx.lineTo(0, -6);
    ctx.lineTo(-48, -6);
    ctx.fill();
  },
  (ctx) => {
    ctx.fillStyle = "#ffc35a";
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "#b07a10";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.stroke();
  },
  (ctx) => {
    ctx.fillStyle = "#ffe14d";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 20 : 46;
      const a = (i / 10) * TAU - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.fill();
  },
  (ctx) => {
    ctx.strokeStyle = "#4dd67a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-18, 14);
    ctx.quadraticCurveTo(-8, -30, 14, -40);
    ctx.moveTo(20, 14);
    ctx.quadraticCurveTo(14, -24, 14, -40);
    ctx.stroke();
    ctx.fillStyle = "#ff3d5a";
    for (const x of [-20, 20]) {
      ctx.beginPath();
      ctx.arc(x, 24, 20, 0, TAU);
      ctx.fill();
    }
  },
];

export const slots: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const machine = new Group();
  group.add(machine);
  const cabinet = keep(new MeshStandardMaterial({ color: 0x1d1030, roughness: 0.35, metalness: 0.5 }));
  const gold = keep(new MeshStandardMaterial({ color: GOLD, roughness: 0.25, metalness: 1, emissive: 0x3d2600 }));
  machine.add(new Mesh(keep(slab(3.4, 3, 0.7, 0.3, 0.04)), cabinet));
  const trim = new Mesh(keep(slab(3.56, 3.16, 0.1, 0.36)), gold);
  trim.position.z = -0.32;
  machine.add(trim);
  const recess = new Mesh(keep(slab(2.8, 1.35, 0.05, 0.14)), keep(new MeshBasicMaterial({ color: 0x050308 })));
  recess.position.set(0, 0.15, 0.36);
  machine.add(recess);
  const strip = kit.texture(
    paint(1024, 256, (ctx) => {
      ctx.fillStyle = "#f6f0ff";
      ctx.fillRect(0, 0, 1024, 256);
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.translate(i * 128 + 64, 128);
        ctx.rotate(Math.PI / 2);
        SLOT_SYMBOLS[i % 4](ctx);
        ctx.restore();
        ctx.fillStyle = "rgba(60,30,90,0.12)";
        ctx.fillRect(i * 128, 0, 2, 256);
      }
    }),
  );
  const reelGeometry = keep(new CylinderGeometry(0.55, 0.55, 0.78, 48));
  reelGeometry.rotateZ(Math.PI / 2);
  const reelMaterial = keep(new MeshStandardMaterial({ map: strip, emissiveMap: strip, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.4 }));
  const reelMaterials = [reelMaterial, gold, gold];
  const reels = [-0.9, 0, 0.9].map((x, i) => {
    const reel = new Mesh(reelGeometry, reelMaterials);
    reel.position.set(x, 0.15, 0.1);
    machine.add(reel);
    return { reel, i };
  });
  const payline = new Mesh(keep(slab(2.9, 0.035, 0.01, 0.017)), keep(new MeshBasicMaterial({ color: ROSE, transparent: true })));
  payline.position.set(0, 0.15, 0.68);
  machine.add(payline);
  const bulbGeometry = keep(new SphereGeometry(0.06, 12, 8));
  const bulbs = [keep(new MeshBasicMaterial({ color: GOLD })), keep(new MeshBasicMaterial({ color: ROSE }))];
  for (let i = 0; i < 15; i++) {
    const bulb = new Mesh(bulbGeometry, bulbs[i % 2]);
    bulb.position.set(-1.4 + i * 0.2, 1.3, 0.38);
    machine.add(bulb);
  }
  const tray = new Mesh(keep(slab(2, 0.35, 0.5, 0.12)), gold);
  tray.position.set(0, -1.15, 0.45);
  machine.add(tray);
  const lever = new Group();
  const rod = new Mesh(keep(new CylinderGeometry(0.04, 0.04, 1.1, 10)), gold);
  rod.position.y = 0.55;
  const ball = new Mesh(keep(new SphereGeometry(0.15, 20, 14)), keep(new MeshStandardMaterial({ color: 0xff3d5a, roughness: 0.25, emissive: 0x4a0010 })));
  ball.position.y = 1.1;
  lever.add(rod, ball);
  lever.position.set(1.85, 0.1, 0);
  machine.add(lever);
  const coinGeometry = keep(new CylinderGeometry(0.13, 0.13, 0.03, 28));
  const rand = random(17);
  const coins = Array.from({ length: 14 }, () => {
    const coin = new Mesh(coinGeometry, gold);
    machine.add(coin);
    return { coin, vx: (rand() * 2 - 1) * 1.4, vy: 1.6 + rand() * 1.6, vz: 0.6 + rand() * 0.8, spin: rand() * 6 + 2, delay: rand() * 0.04 };
  });
  const target = (0.5 / 8) * TAU;

  return {
    group,
    key: new Color(0xfff1dc),
    rim: new Color(ROSE),
    place(layout) {
      machine.scale.setScalar(layout === "tall" ? 0.8 : 0.95);
      machine.rotation.y = layout === "tall" ? 0 : -0.25;
    },
    update({ hold, clock, idle }) {
      const pull = smooth(0.02, 0.1, hold) * (1 - smooth(0.12, 0.22, hold));
      lever.rotation.x = pull * 1.1;
      for (const { reel, i } of reels) {
        const p = easeOut(smooth(0.08, 0.45 + i * 0.13, hold));
        reel.rotation.x = target + (1 - p) * ((3 + i) * TAU + i * 1.6 + 0.8);
      }
      const win = smooth(0.74, 0.8, hold);
      payline.material.opacity = 0.5 + win * 0.5 * (idle ? 0.75 + Math.sin(clock * 8) * 0.25 : 1);
      const flash = idle ? Math.floor(clock * 4) % 2 : 0;
      bulbs[0].color.setHex(flash ? 0xfff1c2 : GOLD);
      bulbs[1].color.setHex(flash ? ROSE : 0xffd6f0);
      for (const { coin, vx, vy, vz, spin, delay } of coins) {
        const k = clamp01((hold - 0.78 - delay) / 0.2);
        coin.visible = k > 0;
        const tau = k * 1.1;
        coin.position.set(vx * tau, -1.0 + vy * tau - 2.6 * tau * tau, 0.6 + vz * tau);
        coin.rotation.set(spin * tau, 0, spin * tau * 0.6);
      }
    },
  };
};

