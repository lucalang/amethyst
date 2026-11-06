"use client";

import { useEffect, useEffectEvent, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { FastForward } from "lucide-react";
import { useSettings } from "@/components/layout/settings-context";
import { CUTSCENE_RARITIES, RARITIES, type CutsceneRarity } from "@/lib/rarities";
import { playPullAudio } from "./pull-audio";
import { playCrystalScene, playPullScene } from "./pull-scene";
import "./pull-cutscene.css";

type Edition = {
  /** Length of each scene in ms, and the charge-up before its burst. */
  duration: Record<CutsceneRarity, number>;
  build: Record<CutsceneRarity, number>;
  lines: Record<CutsceneRarity, string>;
  play: typeof playPullScene;
  sound: boolean;
};

/** "unique" plays on pulls; "crystal" is the earlier one-scene-for-all version kept for the archive. */
const EDITIONS = {
  unique: {
    duration: { secret: 4200, prismatic: 4600, exalted: 5600, amethyst: 7400 },
    build: { secret: 1900, prismatic: 1800, exalted: 2300, amethyst: 3200 },
    lines: { secret: "Decrypting something hidden", prismatic: "Light splits into every colour", exalted: "Something descends", amethyst: "The rarest stone in the archive" },
    play: playPullScene,
    sound: true,
  },
  crystal: {
    duration: { secret: 3600, prismatic: 4600, exalted: 5600, amethyst: 7400 },
    build: { secret: 1300, prismatic: 1800, exalted: 2300, amethyst: 3200 },
    lines: { secret: "Something hidden surfaced", prismatic: "Light splits into every colour", exalted: "The vault bows", amethyst: "The rarest stone in the archive" },
    play: playCrystalScene,
    sound: false,
  },
} satisfies Record<string, Edition>;

export type PullCutsceneEdition = keyof typeof EDITIONS;

/**
 * A full-screen scene for a Secret-or-higher pull, escalating with the rarity. Skippable by button,
 * click or Esc/Enter/Space. Portaled above the opening dialog (which must ignore outside clicks meanwhile).
 */
export function PullCutscene({ rarity, name, onDone, edition = "unique" }: { rarity: CutsceneRarity; name: string; onDone: () => void; edition?: PullCutsceneEdition }) {
  const level = CUTSCENE_RARITIES.indexOf(rarity) + 1;
  const done = useEffectEvent(onDone);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { arcadeSound } = useSettings();
  const { duration, build, lines, play, sound }: Edition = EDITIONS[edition];
  useEffect(() => {
    if (arcadeSound && sound) return playPullAudio(rarity, build[rarity], duration[rarity]);
  }, [rarity, arcadeSound, sound, build, duration]);

  useEffect(() => {
    const timer = window.setTimeout(() => done(), duration[rarity]);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      done();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [rarity, duration]);

  useEffect(() => {
    if (!canvas.current) return;
    return play(canvas.current, { rarity, color: RARITIES[rarity].color, build: build[rarity], duration: duration[rarity] });
  }, [rarity, play, build, duration]);

  const label = RARITIES[rarity].label;
  const style = { "--pc": RARITIES[rarity].color, "--pc-time": `${duration[rarity]}ms`, "--pc-build": `${build[rarity]}ms` } as CSSProperties;
  return createPortal(
    <div className="pc-root" data-rarity={rarity} data-level={level} style={style} role="dialog" aria-modal aria-label={`${label} pull: ${name}`} onClick={onDone}>
      <canvas ref={canvas} className="pc-canvas" aria-hidden />
      <div className="pc-text">
        <p className="pc-line">{lines[rarity]}</p>
        <p className="pc-rarity" aria-hidden>
          {[...label].map((letter, index) => (
            <span key={index} style={{ "--i": index, "--n": label.length } as CSSProperties}>
              {letter}
            </span>
          ))}
        </p>
        <p className="pc-name">{name}</p>
      </div>
      <button
        type="button"
        className="pc-skip"
        onClick={(event) => {
          event.stopPropagation();
          onDone();
        }}
      >
        <FastForward aria-hidden className="size-4" /> Skip
      </button>
    </div>,
    document.body,
  );
}
