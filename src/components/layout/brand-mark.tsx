import { Gem } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span aria-hidden className="brand-gem grid size-7 place-items-center rounded-md bg-amethyst/15 text-amethyst ring-1 ring-amethyst/40">
        <Gem className="size-4" />
      </span>
      <span>Amethyst</span>
    </span>
  );
}
