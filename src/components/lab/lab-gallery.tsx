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
      <div className="enter flex flex-wrap items-center justify-between gap-3" style={{ "--enter-index": 1 } as CSSProperties}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="ui-pill" data-tone>
            <span aria-hidden className="ui-dot" />
            {LAB_EXPERIMENTS.length} experiments
          </span>
          Every one is a demo: nothing here touches your account, settings or coins.
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
              <li key={item.id} className="enter enter-card" style={{ "--enter-index": index } as CSSProperties}>
                <Link href={`/lab/${item.id}`} className="ui-card group flex h-full flex-col">
                  <span className="ui-stage h-24 border-b border-border">
                    <span aria-hidden className="ui-hero-icon">
                      <Icon className="size-6" />
                    </span>
                    <span className="lab-demo-tag absolute top-3 right-3">Demo</span>
                  </span>
                  <span className="flex flex-1 flex-col gap-2 p-4">
                    <span className="text-base font-semibold transition-colors group-hover:text-(--tone)">{item.title}</span>
                    <span className="flex-1 text-sm text-pretty text-muted-foreground">{item.blurb}</span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <span key={tag} className="ui-pill">
                            {tag}
                          </span>
                        ))}
                      </span>
                      <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-[color,translate] group-hover:translate-x-0.5 group-hover:text-(--tone) motion-reduce:transition-none" />
                    </span>
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
