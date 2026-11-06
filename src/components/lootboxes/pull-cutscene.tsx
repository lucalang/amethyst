"use client";

import { useEffect, useEffectEvent, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { FastForward } from "lucide-react";
import { useSettings } from "@/components/layout/settings-context";
import { CUTSCENE_RARITIES, RARITIES, type CutsceneRarity } from "@/lib/rarities";
import { playPullAudio } from "./pull-audio";
import { playPullScene } from "./pull-scene";
import "./pull-cutscene.css";

/** Length of each scene in ms; higher rarities charge up longer before the gem shatters. */
const DURATION: Record<CutsceneRarity, number> = { secret: 4200, prismatic: 4600, exalted: 5600, amethyst: 7400 };
const BUILD: Record<CutsceneRarity, number> = { secret: 1900, prismatic: 1800, exalted: 2300, amethyst: 3200 };
const LINES: Record<CutsceneRarity, string> = {
  secret: "Decrypting something hidden",
  prismatic: "Light splits into every colour",
  exalted: "Something descends",
  amethyst: "The rarest stone in the archive",
};

/**
 * A full-screen scene for a Secret-or-higher pull, escalating with the rarity. Skippable by button,
 * click or Esc/Enter/Space. Portaled above the opening dialog (which must ignore outside clicks meanwhile).
 */
export function PullCutscene({ rarity, name, onDone }: { rarity: CutsceneRarity; name: string; onDone: () => void }) {
  const level = CUTSCENE_RARITIES.indexOf(rarity) + 1;
  const done = useEffectEvent(onDone);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { arcadeSound } = useSettings();
  useEffect(() => {
    if (arcadeSound) return playPullAudio(rarity, BUILD[rarity], DURATION[rarity]);
  }, [rarity, arcadeSound]);

  useEffect(() => {
    const timer = window.setTimeout(() => done(), DURATION[rarity]);
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
  }, [rarity]);

  useEffect(() => {
    if (!canvas.current) return;
    return playPullScene(canvas.current, { rarity, color: RARITIES[rarity].color, build: BUILD[rarity], duration: DURATION[rarity] });
  }, [rarity]);

  const label = RARITIES[rarity].label;
  const style = { "--pc": RARITIES[rarity].color, "--pc-time": `${DURATION[rarity]}ms`, "--pc-build": `${BUILD[rarity]}ms` } as CSSProperties;
  return createPortal(
    <div className="pc-root" data-rarity={rarity} data-level={level} style={style} role="dialog" aria-modal aria-label={`${label} pull: ${name}`} onClick={onDone}>
      <canvas ref={canvas} className="pc-canvas" aria-hidden />
      <div className="pc-text">
        <p className="pc-line">{LINES[rarity]}</p>
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
