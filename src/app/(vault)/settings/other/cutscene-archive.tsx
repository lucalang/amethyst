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
      {motion === "off" ? <p className="mb-4 text-sm text-muted-foreground">Cutscenes need motion. Turn motion back on in Appearance to play them.</p> : null}
      <ul className="grid gap-3">
        {VERSIONS.map((version) => (
          <li key={version.id} className="rounded-xl border border-white/[0.08] bg-foreground/[0.02] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{version.name}</h3>
              <span className="rounded-full border border-amethyst/30 bg-amethyst/10 px-2 py-0.5 text-[11px] font-medium text-amethyst">{version.tag}</span>
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
                  className="inline-flex items-center gap-1.5 rounded-full border border-(--rarity)/50 bg-(--rarity)/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-(--rarity)/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play aria-hidden className="size-3.5 text-(--rarity)" />
                  {RARITIES[rarity].label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {playing?.version === "classic" ? <ClassicCutscene key={`${playing.version}-${playing.rarity}`} rarity={playing.rarity} name={name} onDone={stop} /> : null}
      {playing && playing.version !== "classic" ? <PullCutscene key={`${playing.version}-${playing.rarity}`} edition={playing.version} rarity={playing.rarity} name={name} onDone={stop} /> : null}
    </>
  );
}
