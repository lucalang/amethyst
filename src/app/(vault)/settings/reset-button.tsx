"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PreferenceKey } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { useResetPreferences } from "./setting-controls";

/** The small accent marker shown beside a setting that differs from its default. */
export function ChangedBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-amethyst/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-amethyst uppercase", className)}>
      <span aria-hidden className="size-1 rounded-full bg-amethyst" />
      Changed
    </span>
  );
}

/** Icon-only reset with a tooltip, used everywhere a preference can go back to its default. */
export function ResetIconButton({
  label,
  defaultLabel,
  onReset,
  disabled,
  className,
}: {
  /** What is reset, e.g. "Animation intensity". */
  label: string;
  /** The default, in words, for the tooltip. */
  defaultLabel?: string;
  onReset: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const tip = defaultLabel ? `Reset to default (${defaultLabel})` : "Reset to default";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          aria-label={`Reset ${label} to default`}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
            className,
          )}
        >
          <RotateCcw className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{tip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * "Changed" marker and reset button for preferences shown on a settings page. Resetting updates
 * the controls at once and is saved like any other change. Nothing renders while the value is
 * already the default.
 */
export function ResetSettingButton({
  keys,
  label,
  changed,
  defaultLabel,
}: {
  keys: readonly PreferenceKey[];
  label: string;
  changed: boolean;
  defaultLabel?: string;
}) {
  const reset = useResetPreferences();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!changed) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <ChangedBadge />
      <ResetIconButton
        label={label}
        defaultLabel={defaultLabel}
        disabled={pending}
        onReset={() =>
          startTransition(async () => {
            await reset(keys);
            startTransition(() => router.refresh());
          })
        }
      />
    </span>
  );
}
