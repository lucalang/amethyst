"use client";

import { useRef } from "react";
import { playSound } from "@/components/arcade/sound";
import { useSettings } from "@/components/layout/settings-context";
import { SFX_VOLUME_RANGE } from "@/lib/preferences";
import { setSfxVolume } from "@/lib/sfx-volume";
import { RangeInput, useSetting } from "./setting-controls";

/** Loudness of every sound effect, with a short preview tick while dragging. */
export function SfxVolumeSetting({ value, labelId }: { value: number; labelId: string }) {
  const { arcadeSound } = useSettings();
  const [local, update] = useSetting("sfxVolume", value, 400);
  const lastPreview = useRef(0);

  function change(next: number) {
    update(next);
    setSfxVolume(next);
    const now = performance.now();
    if (arcadeSound && now - lastPreview.current > 150) {
      lastPreview.current = now;
      playSound("check");
    }
  }

  return (
    <RangeInput
      id="sfx-volume"
      labelId={labelId}
      value={local}
      min={SFX_VOLUME_RANGE.min}
      max={SFX_VOLUME_RANGE.max}
      step={SFX_VOLUME_RANGE.step}
      format={(volume) => (volume === 0 ? "Muted" : `${volume}%`)}
      onChange={change}
      marks={["Quiet", "Loud"]}
    />
  );
}
