"use client";

import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** Full-width, touch-friendly checklist row. The whole row toggles the box. */
export function CheckRow({
  id,
  checked,
  onChange,
  label,
  prefix,
  meta,
  disabled,
  className,
}: {
  id: string;
  checked: boolean | "indeterminate";
  onChange: (checked: boolean) => void;
  label: ReactNode;
  prefix?: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const state = checked;
  return (
    <div
      className={cn(
        "group flex min-h-11 items-center gap-3 rounded-md px-2 transition-colors hover:bg-secondary/60 md:min-h-9 pointer-coarse:min-h-11",
        state === true && "text-muted-foreground",
        className,
      )}
    >
      <Checkbox
        id={id}
        checked={state}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
        className="size-5 data-[state=checked]:border-jade data-[state=checked]:bg-jade data-[state=indeterminate]:border-jade data-[state=indeterminate]:bg-jade/30"
      />
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-sm md:py-1.5">
        {prefix ? <span className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums">{prefix}</span> : null}
        <span className={cn("min-w-0 flex-1 truncate", state === true && "line-through decoration-muted-foreground/40")}>{label}</span>
        {meta ? <span className="flex shrink-0 items-center gap-1.5">{meta}</span> : null}
      </label>
    </div>
  );
}
