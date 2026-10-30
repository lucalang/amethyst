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
                  className="group flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface/50 p-4 outline-none transition-colors hover:border-amethyst/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center justify-between">
                    <span className="grid size-10 place-items-center rounded-xl bg-amethyst/[0.12] text-amethyst">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <span className="lab-demo-tag">Demo</span>
                  </span>
                  <span className="text-base font-semibold">{item.title}</span>
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
