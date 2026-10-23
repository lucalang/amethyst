"use client";

import type { CSSProperties } from "react";
import { HOVER_SCALE_RANGE, type LibraryDensity, type MotionLevel } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { ChoiceSetting, RangeInput, useSetting, type Choice } from "./setting-controls";

const TONES = [
  "bg-[linear-gradient(160deg,#6d4bb8,#2a1747_60%,#120a1f)]",
  "bg-[linear-gradient(160deg,#a14f7f,#3b1830_60%,#140812)]",
  "bg-[linear-gradient(160deg,#4f6bb8,#1a2547_60%,#0a0f1f)]",
];

const MOTION_OPTIONS: Choice<MotionLevel>[] = [
  { value: "full", title: "Full", description: "Every entrance, hover lift and the opening intro." },
  { value: "subtle", title: "Subtle", description: "Short, gentle transitions. No scroll effects or long intro." },
  { value: "off", title: "Off", description: "Everything appears instantly. Nothing moves on its own." },
];

export function MotionSetting({ value, labelId }: { value: MotionLevel; labelId: string }) {
  return <ChoiceSetting settingKey="motion" value={value} labelId={labelId} options={MOTION_OPTIONS} />;
}

function DensityPreview({ columns, gap }: { columns: number; gap: string }) {
  return (
    <span className={cn("grid w-full", gap)} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: columns * 2 }, (_, index) => (
        <span key={index} className={cn("aspect-[2/3] rounded-[3px] ring-1 ring-white/10", TONES[index % TONES.length])} />
      ))}
    </span>
  );
}

const DENSITY_OPTIONS: Choice<LibraryDensity>[] = [
  { value: "comfortable", title: "Comfortable", description: "Balanced covers with room to breathe.", preview: <DensityPreview columns={5} gap="gap-1.5" /> },
  { value: "compact", title: "Compact", description: "Smaller covers, more of your library at once.", preview: <DensityPreview columns={8} gap="gap-1" /> },
  { value: "large", title: "Large covers", description: "Fewer, bigger covers that show off the artwork.", preview: <DensityPreview columns={3} gap="gap-2" /> },
];

export function DensitySetting({ value, labelId }: { value: LibraryDensity; labelId: string }) {
  return <ChoiceSetting settingKey="libraryDensity" value={value} labelId={labelId} options={DENSITY_OPTIONS} />;
}

/** Hover zoom for cover cards, with cards to try it on. */
export function HoverScaleSetting({ value, labelId }: { value: number; labelId: string }) {
  const [local, update] = useSetting("hoverScale", value, 400);
  return (
    <div className="space-y-5">
      <RangeInput
        id="hover-scale"
        labelId={labelId}
        value={local}
        min={HOVER_SCALE_RANGE.min}
        max={HOVER_SCALE_RANGE.max}
        format={(scale) => (scale === 0 ? "None" : `${scale}%`)}
        onChange={update}
        marks={["No zoom", "Big zoom"]}
      />
      <div
        className="flex items-end gap-4 rounded-lg border border-white/[0.07] bg-black/40 px-5 pt-6 pb-4"
        style={{ "--card-hover-scale": 1 + local / 100 } as CSSProperties}
      >
        {TONES.map((tone, index) => (
          <div key={tone} className="poster-card w-16 sm:w-20">
            <div className="poster-frame relative aspect-[2/3] overflow-hidden rounded-md border border-white/10">
              <div className={cn("poster-artwork absolute inset-0", tone)} />
            </div>
            <p className="poster-title mt-2 truncate text-xs font-medium">Hover me {index + 1}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
