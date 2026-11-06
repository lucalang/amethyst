"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export type StatsSnapshot = { date: string; values: Record<string, unknown> };
export type HistoryPoint = { date: string; value: number; total?: number; source?: "records" | "snapshot" | "git" };
const HistoryContext = createContext<{ history: StatsSnapshot[]; reconstructed: StatsSnapshot[] }>({ history: [], reconstructed: [] });
const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const formatDate = (date: string) => dateFormat.format(new Date(date));
const formatValue = (point: HistoryPoint, percent: boolean) => point.total !== undefined
  ? `${numberFormat.format(point.value)} / ${numberFormat.format(point.total)}`
  : `${numberFormat.format(point.value)}${percent ? "%" : ""}`;
const sourceLabel = (source: HistoryPoint["source"]) => source === "records" ? "Retained records" : source === "git" ? "Git" : "Snapshot";

export function StatsHistoryProvider({ history, reconstructed = [], children }: { history: StatsSnapshot[]; reconstructed?: StatsSnapshot[]; children: ReactNode }) {
  return <HistoryContext.Provider value={{ history, reconstructed }}>{children}</HistoryContext.Provider>;
}

function EvolutionGraph({ points, label, percent = false, previousPoint }: { points: HistoryPoint[]; label: string; percent?: boolean; previousPoint?: HistoryPoint }) {
  const [active, setActive] = useState<number | null>(null);
  const readoutId = useId();
  if (!points.length) return <p className="py-5 text-xs text-muted-foreground">No observations yet.</p>;
  const first = Date.parse(points[0].date);
  const last = Date.parse(points[points.length - 1].date);
  const low = Math.min(...points.map((point) => point.value));
  const high = Math.max(...points.map((point) => point.value));
  const coordinates = points.map((point) => ({
    x: last === first ? 50 : 5 + (Date.parse(point.date) - first) / (last - first) * 90,
    y: high === low ? 50 : 85 - (point.value - low) / (high - low) * 70,
  }));
  const markers = points.flatMap((point, index) => {
    const previous = index > 0 ? points[index - 1] : previousPoint;
    const changed = previous ? point.value !== previous.value || point.total !== previous.total : point.value !== 0 || (point.total ?? 0) !== 0;
    return changed ? [{ point, index }] : [];
  });
  const selected = points[active ?? points.length - 1];
  return (
    <div className="min-w-0">
      <div className="relative mt-3 h-32 w-full text-amethyst">
        <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[15, 50, 85].map((position) => <line key={position} x1="5" x2="95" y1={position} y2={position} stroke="currentColor" opacity="0.12" vectorEffect="non-scaling-stroke" />)}
          {coordinates.slice(1).map((point, index) => <line key={points[index + 1].date} x1={coordinates[index].x} y1={coordinates[index].y} x2={point.x} y2={point.y} stroke="currentColor" strokeWidth="2" strokeDasharray={Date.parse(points[index + 1].date) - Date.parse(points[index].date) > 86400000 || points[index + 1].source !== points[index].source ? "4 4" : undefined} vectorEffect="non-scaling-stroke" />)}
        </svg>
        {markers.map(({ point, index }, markerIndex) => (
          <button key={point.date} type="button" className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amethyst focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={{ left: `${coordinates[index].x}%`, top: `${coordinates[index].y}%` }}
            aria-label={`${label}: ${formatDate(point.date)}, ${formatValue(point, percent)}, ${sourceLabel(point.source)}`} aria-describedby={readoutId}
            onPointerEnter={() => setActive(index)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)} onClick={() => setActive(index)}
            onKeyDown={(event) => {
              const next = event.key === "ArrowRight" ? markerIndex + 1 : event.key === "ArrowLeft" ? markerIndex - 1 : event.key === "Home" ? 0 : event.key === "End" ? markers.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              const buttons = event.currentTarget.parentElement?.querySelectorAll("button");
              buttons?.[Math.max(0, Math.min(markers.length - 1, next))]?.focus();
            }}>
            <span className={`size-2 rounded-full bg-current ${active === index ? "ring-4 ring-amethyst/20" : ""}`} />
          </button>
        ))}
      </div>
      <div aria-hidden="true" className="flex justify-between gap-3 text-[10px] text-muted-foreground"><span>{formatDate(points[0].date)}</span><span>{points.length > 1 ? formatDate(points[points.length - 1].date) : ""}</span></div>
      <p id={readoutId} aria-live="polite" className="mt-2 min-h-8 text-xs text-muted-foreground">{formatDate(selected.date)} · <strong className="text-foreground tabular-nums">{formatValue(selected, percent)}</strong><span className="block text-[10px]">{sourceLabel(selected.source)}</span></p>
      {points.length === 1 ? <p className="text-xs text-muted-foreground">One recorded date. A trend needs at least two.</p> : null}
    </div>
  );
}

export function StatHistory({ label, keys, totalKey, percent = false, points: supplied }: { label: string; keys: string[]; totalKey?: string; percent?: boolean; points?: HistoryPoint[] }) {
  const { history, reconstructed } = useContext(HistoryContext);
  const extract = (snapshots: StatsSnapshot[], source: HistoryPoint["source"]) => snapshots.flatMap((snapshot) => {
    if (keys.some((key) => typeof snapshot.values[key] !== "number")) return [];
    const value = keys.reduce((sum, key) => sum + Number(snapshot.values[key]), 0);
    const total = totalKey ? snapshot.values[totalKey] : undefined;
    if (totalKey && typeof total !== "number") return [];
    if (percent && !total) return [];
    return [{ date: snapshot.date, value: percent ? value / Number(total) * 100 : value, source, ...(!percent && typeof total === "number" ? { total } : {}) }];
  });
  const observed = extract(history, "snapshot");
  const firstObservedDate = observed[0]?.date;
  const older = extract(reconstructed, "records").filter((point) => !firstObservedDate || point.date < firstObservedDate);
  const points = supplied ? supplied.map((point) => ({ ...point, source: "git" as const })) : [...older, ...observed].sort((left, right) => left.date.localeCompare(right.date));
  const hasReconstructed = !supplied && older.length > 0;
  return (
    <div className="mt-auto pt-2">
      <EvolutionGraph points={points.slice(-30)} label={label} percent={percent} previousPoint={points.length > 30 ? points[points.length - 31] : undefined} />
      <Dialog>
        <DialogTrigger asChild><Button variant="ghost" size="sm" className="mt-2" aria-label={`View more: ${label}`}><ArrowUpRight aria-hidden="true" className="size-3.5" />View more</Button></DialogTrigger>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{supplied ? "Source totals at the last recorded commit on each UTC date." : hasReconstructed ? "Older totals are reconstructed from retained dated records, not exact past live totals. Deleted records/accounts and earlier status changes cannot be recovered. Later snapshots are observed totals. Dates are UTC; dashed lines mark gaps or source changes." : "Latest observed totals on each recorded UTC date. Missing dates are not filled in; dashed lines span gaps."}</DialogDescription></DialogHeader>
          <EvolutionGraph points={points} label={label} percent={percent} />
          {points.length ? <div className="max-h-64 overflow-y-auto"><table className="w-full text-left text-xs"><caption className="sr-only">{label} history</caption><thead><tr><th scope="col" className="py-2">Date (UTC)</th><th scope="col" className="px-2 py-2">Source</th><th scope="col" className="py-2 text-right">Value{percent ? " (%)" : ""}</th></tr></thead><tbody>{points.toReversed().map((point) => <tr key={point.date} className="border-t border-foreground/10"><th scope="row" className="py-2 font-normal"><time dateTime={point.date}>{formatDate(point.date)}</time></th><td className="px-2 py-2 text-muted-foreground">{sourceLabel(point.source)}</td><td className="py-2 text-right tabular-nums">{formatValue(point, percent)}</td></tr>)}</tbody></table></div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}