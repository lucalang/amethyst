"use client";

import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, RotateCcw, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { RangeInput, useOnReset, useResetPreferences, useSaveSettings } from "@/app/(vault)/settings/setting-controls";
import { useSettings } from "@/components/layout/settings-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import type { MotionLevel, SettingsPatch } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import {
  BUILTIN_VIEWER_PRESETS,
  DEFAULT_VIEWER_PRESET,
  MAX_PRESET_NAME,
  VIEWER_LIGHTING,
  VIEWER_LIGHTING_INFO,
  VIEWER_RANGES,
  findViewerPreset,
  sameLook,
  type CustomViewerPreset,
  type ViewerLook,
} from "@/lib/viewer-looks";

const VIEWER_KEYS = ["viewerPreset", "viewerTweaks"] as const;
const byName = (a: CustomViewerPreset, b: CustomViewerPreset) => a.name.localeCompare(b.name);

/**
 * The account's 3D Showcase look: the chosen preset, any unsaved adjustments on top of it and the
 * saved presets. Changes show at once; adjustments are saved after a short pause (never per frame).
 */
export function useViewerAppearance(initialPresets: CustomViewerPreset[]) {
  const settings = useSettings();
  const router = useRouter();
  const save = useSaveSettings();
  const resetPreferences = useResetPreferences();

  const [presets, setPresets] = useState(initialPresets);
  const [shownPresets, setShownPresets] = useState(initialPresets);
  if (shownPresets !== initialPresets) {
    setShownPresets(initialPresets);
    setPresets(initialPresets);
  }

  const serverKey = JSON.stringify([settings.viewerPreset, settings.viewerTweaks]);
  const [shown, setShown] = useState(serverKey);
  const [presetId, setPresetId] = useState(settings.viewerPreset);
  const [tweaks, setTweaks] = useState(settings.viewerTweaks);
  if (shown !== serverKey) {
    setShown(serverKey);
    setPresetId(settings.viewerPreset);
    setTweaks(settings.viewerTweaks);
  }

  const active = findViewerPreset(presetId, presets);
  const activeLook = active.look;
  const look = useMemo(() => tweaks ?? activeLook, [tweaks, activeLook]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<SettingsPatch | null>(null);
  function persist(patch: SettingsPatch, delay = 0) {
    clearTimeout(timer.current);
    pending.current = patch;
    const run = () => {
      pending.current = null;
      void save(patch);
    };
    if (delay > 0) timer.current = setTimeout(run, delay);
    else run();
  }
  // Closing the viewer mid-adjustment still saves the last change.
  const flush = useEffectEvent(() => {
    clearTimeout(timer.current);
    if (pending.current) void save(pending.current);
    pending.current = null;
  });
  useEffect(() => () => flush(), []);

  useOnReset(VIEWER_KEYS, () => {
    clearTimeout(timer.current);
    pending.current = null;
    setPresetId(DEFAULT_VIEWER_PRESET);
    setTweaks(null);
  });

  function selectPreset(id: string) {
    setPresetId(id);
    setTweaks(null);
    persist({ viewerPreset: id, viewerTweaks: null });
  }

  function tweak(patch: Partial<ViewerLook>) {
    const next = { ...look, ...patch };
    const value = sameLook(next, activeLook) ? null : next;
    setTweaks(value);
    persist({ viewerTweaks: value }, 400);
  }

  function discard() {
    setTweaks(null);
    persist({ viewerTweaks: null });
  }

  async function saveAsNew(name: string) {
    try {
      const { preset } = await apiFetch<{ preset: CustomViewerPreset }>("/api/viewer-presets", { method: "POST", json: { name, look } });
      setPresets((list) => [...list, preset].sort(byName));
      selectPreset(preset.id);
      toast.success(`Saved “${preset.name}”.`);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  async function updatePreset(id: string, patch: { name?: string; look?: ViewerLook }) {
    try {
      const { preset } = await apiFetch<{ preset: CustomViewerPreset }>(`/api/viewer-presets/${id}`, { method: "PATCH", json: patch });
      setPresets((list) => list.map((item) => (item.id === id ? preset : item)).sort(byName));
      if (patch.look && id === presetId) discard();
      else router.refresh();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  async function deletePreset(id: string) {
    try {
      await apiFetch(`/api/viewer-presets/${id}`, { method: "DELETE" });
      setPresets((list) => list.filter((item) => item.id !== id));
      if (id === presetId) selectPreset(DEFAULT_VIEWER_PRESET);
      else router.refresh();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  async function resetToDefault() {
    clearTimeout(timer.current);
    pending.current = null;
    if (await resetPreferences(VIEWER_KEYS)) router.refresh();
  }

  return {
    look,
    presets,
    active,
    modified: tweaks !== null,
    isDefault: active.id === DEFAULT_VIEWER_PRESET && tweaks === null,
    selectPreset,
    tweak,
    discard,
    saveAsNew,
    updatePreset,
    deletePreset,
    resetToDefault,
  };
}

export type ViewerAppearance = ReturnType<typeof useViewerAppearance>;

/** CSS hooks for the viewer backdrop (see .artwork-viewer in globals.css). */
export function viewerBackdropProps(look: ViewerLook) {
  return {
    "data-backdrop": look.background,
    style: { "--viewer-bg": look.backgroundColor, "--viewer-glow": String(look.glow / 100) } as CSSProperties,
  };
}

const percent = (value: number) => `${value}%`;
const segment = (on: boolean) =>
  cn(
    "min-w-0 flex-1 rounded-[5px] px-2 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
    on ? "bg-amethyst/20 text-foreground shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.45)]" : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
  );

/**
 * Preset choice, live controls and preset management for the 3D Showcase. Used in Settings and,
 * compact, inside the artwork viewer. It never touches the frame, theme or artwork.
 */
export function ViewerCustomizer({ appearance, motion, compact = false }: { appearance: ViewerAppearance; motion: MotionLevel; compact?: boolean }) {
  const id = useId();
  const { look, presets, active, modified, tweak } = appearance;
  const [naming, setNaming] = useState<"new" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const label = (suffix: string) => `${id}-${suffix}`;

  async function submitName() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const ok = naming === "rename" ? await appearance.updatePreset(active.id, { name: trimmed }) : await appearance.saveAsNew(trimmed);
    setBusy(false);
    if (ok) setNaming(null);
  }

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    await action();
    setBusy(false);
  }

  const heading = compact ? "text-xs font-medium text-foreground" : "text-sm font-medium text-foreground";
  const range = (key: keyof typeof VIEWER_RANGES, title: string, format: (value: number) => string, marks?: [string, string]) => (
    <div className="space-y-1.5">
      <p id={label(key)} className={heading}>
        {title}
      </p>
      <RangeInput id={label(`${key}-input`)} labelId={label(key)} value={look[key]} min={VIEWER_RANGES[key].min} max={VIEWER_RANGES[key].max} format={format} onChange={(value) => tweak({ [key]: value })} marks={compact ? undefined : marks} />
    </div>
  );

  return (
    <div className={cn("space-y-5", compact && "space-y-4")}>
      <div className="space-y-2">
        <label htmlFor={label("preset")} className={heading}>
          Preset
        </label>
        <select
          id={label("preset")}
          value={active.id}
          onChange={(event) => {
            setNaming(null);
            setConfirmDelete(false);
            appearance.selectPreset(event.target.value);
          }}
          className="h-9 w-full max-w-md rounded-md border border-white/[0.12] bg-surface px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <optgroup label="Built in">
            {BUILTIN_VIEWER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
                {preset.id === DEFAULT_VIEWER_PRESET ? " (default)" : ""}
              </option>
            ))}
          </optgroup>
          {presets.length ? (
            <optgroup label="Your presets">
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <p className="text-xs text-muted-foreground">
          {active.builtin ? BUILTIN_VIEWER_PRESETS.find((preset) => preset.id === active.id)?.description : "One of your saved presets."}
          {modified ? <span className="text-amethyst"> · Adjusted</span> : null}
        </p>

        {modified || !active.builtin ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {modified && !active.builtin ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => appearance.updatePreset(active.id, { look }))}>
                <Save aria-hidden /> Update “{active.name}”
              </Button>
            ) : null}
            {modified ? (
              <>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setName(""); setNaming("new"); }}>
                  <Save aria-hidden /> Save as new
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={appearance.discard}>
                  <X aria-hidden /> Discard
                </Button>
              </>
            ) : null}
            {!active.builtin ? (
              <>
                <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setName(active.name); setNaming("rename"); }}>
                  <Pencil aria-hidden /> Rename
                </Button>
                {confirmDelete ? (
                  <Button type="button" size="sm" variant="ghost" disabled={busy} className="text-rose hover:text-rose" onClick={() => run(() => appearance.deletePreset(active.id)).then(() => setConfirmDelete(false))}>
                    <Trash2 aria-hidden /> Confirm delete
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="ghost" disabled={busy} className="text-muted-foreground hover:text-rose" onClick={() => setConfirmDelete(true)}>
                    <Trash2 aria-hidden /> Delete
                  </Button>
                )}
              </>
            ) : null}
          </div>
        ) : null}

        {naming ? (
          <form
            className="flex max-w-md items-center gap-1.5 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              void submitName();
            }}
          >
            <Input
              autoFocus
              aria-label={naming === "rename" ? "New preset name" : "Preset name"}
              placeholder="Preset name"
              value={name}
              maxLength={MAX_PRESET_NAME}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setNaming(null);
                }
              }}
              className="h-8 min-w-0 flex-1"
            />
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              <Check aria-hidden /> {naming === "rename" ? "Rename" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(null)} aria-label="Cancel">
              <X aria-hidden />
            </Button>
          </form>
        ) : null}
      </div>

      <div className="space-y-2">
        <p id={label("background")} className={heading}>
          Background
        </p>
        <div className="flex max-w-md flex-wrap items-center gap-2">
          <div role="group" aria-labelledby={label("background")} className="flex flex-1 rounded-md border border-white/[0.1] bg-white/[0.02] p-0.5">
            <button type="button" aria-pressed={look.background === "theme"} className={segment(look.background === "theme")} onClick={() => tweak({ background: "theme" })}>
              Theme
            </button>
            <button type="button" aria-pressed={look.background === "color"} className={segment(look.background === "color")} onClick={() => tweak({ background: "color" })}>
              Solid color
            </button>
          </div>
          {look.background === "color" ? (
            <input
              type="color"
              aria-label="Background color"
              value={look.backgroundColor}
              onChange={(event) => tweak({ backgroundColor: event.target.value.toLowerCase() })}
              className="h-8 w-12 cursor-pointer rounded-md border border-white/[0.12] bg-transparent p-0.5"
            />
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <p id={label("lighting")} className={heading}>
          Lighting
        </p>
        <div role="group" aria-labelledby={label("lighting")} className="grid max-w-md grid-cols-2 gap-0.5 rounded-md border border-white/[0.1] bg-white/[0.02] p-0.5 sm:grid-cols-4">
          {VIEWER_LIGHTING.map((style) => (
            <button key={style} type="button" aria-pressed={look.lighting === style} title={VIEWER_LIGHTING_INFO[style].description} className={segment(look.lighting === style)} onClick={() => tweak({ lighting: style })}>
              {VIEWER_LIGHTING_INFO[style].name}
            </button>
          ))}
        </div>
      </div>

      {range("lightIntensity", "Light intensity", percent, ["Dim", "Bright"])}
      {range("reflections", "Reflections", percent, ["Matte", "Glossy"])}
      {range("glow", "Glow and effects", percent, ["None", "Intense"])}
      {range("hoverSpeed", "Hover responsiveness", percent, ["Lazy", "Instant"])}
      {range("hoverTilt", "Maximum hover tilt", (value) => `${value}°`, ["Flat", "Steep"])}

      <div className="flex items-center gap-3">
        <Switch id={label("idle")} checked={look.idleMotion} onCheckedChange={(checked) => tweak({ idleMotion: checked })} />
        <label htmlFor={label("idle")} className={cn("cursor-pointer", heading)}>
          Idle motion <span className="font-normal text-muted-foreground">· a slow sway while you’re not touching the card</span>
        </label>
      </div>

      {motion !== "subtle" && motion !== "full" ? (
        <p className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs leading-5 text-muted-foreground">
          Animations are off (in Appearance settings or by your system’s reduced-motion setting), so hover tilt and idle motion stay still. Lighting, reflections and glow still apply.
        </p>
      ) : null}

      <Button type="button" variant="ghost" size="sm" disabled={appearance.isDefault || busy} onClick={() => void appearance.resetToDefault()} className="text-muted-foreground">
        <RotateCcw aria-hidden /> Reset to default (Classic)
      </Button>
    </div>
  );
}
