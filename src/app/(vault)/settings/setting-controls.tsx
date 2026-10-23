"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import type { Settings, SettingsPatch } from "@/lib/preferences";
import { cn } from "@/lib/utils";

// Saves run one after another so a slow request can never overwrite a newer value.
let queue: Promise<unknown> = Promise.resolve();

/** Returns a function that saves a settings patch and refreshes server-rendered UI. Resolves false on failure. */
export function useSaveSettings() {
  const router = useRouter();
  return (patch: SettingsPatch): Promise<boolean> => {
    const run = queue.then(async () => {
      try {
        await apiFetch("/api/preferences", { method: "PATCH", json: { settings: patch } });
        router.refresh();
        return true;
      } catch (error) {
        toast.error(`Couldn’t save that setting: ${errorMessage(error)}`);
        return false;
      }
    });
    queue = run;
    return run;
  };
}

/**
 * Local, immediately-updating state for one setting, saved to the server (debounced by `delay` ms).
 * Follows the server value when it changes elsewhere; reverts if saving fails.
 */
export function useSetting<K extends keyof Settings>(key: K, value: Settings[K], delay = 0) {
  const save = useSaveSettings();
  const [local, setLocal] = useState(value);
  const [shown, setShown] = useState(value);
  if (JSON.stringify(shown) !== JSON.stringify(value)) {
    setShown(value);
    setLocal(value);
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function update(next: Settings[K]) {
    setLocal(next);
    clearTimeout(timer.current);
    const commit = () => {
      void save({ [key]: next } as SettingsPatch).then((ok) => {
        if (!ok) setLocal(value);
      });
    };
    if (delay > 0) timer.current = setTimeout(commit, delay);
    else commit();
  }

  return [local, update] as const;
}

export type Choice<T extends string> = { value: T; title: string; description?: string; preview?: ReactNode };

/** A radio group drawn as selectable cards. */
export function ChoiceCards<T extends string>({
  name,
  labelId,
  value,
  options,
  onChange,
  className,
}: {
  name: string;
  labelId: string;
  value: T;
  options: readonly Choice<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset aria-labelledby={labelId} className={cn("grid gap-3 sm:grid-cols-3", className)}>
      {options.map((option) => {
        const checked = value === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "group/option relative flex cursor-pointer flex-col gap-3 rounded-lg border bg-white/[0.02] p-3.5 transition-[border-color,background-color,box-shadow] duration-200 hover:border-amethyst/40 hover:bg-amethyst/[0.04] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              checked ? "border-amethyst/60 bg-amethyst/[0.07] shadow-[0_0_0_1px_rgb(165_124_255/0.35),0_14px_40px_-22px_rgb(165_124_255/0.8)]" : "border-white/[0.09]",
            )}
          >
            <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onChange(option.value)} className="sr-only" />
            {option.preview ? (
              <span aria-hidden className="flex min-h-16 items-center justify-center overflow-hidden rounded-md bg-black/60 p-3 ring-1 ring-white/[0.05]">
                {option.preview}
              </span>
            ) : null}
            <span className="flex items-start gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                  checked ? "border-amethyst bg-amethyst text-amethyst-foreground" : "border-white/25",
                )}
              >
                {checked ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{option.title}</span>
                {option.description ? <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{option.description}</span> : null}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

type ChoiceKey = { [K in keyof Settings]: Settings[K] extends string ? K : never }[keyof Settings];

/** Choice cards bound directly to one string setting. */
export function ChoiceSetting<K extends ChoiceKey>({
  settingKey,
  value,
  labelId,
  options,
  className,
}: {
  settingKey: K;
  value: Settings[K];
  labelId: string;
  options: readonly Choice<Settings[K] & string>[];
  className?: string;
}) {
  const [local, update] = useSetting(settingKey, value);
  return <ChoiceCards name={settingKey} labelId={labelId} value={local as Settings[K] & string} options={options} onChange={(next) => update(next as Settings[K])} className={className} />;
}

type BooleanKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

export function SwitchSetting({ settingKey, value, labelId, onLabel, offLabel }: { settingKey: BooleanKey; value: boolean; labelId: string; onLabel: string; offLabel: string }) {
  const [local, update] = useSetting(settingKey, value);
  return (
    <div className="flex items-center gap-3">
      <Switch id={`${settingKey}-switch`} aria-labelledby={labelId} checked={local} onCheckedChange={update} />
      <label htmlFor={`${settingKey}-switch`} className="cursor-pointer text-sm text-muted-foreground">
        {local ? onLabel : offLabel}
      </label>
    </div>
  );
}

/** A native range input with a value readout. */
export function RangeInput({
  id,
  labelId,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  marks,
}: {
  id: string;
  labelId: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  marks?: [string, string];
}) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="max-w-md">
      <div className="flex items-center gap-4">
        <input
          id={id}
          type="range"
          aria-labelledby={labelId}
          aria-valuetext={format(value)}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="settings-range h-5 min-w-0 flex-1 cursor-pointer"
          style={{ "--range-fill": `${percent}%` } as CSSProperties}
        />
        <output htmlFor={id} className="w-16 shrink-0 rounded-md border border-white/[0.09] bg-white/[0.03] px-2 py-1 text-center text-sm tabular-nums">
          {format(value)}
        </output>
      </div>
      {marks ? (
        <div className="mt-1 flex justify-between pr-20 text-[11px] text-muted-foreground/70">
          <span>{marks[0]}</span>
          <span>{marks[1]}</span>
        </div>
      ) : null}
    </div>
  );
}
