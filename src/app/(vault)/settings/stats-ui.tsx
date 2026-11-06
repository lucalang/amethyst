import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatHistory, type HistoryPoint } from "./stats-history";

export const fmt = (value: number) => value.toLocaleString("en");
export const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function Stat({ icon: Icon, label, value, definition, className, children, historyKey, totalKey, percent, history }: { icon: LucideIcon; label: string; value: number | string; definition: ReactNode; className?: string; children?: ReactNode; historyKey?: string | string[]; totalKey?: string; percent?: boolean; history?: HistoryPoint[] }) {
  return (
    <div className={cn("ui-panel flex min-w-0 flex-col p-4 md:p-5", className)} data-glow>
      <dt className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <span aria-hidden className="ui-icon">
          <Icon className="size-4" />
        </span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="contents">
        <span className="mt-3.5 truncate text-3xl leading-none font-bold tracking-tight text-foreground tabular-nums">{typeof value === "number" ? fmt(value) : value}</span>
        {children}
        <span className="mt-2 text-xs leading-5 text-muted-foreground">{definition}</span>
        {historyKey ? <StatHistory label={label} keys={typeof historyKey === "string" ? [historyKey] : historyKey} totalKey={totalKey} percent={percent} points={history} /> : null}
      </dd>
    </div>
  );
}

export function StatsLoading() {
  return <div role="status" aria-label="Loading stats and history" className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((index) => <div key={index} className="h-72 animate-pulse rounded-2xl border border-border bg-surface/40 motion-reduce:animate-none" />)}<span className="sr-only">Loading stats and history...</span></div>;
}

export function Group({ id, title, meta, wide = false, children }: { id: string; title: string; meta?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="enter enter-soft mb-9 last-of-type:mb-7">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-heading`} className="flex items-center gap-2 text-base font-semibold">
          <span aria-hidden className="ui-dot" />
          {title}
        </h2>
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
    <span role="img" aria-label={label} className={cn("mt-3.5 flex h-2 overflow-hidden rounded-full bg-foreground/[0.07] ring-1 ring-border", className)}>
      {total > 0 ? parts.map((part, index) => (part.value ? <span key={index} className={part.className} style={{ width: `${(part.value / total) * 100}%` }} /> : null)) : null}
    </span>
  );
}
