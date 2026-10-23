"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MoreHorizontal, Pin } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import type { PinStyle } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const OPTIONS: { value: PinStyle; title: string; description: string }[] = [
  { value: "current", title: "On the artwork", description: "Pin badge and progress shown on the artwork." },
  { value: "clean", title: "Clean covers", description: "Artwork stays clear; title, progress and a pin menu sit below." },
];

function MiniPoster({ variant, tone, pinned }: { variant: PinStyle; tone: string; pinned?: boolean }) {
  return (
    <div className="w-12 shrink-0 sm:w-14">
      <div className={cn("relative aspect-[2/3] overflow-hidden rounded-[5px] ring-1 ring-white/10", tone)}>
        <span className="absolute inset-x-2 top-[38%] h-[22%] rounded-full bg-white/15 blur-[6px]" />
        {variant === "current" ? (
          <>
            <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
            {pinned ? (
              <span className="absolute top-1 left-1 grid size-3.5 place-items-center rounded-[3px] bg-amethyst text-amethyst-foreground">
                <Pin className="size-2 fill-current" />
              </span>
            ) : null}
            <span className="absolute inset-x-1 bottom-1 h-[3px] overflow-hidden rounded-full bg-white/20">
              <span className="block h-full w-3/5 rounded-full bg-amethyst" />
            </span>
          </>
        ) : null}
      </div>
      <span className="mt-1.5 block h-1.5 w-4/5 rounded-full bg-white/50" />
      <span className="mt-1 flex items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-0.5">
          {variant === "clean" && pinned ? <Pin className="size-2 shrink-0 fill-current text-amethyst" /> : null}
          <span className="block h-1 w-6 rounded-full bg-white/20" />
        </span>
        {variant === "clean" ? <MoreHorizontal className="size-2.5 text-white/45" /> : null}
      </span>
    </div>
  );
}

/** Chooses how pinned entries and progress appear on cover artwork. Saves immediately. */
export function PinStyleSetting({ value, labelId }: { value: PinStyle; labelId: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState(value);
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setSelected(value);
  }

  async function choose(next: PinStyle) {
    if (next === selected || saving) return;
    const previous = selected;
    setSelected(next);
    setSaving(true);
    try {
      await apiFetch("/api/preferences", { method: "PATCH", json: { pinStyle: next } });
      toast.success(next === "clean" ? "Clean covers on" : "Details on the artwork");
      router.refresh();
    } catch (error) {
      setSelected(previous);
      toast.error(`Couldn’t save the cover details: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset aria-labelledby={labelId} aria-busy={saving} className="grid gap-3 sm:grid-cols-2">
      {OPTIONS.map((option) => {
        const checked = selected === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "group/option relative flex cursor-pointer flex-col gap-4 rounded-lg border bg-white/[0.02] p-4 transition-[border-color,background-color,box-shadow] duration-200 hover:border-amethyst/40 hover:bg-amethyst/[0.04] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              checked ? "border-amethyst/60 bg-amethyst/[0.07] shadow-[0_0_0_1px_rgb(165_124_255/0.35),0_14px_40px_-22px_rgb(165_124_255/0.8)]" : "border-white/[0.09]",
            )}
          >
            <input
              type="radio"
              name="pin-style"
              value={option.value}
              checked={checked}
              onChange={() => void choose(option.value)}
              className="sr-only"
            />
            <span aria-hidden className="flex items-end gap-2.5 rounded-md bg-black/60 px-3 pt-3 pb-2.5 ring-1 ring-white/[0.05]">
              <MiniPoster variant={option.value} pinned tone="bg-[linear-gradient(160deg,#6d4bb8,#2a1747_60%,#120a1f)]" />
              <MiniPoster variant={option.value} tone="bg-[linear-gradient(160deg,#a14f7f,#3b1830_60%,#140812)]" />
              <MiniPoster variant={option.value} pinned tone="bg-[linear-gradient(160deg,#4f6bb8,#1a2547_60%,#0a0f1f)]" />
            </span>
            <span className="flex items-start gap-3">
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
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{option.description}</span>
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
