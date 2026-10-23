"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_SETTINGS } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { ChoiceCards, useOnReset, useSaveSettings } from "./setting-controls";

type CardInfo = { cardTitle: boolean; cardLabels: boolean; cardProgress: boolean };
type Preset = "standard" | "detailed" | "artwork";

const PRESETS: Record<Preset, CardInfo> = {
  standard: { cardTitle: true, cardLabels: false, cardProgress: true },
  detailed: { cardTitle: true, cardLabels: true, cardProgress: true },
  artwork: { cardTitle: false, cardLabels: false, cardProgress: false },
};

const SWITCHES: { key: keyof CardInfo; label: string; hint: string }[] = [
  { key: "cardTitle", label: "Titles", hint: "Entry name below the cover." },
  { key: "cardLabels", label: "Labels", hint: "The entry’s labels, in one line." },
  { key: "cardProgress", label: "Progress", hint: "Progress bar, Done badge and counts." },
];

function MiniCard({ info }: { info: CardInfo }) {
  return (
    <span className="flex w-10 flex-col gap-1">
      <span className="relative aspect-[2/3] w-full overflow-hidden rounded-[3px] bg-[linear-gradient(160deg,#3a2a5c,#0d0a14)] ring-1 ring-white/10">
        {info.cardProgress ? <span className="absolute inset-x-1 bottom-1 h-0.5 rounded-full bg-amethyst/80" /> : null}
      </span>
      {info.cardTitle ? <span className="h-1 w-4/5 rounded-full bg-white/50" /> : null}
      {info.cardLabels ? <span className="h-1 w-3/5 rounded-full bg-amethyst/50" /> : null}
      {info.cardProgress ? <span className="h-1 w-1/2 rounded-full bg-white/20" /> : null}
    </span>
  );
}

/** Which details regular library cards show. Independent of the pinned-entry presentation. */
export function CardInfoSetting({ value, labelId }: { value: CardInfo; labelId: string }) {
  const save = useSaveSettings();
  const [local, setLocal] = useState(value);
  const [shown, setShown] = useState(value);
  if (JSON.stringify(shown) !== JSON.stringify(value)) {
    setShown(value);
    setLocal(value);
  }
  useOnReset(["cardTitle", "cardLabels", "cardProgress"], () =>
    setLocal({ cardTitle: DEFAULT_SETTINGS.cardTitle, cardLabels: DEFAULT_SETTINGS.cardLabels, cardProgress: DEFAULT_SETTINGS.cardProgress }),
  );

  function update(next: CardInfo) {
    const previous = local;
    setLocal(next);
    void save(next).then((ok) => {
      if (!ok) setLocal(previous);
    });
  }

  const preset = (Object.keys(PRESETS) as Preset[]).find((key) => SWITCHES.every(({ key: field }) => PRESETS[key][field] === local[field]));

  return (
    <div className="space-y-5">
      <ChoiceCards<Preset | "custom">
        name="card-info"
        labelId={labelId}
        value={preset ?? "custom"}
        onChange={(next) => {
          if (next !== "custom") update(PRESETS[next]);
        }}
        options={[
          { value: "standard", title: "Standard", description: "Title and progress (the original look).", preview: <MiniCard info={PRESETS.standard} /> },
          { value: "detailed", title: "Detailed", description: "Adds the entry’s labels.", preview: <MiniCard info={PRESETS.detailed} /> },
          { value: "artwork", title: "Artwork only", description: "Just the covers. No text or overlays.", preview: <MiniCard info={PRESETS.artwork} /> },
        ]}
      />
      <fieldset className="rounded-lg border border-white/[0.08] bg-white/[0.015] p-4">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Fine-tune{!preset ? <span className="ml-1.5 text-amethyst">· Custom mix</span> : null}
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          {SWITCHES.map(({ key, label, hint }) => (
            <div key={key} className="flex items-start gap-3">
              <Switch id={`${key}-switch`} checked={local[key]} onCheckedChange={(checked) => update({ ...local, [key]: checked })} className="mt-0.5" />
              <label htmlFor={`${key}-switch`} className="min-w-0 cursor-pointer">
                <span className={cn("block text-sm font-medium", local[key] ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                <span className="block text-xs leading-5 text-muted-foreground">{hint}</span>
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      <p className="text-xs leading-5 text-muted-foreground">
        Pinning and opening an entry stay available with any combination: use the pin button or the actions menu, which also appear on keyboard focus and on touch screens.
      </p>
    </div>
  );
}
