"use client";

import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { CUTSCENE_RARITIES, RARITIES, type CutsceneRarity } from "@/lib/rarities";
import { useSetting } from "./setting-controls";

/** One toggle per cutscene rarity. */
export function PullCutscenesSetting({ value, labelId }: { value: CutsceneRarity[]; labelId: string }) {
  const [enabled, setEnabled] = useSetting("pullCutscenes", value);
  const toggle = (rarity: CutsceneRarity) =>
    setEnabled(enabled.includes(rarity) ? enabled.filter((id) => id !== rarity) : CUTSCENE_RARITIES.filter((id) => id === rarity || enabled.includes(id)));
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
      {CUTSCENE_RARITIES.map((rarity) => {
        const on = enabled.includes(rarity);
        return (
          <button
            key={rarity}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(rarity)}
            style={{ "--rarity": RARITIES[rarity].color } as CSSProperties}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface/40 px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-[color,background-color,border-color,box-shadow,scale] duration-150 hover:border-(--rarity)/50 hover:text-foreground active:scale-[0.97] aria-pressed:border-(--rarity)/70 aria-pressed:bg-(--rarity)/15 aria-pressed:text-foreground aria-pressed:shadow-[0_8px_22px_-12px_var(--rarity)] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span aria-hidden className="grid size-4 place-items-center rounded-full border border-current text-(--rarity)">
              {on ? <Check className="size-3" /> : null}
            </span>
            {RARITIES[rarity].label}
          </button>
        );
      })}
    </div>
  );
}
