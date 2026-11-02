import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { THEME_IDS, THEMES } from "@/lib/themes";
import { coverCards, glowSprite } from "./core";
import { AMETHYST, clamp01, easeBack, easeInOut, easeOut, GOLD, paint, type PieceBuilder, random, ROSE, roundedShape, slab, smooth } from "./kit";

const TAU = Math.PI * 2;

export const customization: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const stage = new Group();
  group.add(stage);
  const themes = THEME_IDS.map((id) => ({ accent: new Color(THEMES[id].headings.h2), second: new Color(THEMES[id].headings.h3) }));
  const key = new Color(AMETHYST);
  const rim = new Color(ROSE);

  // The showcase: a framed cover that turns like the artwork viewer.
  const viewer = new Group();
  const cover = coverCards(kit)(0);
  cover.scale.setScalar(1.45);
  viewer.add(cover);
  const outer = roundedShape(1.85, 2.45, 0.16);
  outer.holes.push(roundedShape(1.5, 2.14, 0.1));
  const metal = keep(new MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.22, envMapIntensity: 1.4 }));
  const frame = new Mesh(keep(new ExtrudeGeometry(outer, { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 6 })), metal);
  frame.position.z = -0.06;
  viewer.add(frame);
  const gemMaterial = keep(new MeshStandardMaterial({ color: AMETHYST, emissive: 0x2b0d66, metalness: 0.2, roughness: 0.1, flatShading: true }));
  const crest = new Mesh(keep(new OctahedronGeometry(0.2, 0)), gemMaterial);
  crest.position.set(0, 1.32, 0.06);
  crest.scale.set(1, 1.3, 0.6);
  viewer.add(crest);
  const studGeometry = keep(new SphereGeometry(0.07, 16, 10));
  for (const [x, y] of [[-0.86, -1.16], [0.86, -1.16], [-0.86, 1.16], [0.86, 1.16]]) {
    const stud = new Mesh(studGeometry, gemMaterial);
    stud.position.set(x, y, 0.08);
    viewer.add(stud);
  }
  const halo = glowSprite(kit, "rgba(255,255,255,0.35)", 5);
  halo.position.z = -0.6;
  viewer.add(halo);
  stage.add(viewer);

  // One orb per theme, circling the viewer.
  const orbGeometry = keep(new SphereGeometry(0.16, 24, 16));
  const bandGeometry = keep(new TorusGeometry(0.22, 0.018, 8, 40));
  const orbs = themes.map(({ accent, second }, i) => {
    const orb = new Group();
    orb.add(new Mesh(orbGeometry, keep(new MeshStandardMaterial({ color: accent, emissive: accent.clone().multiplyScalar(0.35), roughness: 0.2, metalness: 0.3 }))));
    const band = new Mesh(bandGeometry, keep(new MeshBasicMaterial({ color: second })));
    band.rotation.x = 1.2;
    orb.add(band);
    stage.add(orb);
    return { orb, angle: (i / themes.length) * TAU };
  });

  // Profile: avatar with a decoration, a badge and a title.
  const profile = new Group();
  const avatarFace = kit.texture(
    paint(128, 128, (ctx) => {
      const fade = ctx.createLinearGradient(0, 0, 128, 128);
      fade.addColorStop(0, "#f472a8");
      fade.addColorStop(1, "#5a3d8c");
      ctx.fillStyle = fade;
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(64, 50, 22, 0, TAU);
      ctx.arc(64, 128, 46, Math.PI, TAU);
      ctx.fill();
    }),
  );
  const avatar = new Mesh(keep(new CircleGeometry(0.36, 40)), keep(new MeshBasicMaterial({ map: avatarFace })));
  const decoration = new Mesh(keep(new TorusGeometry(0.42, 0.045, 10, 48)), metal);
  const decorationGem = new Mesh(keep(new OctahedronGeometry(0.09, 0)), gemMaterial);
  decorationGem.position.set(0, 0.45, 0.04);
  const badge = new Mesh(keep(new CylinderGeometry(0.13, 0.13, 0.05, 6)), keep(new MeshStandardMaterial({ color: ROSE, metalness: 0.6, roughness: 0.25 })));
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0.66, 0.12, 0);
  const title = new Mesh(keep(slab(0.9, 0.1, 0.02, 0.05)), keep(new MeshBasicMaterial({ color: 0xf3eeff })));
  title.position.set(1.28, 0.12, 0);
  const subtitle = new Mesh(keep(slab(0.62, 0.08, 0.02, 0.04)), keep(new MeshBasicMaterial({ color: GOLD })));
  subtitle.position.set(0.99, -0.1, 0);
  profile.add(avatar, decoration, decorationGem, badge, title, subtitle);
  stage.add(profile);

  return {
    group,
    key,
    rim,
    place(layout) {
      const tall = layout === "tall";
      stage.scale.setScalar(tall ? 0.85 : 0.85);
      profile.position.set(tall ? -1.15 : -2.3, tall ? -1.85 : -1.25, 0.7);
      profile.scale.setScalar(tall ? 0.85 : 1);
    },
    update({ t, hold, clock, idle }) {
      const enter = easeOut(smooth(-0.7, -0.1, t));
      viewer.rotation.y = -0.35 + hold * 0.7 + (idle ? Math.sin(clock * 0.5) * 0.12 : 0);
      viewer.rotation.x = idle ? Math.sin(clock * 0.37) * 0.05 : 0;
      // Scroll steps through every theme; the lights and frame follow along.
      const position = clamp01(hold) * (themes.length - 1);
      const index = Math.min(themes.length - 2, Math.floor(position));
      const f = easeInOut(position - index);
      key.copy(themes[index].accent).lerp(themes[index + 1].accent, f);
      rim.copy(themes[index].second).lerp(themes[index + 1].second, f);
      metal.color.setHex(GOLD).lerp(key, 0.35);
      halo.material.color.copy(key);
      orbs.forEach(({ orb, angle }, i) => {
        const a = angle + (idle ? clock * 0.15 : 0) + hold * 1.2;
        const near = Math.max(0, 1 - Math.abs(position - i));
        orb.position.set(Math.cos(a) * 2.25, Math.sin(a * 2) * 0.25 + 0.1, Math.sin(a) * 0.9);
        orb.scale.setScalar(Math.max(0.001, enter) * (1 + near * 0.6));
      });
      profile.rotation.y = 0.25 + (idle ? Math.sin(clock * 0.6) * 0.06 : 0);
      decoration.rotation.z = idle ? clock * 0.4 : hold * 2;
    },
  };
};

const MEDAL_ICONS: ((ctx: CanvasRenderingContext2D) => void)[] = [
  (ctx) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 26 : 60;
      const a = (i / 10) * TAU - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.fill();
  },
  (ctx) => {
    ctx.beginPath();
    ctx.roundRect(-58, -34, 116, 68, 30);
    ctx.fill();
    ctx.fillStyle = "#3d2600";
    ctx.fillRect(-38, -6, 32, 12);
    ctx.fillRect(-28, -16, 12, 32);
    for (const [x, y] of [[26, -10], [42, 6]]) {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, TAU);
      ctx.fill();
    }
  },
  (ctx) => {
    ctx.lineWidth = 16;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = ctx.fillStyle as string;
    ctx.beginPath();
    ctx.moveTo(-40, 2);
    ctx.lineTo(-12, 30);
    ctx.lineTo(44, -30);
    ctx.stroke();
  },
];

function medalFace(icon: ((ctx: CanvasRenderingContext2D) => void) | null) {
  return paint(256, 256, (ctx) => {
    const fade = ctx.createRadialGradient(100, 90, 10, 128, 128, 128);
    fade.addColorStop(0, icon ? "#fff1c2" : "#3a3346");
    fade.addColorStop(1, icon ? "#d98f1a" : "#14101c");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 256, 256);
    ctx.translate(128, 128);
    ctx.fillStyle = icon ? "#7a4a00" : "#8f86a3";
    if (icon) icon(ctx);
    else {
      ctx.font = "800 120px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", 0, 8);
    }
  });
}

export const achievements: PieceBuilder = (kit) => {
  const { keep } = kit;
  const group = new Group();
  const cabinet = new Group();
  group.add(cabinet);
  const back = new Mesh(keep(slab(4.6, 2.6, 0.12, 0.24, 0.02)), keep(new MeshStandardMaterial({ color: 0x150d22, roughness: 0.45, metalness: 0.4 })));
  back.position.z = -0.5;
  cabinet.add(back);
  const discGeometry = keep(new CylinderGeometry(0.46, 0.46, 0.09, 56));
  const rimGeometry = keep(new TorusGeometry(0.46, 0.05, 12, 56));
  const gold = keep(new MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.22, envMapIntensity: 1.3 }));
  const ribbonGeometry = keep(slab(0.2, 0.7, 0.02, 0.02));
  const ribbonColors = [AMETHYST, ROSE, 0x4fd6ec, 0x8f86a3];
  const medals = [0, 1, 2, -1].map((icon, i) => {
    const medal = new Group();
    const hidden = icon < 0;
    const front = keep(new MeshStandardMaterial({ map: kit.texture(medalFace(hidden ? null : MEDAL_ICONS[icon])), roughness: 0.35, metalness: hidden ? 0.2 : 0.6 }));
    const reverse = hidden ? keep(new MeshStandardMaterial({ map: kit.texture(medalFace(MEDAL_ICONS[0])), roughness: 0.35, metalness: 0.6 })) : front;
    const disc = new Mesh(discGeometry, [gold, front, reverse]);
    disc.rotation.x = Math.PI / 2;
    const spinner = new Group();
    spinner.add(disc, new Mesh(rimGeometry, gold));
    medal.add(spinner);
    const ribbonMaterial = keep(new MeshStandardMaterial({ color: ribbonColors[i], roughness: 0.6 }));
    for (const dir of [1, -1]) {
      const ribbon = new Mesh(ribbonGeometry, ribbonMaterial);
      ribbon.position.set(dir * 0.13, 0.72, -0.1);
      ribbon.rotation.z = dir * 0.28;
      medal.add(ribbon);
    }
    medal.position.set((i - 1.5) * 1.12, -0.15 + (i % 2) * 0.12, 0);
    cabinet.add(medal);
    return { medal, spinner, hidden, i };
  });
  const burst = glowSprite(kit, "rgba(255,195,90,0.9)", 3);
  burst.position.copy(medals[3].medal.position);
  burst.position.z = -0.2;
  cabinet.add(burst);
  const coinGeometry = keep(new CylinderGeometry(0.11, 0.11, 0.025, 28));
  const rand = random(23);
  const coins = Array.from({ length: 10 }, () => {
    const coin = new Mesh(coinGeometry, gold);
    cabinet.add(coin);
    return { coin, vx: (rand() * 2 - 1) * 1.2, vy: 1.4 + rand() * 1.2, vz: 0.6 + rand() * 0.6, spin: 3 + rand() * 5 };
  });

  return {
    group,
    key: new Color(0xfff1c2),
    rim: new Color(AMETHYST),
    place(layout) {
      cabinet.scale.setScalar(layout === "tall" ? 0.82 : 0.78);
      cabinet.rotation.y = layout === "tall" ? 0 : -0.22;
    },
    update({ t, hold, clock, idle }) {
      for (const { medal, spinner, hidden, i } of medals) {
        const enter = easeBack(smooth(-0.7 + i * 0.08, -0.2 + i * 0.08, t));
        medal.scale.setScalar(Math.max(0.001, enter));
        const sway = idle ? Math.sin(clock * 0.9 + i) * 0.12 : 0;
        // Rotating by π shows the reverse face, where the hidden medal keeps its prize.
        spinner.rotation.y = hidden ? easeInOut(smooth(0.45, 0.65, hold)) * Math.PI + sway * 0.3 : sway + hold * 0.4 * (i % 2 ? -1 : 1);
      }
      const reveal = smooth(0.55, 0.75, hold);
      burst.material.opacity = reveal * (idle ? 0.8 + Math.sin(clock * 3) * 0.2 : 1);
      burst.scale.setScalar(1.5 + reveal * 2);
      const origin = medals[3].medal.position;
      for (const { coin, vx, vy, vz, spin } of coins) {
        const k = clamp01((hold - 0.65) / 0.3);
        coin.visible = k > 0 && k < 1;
        const tau = k * 1.1;
        coin.position.set(origin.x + vx * tau, origin.y + vy * tau - 2.4 * tau * tau, 0.2 + vz * tau);
        coin.rotation.set(spin * tau, 0, spin * tau * 0.5);
      }
    },
  };
};
