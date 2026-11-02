"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ArrowRight, CalendarDays, Hand, KeyRound, Mountain, Scissors, type LucideIcon } from "lucide-react";
import { CatalogEmpty, CatalogSearch } from "@/components/catalog/catalog-search";
import { catalogMatcher } from "@/lib/catalog-search";
import { LAB_EXPERIMENTS, type LabExperimentId } from "@/lib/lab";

export const LAB_ICONS: Record<LabExperimentId, LucideIcon> = {
  "uphill-volume": Mountain,
  "runaway-button": Hand,
  "cancel-maze": Scissors,
  "awkward-date": CalendarDays,
  "password-gauntlet": KeyRound,
};

export function LabGallery() {
  const [query, setQuery] = useState("");
  const match = catalogMatcher(query);
  const shown = match ? LAB_EXPERIMENTS.filter((item) => match(item.title, item.blurb, ...item.tags)) : LAB_EXPERIMENTS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {LAB_EXPERIMENTS.length} experiments. Every one is a demo: nothing here touches your account, settings or coins.
        </p>
        <CatalogSearch value={query} onChange={setQuery} label="Search experiments" placeholder="Search experiments" />
      </div>
      {shown.length === 0 ? (
        <CatalogEmpty query={query} onReset={() => setQuery("")} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item, index) => {
            const Icon = LAB_ICONS[item.id];
            return (
              <li key={item.id} className="enter" style={{ "--enter-index": index } as CSSProperties}>
                <Link
                  href={`/lab/${item.id}`}
                  className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface/50 p-4 outline-none transition-[border-color,background-color,box-shadow,translate,scale] duration-200 ease-out hover:-translate-y-0.5 hover:border-amethyst/50 hover:bg-surface/75 hover:shadow-[0_16px_38px_-24px_rgb(var(--accent-rgb)/0.65)] focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0 active:scale-[0.985] active:duration-75 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
                >
                  <span className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-xl bg-amethyst/[0.12] text-amethyst transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="lab-demo-tag">Demo</span>
                  </span>
                  <span className="text-base font-semibold transition-colors group-hover:text-amethyst">{item.title}</span>
                  <span className="flex-1 text-sm text-pretty text-muted-foreground">{item.blurb}</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex flex-wrap gap-1">
                      {item.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </span>
                    <ArrowRight aria-hidden className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
