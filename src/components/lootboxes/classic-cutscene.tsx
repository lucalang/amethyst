"use client";

import { useEffect, useEffectEvent, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { FastForward } from "lucide-react";
import { CUTSCENE_RARITIES, RARITIES, type CutsceneRarity } from "@/lib/rarities";
import "./classic-cutscene.css";

const DURATION: Record<CutsceneRarity, number> = { secret: 2800, prismatic: 3800, exalted: 4800, amethyst: 6400 };
const BUILD: Record<CutsceneRarity, number> = { secret: 500, prismatic: 900, exalted: 1400, amethyst: 2400 };
const LINES: Record<CutsceneRarity, string> = {
  secret: "Something hidden surfaced",
  prismatic: "Light splits into every colour",
  exalted: "The vault bows",
  amethyst: "The rarest stone in the archive",
};

/** The first pull cutscene (CSS only), kept so it can be replayed from Settings › Other. */
export function ClassicCutscene({ rarity, name, onDone }: { rarity: CutsceneRarity; name: string; onDone: () => void }) {
  const level = CUTSCENE_RARITIES.indexOf(rarity) + 1;
  const done = useEffectEvent(onDone);
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

  const style = { "--pc": RARITIES[rarity].color, "--pc-time": `${DURATION[rarity]}ms`, "--pc-build": `${BUILD[rarity]}ms` } as CSSProperties;
  const sparks = Array.from({ length: level * 10 }, (_, index) => index);
  return createPortal(
    <div className="pcc-root" data-rarity={rarity} data-level={level} style={style} role="dialog" aria-modal aria-label={`${RARITIES[rarity].label} pull: ${name}`} onClick={onDone}>
      <div className="pcc-veil" aria-hidden />
      <div className="pcc-rays" aria-hidden />
      {level >= 2 ? <div className="pcc-prism" aria-hidden /> : null}
      {level >= 3 ? (
        <div className="pcc-rings" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      ) : null}
      {level >= 4 ? <div className="pcc-vortex" aria-hidden /> : null}
      <div className="pcc-sparks" aria-hidden>
        {sparks.map((index) => (
          <span key={index} style={{ "--a": `${(index * 137.5) % 360}deg`, "--d": `${(index % 7) * 60}ms`, "--r": `${30 + ((index * 53) % 40)}vmax` } as CSSProperties} />
        ))}
      </div>
      <div className="pcc-flash" aria-hidden />
      <div className="pcc-text">
        <p className="pcc-line">{LINES[rarity]}</p>
        <p className="pcc-rarity">{RARITIES[rarity].label}</p>
        <p className="pcc-name">{name}</p>
      </div>
      <button
        type="button"
        className="pcc-skip"
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
