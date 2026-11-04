import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Euler,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Shape,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { radialTexture } from "@/components/showcase/three-kit";
import {
  AMETHYST,
  clamp01,
  easeBack,
  easeInOut,
  easeOut,
  GOLD,
  type Kit,
  type Layout,
  paint,
  type PieceBuilder,
  random,
  ROSE,
  slab,
  smooth,
} from "./kit";

/** Original cover art: deep, mid and light tones per palette. */
const COVER_PALETTES: [string, string, string][] = [
  ["#2a0f5c", "#a57cff", "#ffd6f0"],
  ["#3d0a2a", "#f472a8", "#ffe1b8"],
  ["#071a33", "#4fd6ec", "#e6f7ff"],
  ["#1b0b2e", "#ff8a5c", "#ffe8a3"],
  ["#0b1f1a", "#4dd6a0", "#e9fff4"],
  ["#1a1033", "#bd9bff", "#f5f1ff"],
  ["#2b1205", "#ffb547", "#fff1dc"],
];

export function paintCover(seed: number) {
  const W = 320;
  const H = 464;
  return paint(W, H, (ctx) => {
    const rand = random(seed * 977 + 13);
    const [deep, mid, light] = COVER_PALETTES[seed % COVER_PALETTES.length];
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, deep);
    sky.addColorStop(0.62, mid);
    sky.addColorStop(1, deep);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const style = seed % 3;
    if (style === 1) {
      const cx = W * (0.35 + rand() * 0.3);
      const cy = H * (0.35 + rand() * 0.15);
      for (let ring = 7; ring > 0; ring--) {
        ctx.beginPath();
        ctx.arc(cx, cy, ring * W * 0.07, 0, Math.PI * 2);
        ctx.fillStyle = ring % 2 ? `${light}55` : `${deep}88`;
        ctx.fill();
      }
    } else {
      const cx = W * (0.28 + rand() * 0.44);
      const cy = H * (0.2 + rand() * 0.18);
      const r = W * (0.12 + rand() * 0.1);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.8);
      glow.addColorStop(0, `${light}cc`);
      glow.addColorStop(1, `${light}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = light;
      ctx.fill();
    }
    if (style === 2) {
      ctx.save();
      ctx.translate(W / 2, H * 0.62);
      ctx.rotate(-0.5 + rand() * 0.3);
      for (let band = -3; band <= 3; band++) {
        ctx.fillStyle = `rgba(5, 3, 10, ${0.18 + Math.abs(band) * 0.08})`;
        ctx.fillRect(-W, band * 34, W * 2, 18);
      }
      ctx.restore();
    } else {
      for (let layer = 0; layer < 3; layer++) {
        const base = H * (0.56 + layer * 0.12);
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(0, base);
        for (let x = 0; x <= W + 32; x += 32) ctx.lineTo(x, base - rand() * H * 0.11 * (1 - layer * 0.25));
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fillStyle = `rgba(5, 3, 10, ${0.4 + layer * 0.2})`;
        ctx.fill();
      }
    }
    // Placeholder title lines, never real names.
    ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
    ctx.beginPath();
    ctx.roundRect(24, H - 86, W * (0.42 + rand() * 0.2), 14, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.beginPath();
    ctx.roundRect(24, H - 62, W * (0.26 + rand() * 0.14), 10, 5);
    ctx.fill();
  });
}

export const CARD_W = 1;
export const CARD_H = 1.45;

/** A cover card: shared geometry and side material, one textured face per seed. */
export function coverCards(kit: Kit) {
  const geometry = kit.keep(slab(CARD_W, CARD_H, 0.025, 0.06));
  const side = kit.keep(new MeshStandardMaterial({ color: 0x1a1226, roughness: 0.5, metalness: 0.3 }));
  return (seed: number) => {
    const map = kit.texture(paintCover(seed));
    const front = kit.keep(new MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.32, roughness: 0.38, envMapIntensity: 0.55 }));
    return new Mesh(geometry, [front, side]);
  };
}

export function glowSprite(kit: Kit, color: string, size: number) {
  const texture = kit.keep(radialTexture([[0, color], [0.4, color.replace(/[\d.]+\)$/, "0.12)")], [1, "rgba(0,0,0,0)"]]));
  texture.colorSpace = SRGBColorSpace;
  const material = kit.keep(new SpriteMaterial({ map: texture, blending: AdditiveBlending, depthWrite: false, transparent: true }));
  const sprite = new Sprite(material);
  sprite.scale.setScalar(size);
  return sprite;
}

/** The faceted Amethyst gem with its edge lines, glow and two halo rings. */
function makeGem(kit: Kit) {
  const { keep } = kit;
  const gem = new Group();
  const material = keep(
    new MeshPhysicalMaterial({
      color: 0x8a5cff,
      emissive: 0x2b0d66,
      emissiveIntensity: 0.55,
      metalness: 0.15,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 0.7,
      iridescenceIOR: 1.6,
      envMapIntensity: 1.5,
      flatShading: true,
    }),
  );
  const profile = [new Vector2(0.001, -1.3), new Vector2(0.98, 0.1), new Vector2(1, 0.22), new Vector2(0.64, 0.6), new Vector2(0.001, 0.6)];
  const shape = keep(new LatheGeometry(profile, 10));
  gem.add(new Mesh(shape, material));
  gem.add(
    new LineSegments(
      keep(new EdgesGeometry(shape, 1)),
      keep(new LineBasicMaterial({ color: 0xd9c6ff, transparent: true, opacity: 0.32, blending: AdditiveBlending, depthWrite: false })),
    ),
  );
  const glow = glowSprite(kit, "rgba(190,150,255,0.55)", 7);
  glow.position.z = -0.8;
  gem.add(glow);
  const rings = [
    { radius: 1.9, color: AMETHYST, tilt: new Euler(1.2, 0.2, 0) },
    { radius: 2.45, color: ROSE, tilt: new Euler(1.35, -0.25, 0.3) },
  ].map(({ radius, color, tilt }) => {
    const ringMaterial = keep(new MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: AdditiveBlending, depthWrite: false }));
    const ring = new Mesh(keep(new TorusGeometry(radius, 0.006, 6, 160)), ringMaterial);
    ring.rotation.copy(tilt);
    gem.add(ring);
    return { ring, material: ringMaterial };
  });
  return { gem, material, glow, rings };
}

export const opening: PieceBuilder = (kit) => {
  const group = new Group();
  const { gem, material, glow, rings } = makeGem(kit);
  group.add(gem);

  const shardCount = kit.layout === "tall" ? 36 : 56;
  const shardMaterial = kit.keep(material.clone());
  shardMaterial.iridescence = 0.4;
  const shards = kit.keep(new InstancedMesh(kit.keep(new OctahedronGeometry(1, 0)), shardMaterial, shardCount));
  group.add(shards);
  const rand = random(7);
  const shardData = Array.from({ length: shardCount }, () => ({
    angle: rand() * Math.PI * 2,
    radius: 2.4 + rand() * 2.2,
    y: (rand() * 2 - 1) * 1.3,
    size: 0.04 + rand() ** 2 * 0.14,
    speed: 0.05 + rand() * 0.1,
    spin: new Vector3(rand(), rand(), rand()).normalize(),
    flight: 2 + rand() * 14,
  }));
  const dummy = new Object3D();
  let scale = 1;

  return {
    group,
    key: new Color(AMETHYST),
    rim: new Color(ROSE),
    ownEntrance: true,
    ownExit: true,
    frame: {
      wide: { camera: [-2.3, 0.2, 8.5], look: [-1.2, -0.05, 0], drift: [0.3, -0.1, -1.4] },
      tall: { camera: [0, -0.95, 9.6], look: [0, -1.7, 0], drift: [0, 0.1, -1.3] },
    },
    place(layout) {
      scale = layout === "tall" ? 0.82 : 1;
      gem.scale.setScalar(scale);
    },
    update({ t, clock, idle, layout }) {
      const x = Math.max(0, t);
      gem.rotation.y = x * 2.2 + (idle ? clock * 0.22 : 0);
      gem.rotation.x = idle ? Math.sin(clock * 0.4) * 0.06 : 0;
      for (const [i, { ring, material: ringMaterial }] of rings.entries()) {
        ring.rotation.z = (idle ? clock * (i ? -0.08 : 0.12) : 0) + x * (i ? -1 : 1.4);
        ring.scale.setScalar(1 + clamp01(x) * 0.8);
        ringMaterial.opacity = 0.4 * (1 - smooth(0.15, 0.75, x));
      }
      glow.material.opacity = 1 - smooth(0.3, 1, x) * 0.7;
      const scatter = smooth(0, 1, x);
      shardData.forEach((shard, i) => {
        const angle = shard.angle + (idle ? clock * shard.speed : 0) + x * 0.6;
        const radius = shard.radius * (1 + scatter * 1.8);
        dummy.position.set(
          Math.cos(angle) * radius * (layout === "wide" ? 0.85 : 1),
          shard.y * (1 + scatter),
          Math.sin(angle) * radius * 0.45 - scatter * shard.flight,
        );
        dummy.quaternion.setFromAxisAngle(shard.spin, (idle ? clock * 0.5 : 0) + x * 3 + i);
        dummy.scale.setScalar(shard.size * scale);
        dummy.updateMatrix();
        shards.setMatrixAt(i, dummy.matrix);
      });
      shards.instanceMatrix.needsUpdate = true;
    },
  };
};

type Fan = { at: [number, number, number]; turn: number; count: number };
const FANS: Record<Layout, { shift: number; fans: Fan[] }> = {
  wide: {
    shift: 3.4,
    fans: [
      { at: [-0.75, 0.9, -2.8], turn: 0.22, count: 4 },
      { at: [0.1, -0.35, 0.6], turn: 0.02, count: 5 },
      { at: [1.9, 1, -4.4], turn: -0.25, count: 5 },
    ],
  },
  tall: {
    shift: 0,
    fans: [
      { at: [-0.9, 1.55, -2.6], turn: 0.3, count: 4 },
      { at: [0, -0.15, 0], turn: 0, count: 5 },
      { at: [1, 1.9, -4.2], turn: -0.3, count: 5 },
    ],
  },
};

export const archive: PieceBuilder = (kit) => {
  const group = new Group();
  const card = coverCards(kit);
  const cards = Array.from({ length: 14 }, (_, index) => {
    const mesh = card(index);
    group.add(mesh);
    return { mesh, start: new Vector3(), startTurn: new Quaternion(), end: new Vector3(), endTurn: new Quaternion() };
  });
  const shelfTexture = kit.keep(radialTexture([[0, "rgba(200,160,255,0.5)"], [0.5, "rgba(244,114,168,0.12)"], [1, "rgba(0,0,0,0)"]]));
  shelfTexture.colorSpace = SRGBColorSpace;
  const shelfMaterial = kit.keep(new MeshBasicMaterial({ map: shelfTexture, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }));
  const shelfGeometry = kit.keep(new PlaneGeometry(3.6, 1.6));
  const shelves = FANS.wide.fans.map(() => {
    const shelf = new Mesh(shelfGeometry, shelfMaterial);
    shelf.rotation.x = -Math.PI / 2;
    group.add(shelf);
    return shelf;
  });
  const up = new Vector3(0, 1, 0);
  const euler = new Euler();
  const turn = new Quaternion();
  const local = new Vector3();

  return {
    group,
    key: new Color(0xffe2f0),
    rim: new Color(AMETHYST),
    ownEntrance: true,
    frame: {
      wide: { camera: [-2.8, 0.6, 9], look: [-1.3, 0.15, 0], drift: [0.4, -0.15, -1.1] },
      tall: { camera: [0, -0.2, 10.5], look: [0, -2, 0], drift: [0, 0.05, -0.6] },
    },
    place(layout) {
      const { shift, fans } = FANS[layout];
      const scatter = random(99);
      let index = 0;
      fans.forEach((fan, f) => {
        shelves[f].position.set(fan.at[0], fan.at[1] - 1.05, fan.at[2]);
        for (let j = 0; j < fan.count; j++, index++) {
          const item = cards[index];
          const o = j - (fan.count - 1) / 2;
          // Centre card in front, the rest fanned out behind it.
          local.set(o * 0.44, -Math.abs(o) * 0.06, -Math.abs(o) * 0.1).applyAxisAngle(up, fan.turn);
          item.end.set(...fan.at).add(local);
          turn.setFromAxisAngle(up, fan.turn);
          item.endTurn.setFromEuler(euler.set(0, -o * 0.12, -o * 0.1)).premultiply(turn);
          const side = index % 2 ? 1 : -1;
          const spread = layout === "tall" ? 1.4 + scatter() * 2.2 : 2.6 + scatter() * 4.5;
          item.start.set(side * spread - shift, (scatter() * 2 - 1) * (layout === "tall" ? 3 : 2.6), 23 - scatter() * 15);
          item.startTurn.setFromEuler(euler.set((scatter() * 2 - 1) * 0.9, (scatter() * 2 - 1) * 1.4, (scatter() * 2 - 1) * 0.6));
        }
      });
    },
    update({ t, clock, idle }) {
      // Covers surface once the camera sets off, keeping the opening clear.
      const appear = smooth(-0.98, -0.7, t);
      const reveal = clamp01((t + 0.6) / 0.6);
      cards.forEach((item, i) => {
        const delay = (i / (cards.length - 1)) * 0.4;
        const k = easeOut(smooth(delay, delay + 0.6, reveal));
        item.mesh.visible = appear > 0.001;
        item.mesh.scale.setScalar(Math.max(appear, 0.001));
        item.mesh.position.lerpVectors(item.start, item.end, k);
        if (idle) item.mesh.position.y += Math.sin(clock * 0.6 + i) * 0.03 * k;
        item.mesh.quaternion.slerpQuaternions(item.startTurn, item.endTurn, k);
      });
      shelfMaterial.opacity = smooth(0.5, 1, reveal);
    },
  };
};

function checkShape() {
  const shape = new Shape();
  shape.moveTo(-0.07, 0.0);
  shape.lineTo(-0.02, -0.05);
  shape.lineTo(0.075, 0.05);
  shape.lineTo(0.055, 0.07);
  shape.lineTo(-0.02, -0.01);
  shape.lineTo(-0.05, 0.02);
  return shape;
}

export const todo: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const board = new Group();
  group.add(board);
  const glass = keep(new MeshPhysicalMaterial({ color: 0x150d24, roughness: 0.3, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 0.9 }));
  const edge = keep(new MeshBasicMaterial({ color: AMETHYST, transparent: true, opacity: 0.4 }));
  board.add(new Mesh(keep(slab(3.3, 4.1, 0.08, 0.24, 0.02)), glass));
  const rim = new Mesh(keep(slab(3.42, 4.22, 0.03, 0.28)), edge);
  rim.position.z = -0.07;
  board.add(rim);

  const white = keep(new MeshBasicMaterial({ color: 0xf3eeff }));
  const dim = keep(new MeshBasicMaterial({ color: 0x9d90b8 }));
  const sun = new Mesh(keep(new CircleGeometry(0.2, 32)), keep(new MeshBasicMaterial({ color: GOLD })));
  sun.position.set(-1.25, 1.62, 0.07);
  const sunGlow = glowSprite(kit, "rgba(255,195,90,0.7)", 1.4);
  sunGlow.position.copy(sun.position);
  board.add(sun, sunGlow);
  const titleBar = new Mesh(keep(slab(1.35, 0.17, 0.02, 0.085)), white);
  titleBar.position.set(-0.22, 1.66, 0.07);
  const dateBar = new Mesh(keep(slab(0.8, 0.08, 0.02, 0.04)), dim);
  dateBar.position.set(-0.49, 1.42, 0.07);
  board.add(titleBar, dateBar);

  const rowGeometry = keep(slab(2.9, 0.5, 0.06, 0.13, 0.01));
  const rowMaterial = keep(new MeshStandardMaterial({ color: 0x241838, roughness: 0.55, metalness: 0.1 }));
  const ringGeometry = keep(new TorusGeometry(0.13, 0.022, 8, 40));
  const ringMaterial = keep(new MeshBasicMaterial({ color: 0xcbb8ff }));
  const fillGeometry = keep(new CircleGeometry(0.14, 32));
  const fillMaterial = keep(new MeshBasicMaterial({ color: AMETHYST }));
  const tickGeometry = keep(new ExtrudeGeometry(checkShape(), { depth: 0.01, bevelEnabled: false }));
  const strikeMaterial = keep(new MeshBasicMaterial({ color: 0xcbb8ff }));
  const widths = [1.5, 1.15, 1.7, 0.95, 1.35];
  const rows = widths.map((width, k) => {
    const row = new Group();
    row.position.set(0, 0.8 - k * 0.62, 0.12);
    row.add(new Mesh(rowGeometry, rowMaterial));
    const ring = new Mesh(ringGeometry, ringMaterial);
    ring.position.set(-1.15, 0, 0.05);
    const fill = new Mesh(fillGeometry, fillMaterial);
    fill.position.set(-1.15, 0, 0.055);
    const tick = new Mesh(tickGeometry, white);
    tick.position.set(-1.15, 0, 0.06);
    tick.scale.setScalar(1.3);
    const bar = new Mesh(keep(slab(width, 0.1, 0.02, 0.05)), keep(white.clone()));
    bar.position.set(-0.82 + width / 2, 0, 0.05);
    bar.material.transparent = true;
    const strike = new Mesh(keep(slab(width + 0.1, 0.025, 0.02, 0.012)), strikeMaterial);
    strike.position.set(-0.87, 0, 0.065);
    strike.geometry.translate((width + 0.1) / 2, 0, 0);
    row.add(ring, fill, tick, bar, strike);
    board.add(row);
    const sparkle = glowSprite(kit, "rgba(255,226,160,0.95)", 0.9);
    sparkle.position.set(-1.15, 0, 0.12);
    row.add(sparkle);
    return { row, fill, tick, bar, strike, sparkle };
  });
  // Important star, due-date chip and step dots on a few rows.
  const star = new Mesh(keep(new OctahedronGeometry(0.11, 0)), keep(new MeshBasicMaterial({ color: GOLD })));
  star.position.set(1.15, 0, 0.08);
  rows[1].row.add(star);
  const chip = new Mesh(keep(slab(0.48, 0.15, 0.02, 0.075)), keep(new MeshBasicMaterial({ color: ROSE })));
  chip.position.set(1.02, 0, 0.05);
  rows[2].row.add(chip);
  const dotGeometry = keep(new CircleGeometry(0.035, 16));
  for (let d = 0; d < 3; d++) {
    const dot = new Mesh(dotGeometry, d ? dim : fillMaterial);
    dot.position.set(0.95 + d * 0.11, 0, 0.05);
    rows[4].row.add(dot);
  }

  // Lists and groups, a smaller panel behind.
  const lists = new Group();
  lists.add(new Mesh(keep(slab(1.5, 2.5, 0.06, 0.18, 0.01)), glass));
  const listColors = [AMETHYST, ROSE, 0x4fd6ec, GOLD, 0x4dd6a0];
  const listDot = keep(new CircleGeometry(0.07, 20));
  listColors.forEach((color, k) => {
    const dot = new Mesh(listDot, keep(new MeshBasicMaterial({ color })));
    dot.position.set(-0.48, 0.85 - k * 0.42, 0.05);
    const bar = new Mesh(keep(slab(0.55 + (k % 3) * 0.15, 0.08, 0.02, 0.04)), dim);
    bar.position.set(-0.3 + (0.55 + (k % 3) * 0.15) / 2, 0.85 - k * 0.42, 0.05);
    lists.add(dot, bar);
  });
  group.add(lists);

  const thresholds = [0.1, 0.27, 0.44, 0.61, 0.78];
  return {
    group,
    key: new Color(0xfff0d8),
    rim: new Color(AMETHYST),
    place(layout) {
      if (layout === "tall") {
        board.position.set(0.25, 0, 0);
        board.rotation.set(0, -0.08, 0);
        lists.position.set(-1.25, 1.2, -1.6);
        lists.rotation.set(0, 0.3, 0);
        group.scale.setScalar(0.92);
      } else {
        board.position.set(0.4, 0, 0);
        board.rotation.set(0, -0.22, 0);
        lists.position.set(-1.9, 0.5, -1.3);
        lists.rotation.set(0, 0.35, 0);
        group.scale.setScalar(1);
      }
    },
    update({ t, hold, clock, energy, layout }) {
      const leave = Math.max(0, t);
      rows.forEach((item, k) => {
        const enter = easeOut(smooth(-0.7 + k * 0.08, -0.15 + k * 0.08, t));
        item.row.scale.setScalar(Math.max(0.001, enter));
        const done = smooth(thresholds[k], thresholds[k] + 0.1, hold);
        const pop = easeBack(done);
        item.fill.scale.setScalar(Math.max(0.001, pop));
        item.tick.visible = done > 0.4;
        item.bar.material.opacity = 1 - done * 0.6;
        item.strike.scale.x = Math.max(0.001, done);
        const burst = smooth(thresholds[k] + 0.03, thresholds[k] + 0.2, hold);
        item.sparkle.material.opacity = Math.sin(burst * Math.PI) * 0.9;
        item.sparkle.scale.setScalar(0.4 + burst * 1.4);
        item.row.position.z = 0.12 + done * 0.06 + Math.sin(clock * 0.9 + k) * 0.02 * energy;
      });
      const finale = smooth(0.86, 1, hold);
      board.rotation.x = -easeInOut(smooth(0.1, 0.9, leave)) * 0.4;
      star.rotation.y = clock * 1.2 + hold * 6;
      sunGlow.material.opacity = 0.7 + Math.sin(clock * 1.4) * 0.15 * energy + Math.sin(finale * Math.PI) * 0.3;
      sunGlow.scale.setScalar(1.4 * (1 + Math.sin(finale * Math.PI) * 0.9 + finale * 0.15));
      lists.position.y = (layout === "tall" ? 1.2 : 0.5) + Math.sin(clock * 0.5) * 0.06 * energy;
    },
  };
};

export const closing: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const { gem, rings } = makeGem(kit);
  group.add(gem);
  // Tokens from every chapter orbiting home.
  const card = coverCards(kit);
  const coin = new Mesh(keep(new CylinderGeometry(0.28, 0.28, 0.06, 40)), keep(new MeshStandardMaterial({ color: GOLD, metalness: 0.9, roughness: 0.25 })));
  coin.rotation.x = Math.PI / 2;
  const check = new Mesh(keep(new CircleGeometry(0.24, 32)), keep(new MeshBasicMaterial({ color: AMETHYST })));
  const tile = new Mesh(keep(slab(0.5, 0.5, 0.12, 0.08, 0.02)), keep(new MeshStandardMaterial({ color: 0xffc35a, emissive: 0x6b3a00, roughness: 0.3, metalness: 0.2 })));
  const cover = card(3);
  cover.scale.setScalar(0.5);
  const shard = new Mesh(keep(new OctahedronGeometry(0.22, 0)), keep(new MeshStandardMaterial({ color: ROSE, emissive: 0x5a0d2c, roughness: 0.2, metalness: 0.3, flatShading: true })));
  const tokens = [cover, coin, check, tile, shard].map((mesh, i) => {
    const holder = new Group();
    holder.add(mesh);
    group.add(holder);
    return { holder, angle: (i / 5) * Math.PI * 2 };
  });
  return {
    group,
    key: new Color(AMETHYST),
    rim: new Color(ROSE),
    frame: {
      wide: { camera: [-2.2, 0.4, 9.5], look: [-1.3, 0, 0] },
      tall: { camera: [0, -0.6, 11], look: [0, -2, 0] },
    },
    place(layout) {
      gem.scale.setScalar(layout === "tall" ? 0.8 : 0.95);
    },
    update({ t, hold, clock, idle }) {
      gem.rotation.y = t * 2 + hold * 1.5 + (idle ? clock * 0.22 : 0);
      for (const [i, { ring }] of rings.entries()) ring.rotation.z = (idle ? clock * (i ? -0.08 : 0.12) : 0) + hold * (i ? -1 : 1.4);
      const gather = easeOut(smooth(-0.6, 0, t));
      tokens.forEach(({ holder, angle }, i) => {
        const a = angle + (idle ? clock * 0.25 : 0) + hold * 1.2;
        const radius = 2.7 + (1 - gather) * 4;
        holder.position.set(Math.cos(a) * radius, Math.sin(a * 2 + i) * 0.35, Math.sin(a) * radius * 0.5);
        holder.rotation.y = a * 0.5;
        holder.scale.setScalar(Math.max(0.001, gather));
      });
    },
  };
};
