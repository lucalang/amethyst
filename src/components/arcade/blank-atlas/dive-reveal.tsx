"use client";

import { useEffect, useEffectEvent, useState, type CSSProperties } from "react";
import { DIVES, diveOf, type Dive, type Stop } from "@/lib/minigames/blank-atlas";
import type { SoundName } from "../sound";
import { DIVE_COLOR } from "./descent-shaft";

const ORDER: Dive[] = ["familiar", "uncommon", "rare", "exceptional", "extraordinary"];
const FINAL_SOUND: Record<Dive | "drift", SoundName> = {
  drift: "tap",
  familiar: "place",
  uncommon: "chip",
  rare: "reveal",
  exceptional: "power",
  extraordinary: "boom",
};
/** Time per meter step, and how long the climax holds, by dive level (0 = drifted). */
const STEP_MS = 230;
const HOLD_MS = [650, 800, 900, 1050, 1250, 1600];
/** How long the finished reveal shows when motion is off. */
const STILL_MS = 1300;

/**
 * The moment after an answer: it slams in, the rarity meter climbs one step at a time (each step a rising tick)
 * and stops at the answer's own tier, then bursts in the dive's colour while the points count up. Stronger dives
 * hold longer and hit harder (shake, rays, shards). It never blocks input and ends on its own. With motion off it
 * shows the finished state at once, so the dive's quality still reads.
 */
export function DiveReveal({ stop, number, motion, play, onDone }: { stop: Stop; number: number; motion: boolean; play: (name: SoundName, pitch?: number) => void; onDone: () => void }) {
  const dive = diveOf(stop.question, stop.answer, stop.tier);
  const level = dive ? DIVES[dive].level : 0;
  const [lit, setLit] = useState(motion ? 0 : level);
  const [burst, setBurst] = useState(!motion);
  const [points, setPoints] = useState(motion ? 0 : stop.points);
  const finish = useEffectEvent(onDone);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, run: () => void) => timers.push(window.setTimeout(run, ms));
    if (!motion) {
      play(FINAL_SOUND[dive ?? "drift"]);
      at(STILL_MS, () => finish());
      return () => timers.forEach(window.clearTimeout);
    }
    for (let k = 1; k <= level; k++) {
      at(260 + k * STEP_MS, () => {
        setLit(k);
        play("tick", 0.8 + k * 0.18);
      });
    }
    const climax = 300 + level * STEP_MS + 80;
    at(climax, () => {
      setBurst(true);
      play(FINAL_SOUND[dive ?? "drift"]);
      if (dive === "extraordinary") window.setTimeout(() => play("perfect"), 180);
    });
    at(climax + HOLD_MS[level], () => finish());
    return () => timers.forEach(window.clearTimeout);
    // One reveal per mount; the parent remounts it for each answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Count the points up once the burst lands.
  useEffect(() => {
    if (!burst || !motion || stop.points === 0) return;
    let frame = 0;
    const start = performance.now();
    const length = 420 + level * 90;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / length);
      setPoints(Math.round(stop.points * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [burst, motion, stop.points, level]);

  const color = dive ? DIVE_COLOR[dive] : "#8a8f98";
  return (
    <div
      aria-hidden
      className="dv-reveal"
      data-dive={dive ?? "drift"}
      data-burst={burst || undefined}
      data-motion={motion || undefined}
      style={{ "--dv": color, "--level": level, "--hold": `${motion ? HOLD_MS[level] : STILL_MS}ms` } as CSSProperties}
    >
      <div className="dv-reveal-veil" />
      {burst && level >= 3 ? <div className="dv-reveal-rays" /> : null}
      {burst ? <div className="dv-reveal-ring" /> : null}
      {burst && level >= 4 ? <div className="dv-reveal-ring dv-reveal-ring-late" /> : null}
      {burst && dive === "extraordinary" ? (
        <div className="dv-reveal-shards">
          {Array.from({ length: 14 }, (_, k) => (
            <i key={k} style={{ "--a": `${(k / 14) * 360}deg`, "--d": `${120 + (k % 4) * 40}px` } as CSSProperties} />
          ))}
        </div>
      ) : null}
      <div className="dv-reveal-body">
        <p className="dv-reveal-kicker">Dive {number}</p>
        <p className="dv-reveal-answer">{stop.answer ?? "Let pass"}</p>
        <div className="dv-reveal-meter">
          {ORDER.map((entry, k) => (
            <i key={entry} data-on={k < lit || undefined} style={{ "--seg": DIVE_COLOR[entry] } as CSSProperties} />
          ))}
        </div>
        <p className="dv-reveal-name">{burst ? (dive ? DIVES[dive].name : "Drifted") : " "}</p>
        <p className="dv-reveal-points">{burst ? `+${points}` : " "}</p>
      </div>
    </div>
  );
}
