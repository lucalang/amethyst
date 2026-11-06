"use client";

import { useState, type CSSProperties } from "react";
import { Play } from "lucide-react";
import { ClassicCutscene } from "@/components/lootboxes/classic-cutscene";
import { PullCutscene, type PullCutsceneEdition } from "@/components/lootboxes/pull-cutscene";
import { useMotionLevel } from "@/components/showcase/motion";
import { CUTSCENE_RARITIES, RARITIES, type CutsceneRarity } from "@/lib/rarities";

type Version = { id: "classic" | PullCutsceneEdition; name: string; tag: string; description: string };

// Oldest first; add a new entry here when the pull cutscenes are replaced again.
const VERSIONS: Version[] = [
  { id: "classic", name: "Version 1 · Burst", tag: "First", description: "The original: spinning rays, a rainbow prism, shockwave rings and a vortex layered in CSS, with the rarity name slamming in." },
  { id: "crystal", name: "Version 2 · Crystal shatter", tag: "Second", description: "Light spirals into a crystal until it cracks and shatters. Every rarity shares the crystal and adds its own touch: glitches, a rainbow beam, a golden pillar or a black hole." },
  { id: "unique", name: "Version 3 · Unique scenes", tag: "Current", description: "A different scene for every rarity, each with its own sound: a decryption lock, a rainbow prism, a golden ascension and the crystal from a black hole." },
];

/** Replays every version of the rare pull cutscenes. */
export function CutsceneArchive() {
  const motion = useMotionLevel();
  const [playing, setPlaying] = useState<{ version: Version["id"]; rarity: CutsceneRarity } | null>(null);
  const stop = () => setPlaying(null);
  const name = "Preview pull";

  return (
    <>
      {motion === "off" ? <p className="ui-empty mb-4 px-4 py-3 text-sm text-muted-foreground">Cutscenes need motion. Turn motion back on in Appearance to play them.</p> : null}
      <ul className="divide-y divide-border">
        {VERSIONS.map((version, index) => (
          <li key={version.id} className="flex gap-4 py-5 first:pt-0 last:pb-0">
            <span aria-hidden className="ui-icon text-sm font-bold tabular-nums">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{version.name}</h3>
                <span className="ui-pill" data-tone={version.tag === "Current" ? "" : undefined}>{version.tag}</span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{version.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {CUTSCENE_RARITIES.map((rarity) => (
                  <button
                    key={rarity}
                    type="button"
                    disabled={motion === "off"}
                    onClick={() => setPlaying({ version: version.id, rarity })}
                    style={{ "--rarity": RARITIES[rarity].color } as CSSProperties}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-(--rarity)/45 bg-(--rarity)/10 px-3 py-1.5 text-sm font-semibold transition-[background-color,border-color,box-shadow,scale] duration-150 hover:border-(--rarity)/70 hover:bg-(--rarity)/20 hover:shadow-[0_8px_22px_-12px_var(--rarity)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
                  >
                    <Play aria-hidden className="size-3.5 text-(--rarity)" />
                    {RARITIES[rarity].label}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {playing?.version === "classic" ? <ClassicCutscene key={`${playing.version}-${playing.rarity}`} rarity={playing.rarity} name={name} onDone={stop} /> : null}
      {playing && playing.version !== "classic" ? <PullCutscene key={`${playing.version}-${playing.rarity}`} edition={playing.version} rarity={playing.rarity} name={name} onDone={stop} /> : null}
    </>
  );
}
