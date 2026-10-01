"use client";

import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** Circular completion control in the style of Microsoft To Do; hovering previews the tick. */
export function RoundCheck({
  checked,
  onCheckedChange,
  label,
  size = "md",
  celebrate,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  size?: "md" | "sm";
  /** Plays the completion pop once; set only right after the user completes the task. */
  celebrate?: boolean;
  className?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      aria-label={label}
      className={cn(
        "group/check relative grid shrink-0 place-items-center rounded-full border-[1.5px] border-white/40 text-amethyst outline-none",
        "transition-[border-color,background-color,box-shadow,scale] duration-200 ease-out after:absolute after:-inset-2.5 after:content-['']",
        "hover:border-amethyst hover:shadow-[0_0_0_4px_rgb(165_124_255/0.14)] active:scale-85",
        "focus-visible:ring-2 focus-visible:ring-amethyst/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        "data-[state=checked]:border-amethyst data-[state=checked]:bg-amethyst data-[state=checked]:text-amethyst-foreground data-[state=checked]:hover:shadow-[0_0_0_4px_rgb(165_124_255/0.2)]",
        size === "md" ? "size-5" : "size-[1.05rem]",
        celebrate && "check-pop",
        className,
      )}
    >
      <Check
        aria-hidden
        strokeWidth={3.2}
        className={cn(
          "opacity-0 transition-[opacity,scale] duration-200 group-hover/check:opacity-70 group-data-[state=checked]/check:opacity-100",
          size === "md" ? "size-3" : "size-2.5",
        )}
      />
    </CheckboxPrimitive.Root>
  );
}
