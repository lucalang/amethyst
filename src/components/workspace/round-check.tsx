"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** Circular completion toggle in the style of Microsoft To Do. */
export function RoundCheck({
  checked,
  onCheckedChange,
  label,
  size = "md",
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  size?: "md" | "sm";
  className?: string;
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      aria-label={label}
      className={cn(
        "shrink-0 rounded-full border-[1.5px] border-muted-foreground/55 bg-transparent transition-[background-color,border-color,box-shadow] duration-150 hover:border-amethyst hover:bg-amethyst/10 dark:bg-transparent data-checked:border-amethyst data-checked:bg-amethyst data-checked:text-primary-foreground dark:data-checked:bg-amethyst",
        size === "md" ? "size-5 [&_svg]:size-3!" : "size-4 [&_svg]:size-2.5!",
        className,
      )}
    />
  );
}
