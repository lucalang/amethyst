import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Points,
  PointsMaterial,
  RingGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from "three";
import { radialTexture } from "@/components/showcase/three-kit";
import { coverCards, glowSprite } from "./core";
import { AMETHYST, clamp01, easeInOut, easeOut, GOLD, lerp, paint, type PieceBuilder, random, ROSE, slab, smooth } from "./kit";

const TAU = Math.PI * 2;
const RED = 0xff1f3d;

export const vault: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const door = new Group();
  group.add(door);
  const iron = keep(new MeshStandardMaterial({ color: 0x2a1c1f, metalness: 0.9, roughness: 0.5, envMapIntensity: 0.9 }));
  const steel = keep(new MeshStandardMaterial({ color: 0x5a4146, metalness: 1, roughness: 0.28, envMapIntensity: 1.2 }));
  const glowRed = keep(new MeshBasicMaterial({ color: RED }));
  const back = new Mesh(keep(new CircleGeometry(1.95, 64)), keep(new MeshStandardMaterial({ color: 0x120a0c, metalness: 0.6, roughness: 0.6 })));
  back.position.z = -0.35;
  door.add(back);
  door.add(new Mesh(keep(new TorusGeometry(1.95, 0.22, 18, 96)), iron));
  const bezel = new Mesh(keep(new TorusGeometry(1.68, 0.05, 10, 96)), steel);
  door.add(bezel);
  const notch = keep(new BoxGeometry(0.08, 0.16, 0.06));
  const rings = [1.42, 1.14, 0.88].map((radius, i) => {
    const ring = new Group();
    ring.add(new Mesh(keep(new TorusGeometry(radius, 0.065, 10, 96)), steel));
    for (let n = 0; n < 6; n++) {
      const mark = new Mesh(notch, glowRed);
      const a = (n / 6) * TAU;
      mark.position.set(Math.sin(a) * radius, Math.cos(a) * radius, 0.07);
      mark.rotation.z = -a;
      ring.add(mark);
    }
    ring.position.z = 0.04 + i * 0.03;
    door.add(ring);
    return { ring, offset: (i % 2 ? -1 : 1) * (1.4 + i * 0.9) };
  });
  const boltGeometry = keep(new BoxGeometry(0.42, 0.14, 0.14));
  const bolts = Array.from({ length: 8 }, (_, n) => {
    const a = (n / 8) * TAU + TAU / 16;
    const bolt = new Mesh(boltGeometry, steel);
    bolt.rotation.z = a;
    door.add(bolt);
    return { bolt, a };
  });
  // Iris: six wedges that slide outward to open the core.
  const wedge = new Shape();
  wedge.moveTo(0, 0);
  wedge.absarc(0, 0, 0.78, -TAU / 12 - 0.04, TAU / 12 + 0.04, false);
  wedge.lineTo(0, 0);
  const wedgeGeometry = keep(new ExtrudeGeometry(wedge, { depth: 0.08, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1, curveSegments: 10 }));
  const blades = Array.from({ length: 6 }, (_, n) => {
    const holder = new Group();
    holder.rotation.z = (n / 6) * TAU;
    const blade = new Mesh(wedgeGeometry, iron);
    holder.add(blade);
    holder.position.z = -0.05;
    door.add(holder);
    return blade;
  });
  const core = glowSprite(kit, "rgba(255,40,70,0.9)", 3.2);
  core.position.z = -0.25;
  door.add(core);
  // Rewards flying out: a coin, a badge and a cosmetic.
  const coin = new Mesh(keep(new CylinderGeometry(0.26, 0.26, 0.05, 40)), keep(new MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.22, emissive: 0x3d2600 })));
  coin.rotation.x = Math.PI / 2;
  const badge = new Mesh(keep(new CylinderGeometry(0.24, 0.24, 0.07, 6)), keep(new MeshStandardMaterial({ color: ROSE, metalness: 0.6, roughness: 0.25, emissive: 0x4a0d2a })));
  badge.rotation.x = Math.PI / 2;
  const card = coverCards(kit)(6);
  card.scale.setScalar(0.42);
  const rewards = [coin, badge, card].map((mesh, i) => {
    const holder = new Group();
    holder.add(mesh);
    door.add(holder);
    return { holder, x: (i - 1) * 1.1, y: i === 1 ? 0.7 : -0.1 };
  });

  return {
    group,
    key: new Color(0xffe2e7),
    rim: new Color(RED),
    place(layout) {
      door.scale.setScalar(layout === "tall" ? 0.8 : 0.75);
      door.rotation.y = layout === "tall" ? 0 : -0.25;
    },
    update({ t, hold, clock, idle }) {
      const rise = easeOut(smooth(-0.8, -0.1, t));
      door.position.y = (1 - rise) * -3;
      const align = easeInOut(smooth(0.05, 0.42, hold));
      rings.forEach(({ ring, offset }, i) => {
        ring.rotation.z = offset * (1 - align) + (idle ? Math.sin(clock * 0.5 + i) * 0.03 * (1 - align) : 0);
      });
      const unlock = easeInOut(smooth(0.42, 0.56, hold));
      for (const { bolt, a } of bolts) {
        const r = 2.05 + unlock * 0.32;
        bolt.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.12);
      }
      const open = easeInOut(smooth(0.55, 0.75, hold));
      for (const blade of blades) {
        blade.position.x = open * 0.72;
        blade.rotation.z = open * 0.25;
      }
      core.material.opacity = 0.25 + open * 0.75 + (idle ? Math.sin(clock * 2.2) * 0.08 : 0);
      core.scale.setScalar(2 + open * 2.2);
      rewards.forEach(({ holder, x, y }, i) => {
        const fly = easeOut(smooth(0.74 + i * 0.05, 0.94 + i * 0.03, hold));
        holder.visible = fly > 0.001;
        holder.position.set(x * fly, y * fly, -0.2 + fly * 1.5);
        holder.scale.setScalar(Math.max(0.001, fly));
        holder.rotation.y = (1 - fly) * 3 + (idle ? Math.sin(clock + i) * 0.25 : 0);
      });
    },
  };
};

export const lab: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const bench = new Group();
  group.add(bench);

  // A flask of something bubbly.
  const glassProfile = [
    [0.001, -0.9], [0.62, -0.88], [0.75, -0.6], [0.7, -0.2], [0.4, 0.15], [0.2, 0.35], [0.2, 0.95], [0.26, 1.0], [0.001, 1.0],
  ].map(([x, y]) => new Vector2(x, y));
  const flask = new Group();
  const glass = new Mesh(
    keep(new LatheGeometry(glassProfile, 40)),
    keep(new MeshPhysicalMaterial({ color: 0xdff8ff, transparent: true, opacity: 0.22, roughness: 0.05, clearcoat: 1, depthWrite: false, side: DoubleSide })),
  );
  const liquidProfile = [[0.001, -0.84], [0.58, -0.82], [0.69, -0.58], [0.64, -0.24], [0.001, -0.24]].map(([x, y]) => new Vector2(x, y));
  const liquid = new Mesh(keep(new LatheGeometry(liquidProfile, 40)), keep(new MeshBasicMaterial({ color: 0x4dd6a0, transparent: true, opacity: 0.85 })));
  const flaskGlow = glowSprite(kit, "rgba(77,214,160,0.6)", 2.6);
  flaskGlow.position.y = -0.5;
  flask.add(liquid, glass, flaskGlow);
  const bubbleGeometry = keep(new SphereGeometry(0.05, 10, 8));
  const bubbleMaterial = keep(new MeshBasicMaterial({ color: 0xc9ffe9, transparent: true, opacity: 0.8 }));
  const rand = random(31);
  const bubbles = Array.from({ length: 10 }, () => {
    const bubble = new Mesh(bubbleGeometry, bubbleMaterial);
    flask.add(bubble);
    return { bubble, x: (rand() * 2 - 1) * 0.35, z: (rand() * 2 - 1) * 0.35, phase: rand(), size: 0.5 + rand() };
  });
  bench.add(flask);

  // Uphill Volume: a slider on a slope.
  const slope = new Group();
  slope.add(new Mesh(keep(slab(2.2, 0.1, 0.12, 0.05)), keep(new MeshStandardMaterial({ color: 0x3a2a55, roughness: 0.4, metalness: 0.3 }))));
  const tickGeometry = keep(new BoxGeometry(0.02, 0.12, 0.02));
  const tickMaterial = keep(new MeshBasicMaterial({ color: 0x9d90b8 }));
  for (let i = 0; i <= 8; i++) {
    const tick = new Mesh(tickGeometry, tickMaterial);
    tick.position.set(-1 + i * 0.25, -0.14, 0);
    slope.add(tick);
  }
  const knob = new Mesh(keep(new SphereGeometry(0.17, 24, 16)), keep(new MeshStandardMaterial({ color: 0x4fd6ec, emissive: 0x0b3b55, roughness: 0.25, metalness: 0.2 })));
  slope.add(knob);
  slope.rotation.z = 0.38;
  bench.add(slope);

  // The Shy Button.
  const button = new Group();
  const buttonFace = kit.texture(
    paint(256, 96, (ctx) => {
      ctx.fillStyle = "#f472a8";
      ctx.fillRect(0, 0, 256, 96);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 40px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Click me", 128, 50);
    }),
  );
  button.add(
    new Mesh(keep(slab(1.05, 0.4, 0.16, 0.2, 0.02)), [
      keep(new MeshStandardMaterial({ map: buttonFace, emissiveMap: buttonFace, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.35 })),
      keep(new MeshStandardMaterial({ color: 0x9c2a5e, roughness: 0.4 })),
    ]),
  );
  bench.add(button);
  const arrow = new Shape();
  arrow.moveTo(0, 0);
  arrow.lineTo(0, -0.32);
  arrow.lineTo(0.08, -0.24);
  arrow.lineTo(0.14, -0.36);
  arrow.lineTo(0.19, -0.33);
  arrow.lineTo(0.13, -0.21);
  arrow.lineTo(0.23, -0.21);
  arrow.lineTo(0, 0);
  const cursor = new Mesh(keep(new ExtrudeGeometry(arrow, { depth: 0.03, bevelEnabled: false })), keep(new MeshBasicMaterial({ color: 0xffffff })));
  bench.add(cursor);
  const dodges = [[1.55, 0.75], [2.05, -0.15], [1.05, -0.55], [1.95, 0.55], [1.45, 0.05]];

  // Date of birth, in binary.
  const bits = new Group();
  const zero = paint(64, 64, (ctx) => {
    ctx.fillStyle = "#1c1330";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#cbb8ff";
    ctx.font = "700 44px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("0", 32, 35);
  });
  const one = paint(64, 64, (ctx) => {
    ctx.fillStyle = "#a57cff";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 44px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("1", 32, 35);
  });
  const zeroMaterial = keep(new MeshStandardMaterial({ map: kit.texture(zero), roughness: 0.5 }));
  const oneMaterial = keep(new MeshStandardMaterial({ map: kit.texture(one), emissive: 0x2b0d66, roughness: 0.4 }));
  const cubeGeometry = keep(new BoxGeometry(0.26, 0.26, 0.26));
  const cubeMaterials = [zeroMaterial, zeroMaterial, oneMaterial, oneMaterial, zeroMaterial, zeroMaterial];
  const cubes = Array.from({ length: 8 }, (_, k) => {
    const cube = new Mesh(cubeGeometry, cubeMaterials);
    cube.position.x = (k - 3.5) * 0.32;
    bits.add(cube);
    return cube;
  });
  bench.add(bits);
  const knobAt = { x: 0, y: 0 };

  return {
    group,
    key: new Color(0xe9fff4),
    rim: new Color(0x4fd6ec),
    place(layout) {
      const tall = layout === "tall";
      flask.position.set(tall ? -0.2 : 0, tall ? 0.55 : 0.35, -0.6);
      slope.position.set(tall ? -0.9 : -1.6, tall ? -0.95 : -0.9, 0.4);
      bits.position.set(tall ? 0 : 0.2, tall ? -1.9 : -1.75, 0.6);
      bench.scale.setScalar(tall ? 0.82 : 1);
      bench.rotation.y = tall ? 0 : -0.2;
    },
    update({ t, hold, clock, idle }) {
      const enter = easeOut(smooth(-0.7, -0.15, t));
      bench.position.y = (1 - enter) * -2.5;
      for (const { bubble, x, z, phase, size } of bubbles) {
        const k = (phase + (idle ? clock * 0.35 : hold * 2)) % 1;
        bubble.position.set(x * (1 - k * 0.6), -0.8 + k * 0.55, z * (1 - k * 0.6));
        bubble.scale.setScalar(size * (1 - k * 0.5));
      }
      // Pushing uphill, slipping back a little on each try.
      const u = clamp01(hold * 0.95 - Math.max(0, Math.sin(hold * Math.PI * 5)) * 0.08);
      knobAt.x = lerp(-0.95, 0.95, u);
      knob.position.set(knobAt.x, 0.16, 0);
      knob.rotation.z = -u * 8;
      const path = hold * (dodges.length - 1);
      const i = Math.min(dodges.length - 2, Math.floor(path));
      const f = easeInOut(clamp01(path - i));
      const bx = lerp(dodges[i][0], dodges[i + 1][0], f);
      const by = lerp(dodges[i][1], dodges[i + 1][1], f);
      const tired = smooth(0.85, 1, hold);
      button.position.set(bx, by, 0.3);
      button.scale.set(1, 1 - tired * 0.18, 1);
      button.rotation.z = tired * -0.12 + (idle ? Math.sin(clock * 6) * 0.03 * (1 - tired) : 0);
      const lag = clamp01(path - 0.35);
      const j = Math.min(dodges.length - 2, Math.floor(lag));
      const g = easeInOut(clamp01(lag - j));
      cursor.position.set(lerp(dodges[j][0], dodges[j + 1][0], g) - 0.1 + tired * 0.1, lerp(dodges[j][1], dodges[j + 1][1], g) - 0.05, 0.45);
      const value = Math.round(smooth(0.05, 0.9, hold) * 27);
      cubes.forEach((cube, k) => {
        cube.rotation.x = (value >> (7 - k)) & 1 ? Math.PI / 2 : 0;
        cube.position.y = idle ? Math.sin(clock * 1.6 + k * 0.6) * 0.03 : 0;
      });
    },
  };
};

export const sanctum: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const hall = new Group();
  group.add(hall);
  const floor = new Mesh(keep(new CircleGeometry(4.2, 72)), keep(new MeshStandardMaterial({ color: 0x0b0607, metalness: 0.9, roughness: 0.16, envMapIntensity: 1.3 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.7;
  hall.add(floor);
  const lineMaterial = keep(new MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
  const circles = [2.1, 3.1].map((radius) => {
    const circle = new Mesh(keep(new RingGeometry(radius, radius + 0.025, 96)), lineMaterial);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = -1.68;
    hall.add(circle);
    return circle;
  });
  const coreMaterial = keep(
    new MeshPhysicalMaterial({ color: 0xc0182e, emissive: 0x5a0010, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.2, clearcoat: 1, flatShading: true }),
  );
  const core = new Mesh(keep(new OctahedronGeometry(0.6, 0)), coreMaterial);
  core.scale.set(0.75, 1.5, 0.75);
  core.position.y = 0.35;
  const coreGlow = glowSprite(kit, "rgba(255,31,61,0.7)", 4.2);
  coreGlow.position.set(0, 0.35, -0.4);
  hall.add(core, coreGlow);

  // System windows around the core.
  const panelGeometry = keep(new PlaneGeometry(1.25, 0.82));
  const panelMaterial = keep(new MeshBasicMaterial({ color: 0x1a070b, transparent: true, opacity: 0.82, side: DoubleSide }));
  const edgeMaterial = keep(new LineBasicMaterial({ color: RED, transparent: true, opacity: 0.85 }));
  const edgeGeometry = keep(new EdgesGeometry(panelGeometry));
  const barGeometry = keep(new PlaneGeometry(1, 0.06));
  const dimBar = keep(new MeshBasicMaterial({ color: 0xd2c2c4, transparent: true, opacity: 0.55 }));
  const redBar = keep(new MeshBasicMaterial({ color: RED }));
  const panels = [-1.05, -0.35, 0.35, 1.05].map((a, i) => {
    const panel = new Group();
    panel.add(new Mesh(panelGeometry, panelMaterial), new LineSegments(edgeGeometry, edgeMaterial));
    for (let b = 0; b < 3; b++) {
      const bar = new Mesh(barGeometry, b === 0 ? redBar : dimBar);
      bar.scale.x = [0.55, 0.85, 0.6][(b + i) % 3];
      bar.position.set(-0.5 + bar.scale.x / 2, 0.24 - b * 0.16, 0.01);
      panel.add(bar);
    }
    for (let c = 0; c < 5; c++) {
      const column = new Mesh(barGeometry, redBar);
      const h = 0.06 + (((c + i * 2) * 37) % 10) * 0.025;
      column.scale.set(0.12, h / 0.06, 1);
      column.position.set(-0.45 + c * 0.2, -0.32 + h / 2, 0.01);
      panel.add(column);
    }
    hall.add(panel);
    return { panel, a, i };
  });

  // The Forge: reward tokens sink into the code plate.
  const plateFace = kit.texture(
    paint(512, 128, (ctx) => {
      ctx.fillStyle = "#14060a";
      ctx.fillRect(0, 0, 512, 128);
      ctx.strokeStyle = "#ff1f3d";
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, 496, 112);
      ctx.fillStyle = "#ffe9ea";
      for (let i = 0; i < 9; i++) {
        if (i === 4) continue;
        ctx.beginPath();
        ctx.arc(76 + i * 45, 64, 9, 0, TAU);
        ctx.fill();
      }
    }),
  );
  const plate = new Mesh(keep(slab(1.9, 0.48, 0.08, 0.06, 0.01)), [
    keep(new MeshStandardMaterial({ map: plateFace, emissiveMap: plateFace, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4 })),
    keep(new MeshStandardMaterial({ color: 0x3c282d, metalness: 1, roughness: 0.3 })),
  ]);
  plate.position.set(0, -1.05, 1.1);
  plate.rotation.x = -0.35;
  hall.add(plate);
  const tokenGeometry = keep(new OctahedronGeometry(0.15, 0));
  const tokens = [GOLD, ROSE, AMETHYST].map((color, i) => {
    const token = new Mesh(tokenGeometry, keep(new MeshStandardMaterial({ color, emissive: new Color(color).multiplyScalar(0.35), metalness: 0.5, roughness: 0.2, flatShading: true })));
    hall.add(token);
    return { token, phase: (i / 3) * TAU };
  });
  const wave = new Mesh(keep(new RingGeometry(0.9, 1, 64)), keep(new MeshBasicMaterial({ color: RED, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })));
  wave.rotation.x = -Math.PI / 2;
  wave.position.y = -1.66;
  hall.add(wave);

  // Embers rising through the hall.
  const emberCount = kit.layout === "tall" ? 120 : 220;
  const rand = random(13);
  const seeds = Array.from({ length: emberCount }, () => ({ x: (rand() * 2 - 1) * 3.4, z: (rand() * 2 - 1) * 2, y: rand(), speed: 0.08 + rand() * 0.14 }));
  const emberPositions = new Float32Array(emberCount * 3);
  const emberGeometry = keep(new BufferGeometry());
  emberGeometry.setAttribute("position", new Float32BufferAttribute(emberPositions, 3));
  const embers = new Points(
    emberGeometry,
    keep(
      new PointsMaterial({
        color: 0xff5a3c,
        size: 0.07,
        map: keep(radialTexture([[0, "rgba(255,255,255,1)"], [0.4, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]])),
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    ),
  );
  hall.add(embers);
  const position = emberGeometry.getAttribute("position");

  return {
    group,
    key: new Color(0xffd6da),
    rim: new Color(RED),
    place(layout) {
      hall.scale.setScalar(layout === "tall" ? 0.8 : 0.75);
      hall.rotation.y = layout === "tall" ? 0 : -0.15;
    },
    update({ t, hold, clock, idle }) {
      const enter = easeOut(smooth(-0.8, -0.1, t));
      panels.forEach(({ panel, a, i }) => {
        const k = easeOut(smooth(-0.6 + i * 0.07, -0.1 + i * 0.07, t));
        const r = 2.3;
        panel.position.set(Math.sin(a) * r, 0.75 + (i % 2) * 0.35 - (1 - k) * 1.5, -Math.cos(a) * r * 0.55 + 0.2);
        panel.rotation.set(0, -a * 0.6 + (idle ? Math.sin(clock * 0.7 + i) * 0.05 : 0), 0);
        panel.scale.setScalar(Math.max(0.001, k));
      });
      core.rotation.y = (idle ? clock * 0.4 : 0) + hold * 2;
      core.position.y = 0.35 + (idle ? Math.sin(clock * 1.1) * 0.06 : 0);
      coreGlow.material.opacity = 0.6 + smooth(0.85, 0.95, hold) * 0.4;
      for (const circle of circles) circle.rotation.z = (idle ? clock * 0.1 : 0) + hold;
      const sink = easeInOut(smooth(0.35, 0.85, hold));
      tokens.forEach(({ token, phase }) => {
        const a = phase + (idle ? clock * 0.8 : 0) + hold * 5;
        const r = 1.1 * (1 - sink);
        token.position.set(Math.cos(a) * r, lerp(0.35, -1.0, sink) + Math.sin(a * 2) * 0.1 * (1 - sink), 1.1 * sink + Math.sin(a) * r * 0.6);
        token.rotation.y = a * 2;
        token.scale.setScalar(Math.max(0.001, (1 - smooth(0.8, 0.88, hold)) * enter));
      });
      const burst = smooth(0.86, 1, hold);
      wave.visible = burst > 0 && burst < 1;
      wave.scale.setScalar(0.5 + burst * 3.5);
      wave.material.opacity = 1 - burst;
      plate.scale.setScalar(1 + Math.sin(smooth(0.84, 0.94, hold) * Math.PI) * 0.08);
      const rise = idle ? clock : hold * 3;
      seeds.forEach(({ x, z, y, speed }, i) => {
        position.setXYZ(i, x + Math.sin(rise * 0.7 + i) * 0.1, -1.6 + ((y + rise * speed) % 1) * 4.2, z);
      });
      position.needsUpdate = true;
      embers.visible = enter > 0.05;
    },
  };
};
