"use client";

import { useEffect, useRef, useState } from "react";
import { RectangleVertical, Square } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import type { CoverShape } from "@/lib/cover-shape";
import { ImageUrlField } from "./image-url-field";

export function CoverArtworkField({
  id,
  defaultShape,
  defaultValue,
  error,
  useRememberedDefault = false,
  onBusyChange,
}: {
  id: string;
  defaultShape: CoverShape;
  defaultValue?: string | null;
  error?: string;
  useRememberedDefault?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [shape, setShape] = useState(defaultShape);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(useRememberedDefault);
  const changed = useRef(false);

  useEffect(() => {
    onBusyChange?.(loading || saving);
  }, [loading, saving, onBusyChange]);

  useEffect(() => {
    if (!useRememberedDefault) return;
    let active = true;
    void apiFetch<{ coverShape: CoverShape }>("/api/preferences/cover-shape", { cache: "no-store" })
      .then(({ coverShape }) => {
        if (active && !changed.current) setShape(coverShape);
      })
      .catch(() => {
        if (active) toast.error("Could not load your remembered cover shape.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [useRememberedDefault]);

  async function selectShape(next: CoverShape) {
    if (next === shape) return;
    changed.current = true;
    setShape(next);
    setSaving(true);
    try {
      await apiFetch("/api/preferences/cover-shape", { method: "PUT", json: { coverShape: next }, keepalive: true });
    } catch {
      toast.error("Could not remember your cover shape. Your entry can still save this shape.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="coverShape" value={shape} />
      <fieldset disabled={saving || loading} aria-busy={saving || loading} className="space-y-1.5">
        <legend className="mb-1.5 text-sm font-medium">Cover shape</legend>
        <div className="inline-flex gap-1 rounded-md border border-border bg-black/40 p-1">
          {(["square", "portrait"] as const).map((option) => {
            const Icon = option === "square" ? Square : RectangleVertical;
            return (
              <label key={option} className="relative cursor-pointer">
                <input
                  type="radio"
                  name={`${id}-shape`}
                  value={option}
                  checked={shape === option}
                  onChange={() => void selectShape(option)}
                  className="peer sr-only"
                />
                <span className="flex h-9 items-center gap-2 rounded-sm px-3 text-sm text-muted-foreground transition-colors peer-checked:bg-amethyst/20 peer-checked:text-amethyst peer-checked:ring-1 peer-checked:ring-amethyst/50 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-wait">
                  <Icon aria-hidden className="size-4" />
                  {option === "square" ? "Square" : "Portrait"}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <ImageUrlField
        id={id}
        name="coverUrl"
        label="Cover image URL"
        hint="Optional. A direct link to an image on any public website."
        defaultValue={defaultValue}
        error={error}
        shape={shape === "square" ? "square" : "poster"}
      />
    </div>
  );
}