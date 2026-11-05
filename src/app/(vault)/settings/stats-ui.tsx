import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const fmt = (value: number) => value.toLocaleString("en");
export const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function Stat({ icon: Icon, label, value, definition, className, children }: { icon: LucideIcon; label: string; value: number | string; definition: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-xl border border-white/[0.08] bg-surface/40 p-4 md:p-5", className)}>
      <dt className="flex items-center gap-2 text-sm font-medium text-foreground/85">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-amethyst/[0.12] ring-1 ring-amethyst/25">
          <Icon className="size-3.5 text-amethyst" />
        </span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="contents">
        <span className="mt-3 truncate text-3xl leading-none font-semibold tracking-tight tabular-nums">{typeof value === "number" ? fmt(value) : value}</span>
        {children}
        <span className="mt-2 text-xs leading-5 text-muted-foreground">{definition}</span>
      </dd>
    </div>
  );
}

export function Group({ id, title, meta, wide = false, children }: { id: string; title: string; meta?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="enter enter-soft border-t border-white/[0.08] py-7 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-heading`} className="text-base font-semibold">{title}</h2>
        {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      <dl className={cn("grid gap-3 sm:grid-cols-2", wide && "xl:grid-cols-3")}>{children}</dl>
    </section>
  );
}

/** Proportional bar; transparent parts leave the track visible. */
export function Bar({ parts, label, className }: { parts: { value: number; className: string }[]; label: string; className?: string }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <span role="img" aria-label={label} className={cn("mt-3 flex h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]", className)}>
      {total > 0 ? parts.map((part, index) => (part.value ? <span key={index} className={part.className} style={{ width: `${(part.value / total) * 100}%` }} /> : null)) : null}
    </span>
  );
}
