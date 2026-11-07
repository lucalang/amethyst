"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ArrowRight, CalendarDays, Hand, KeyRound, Mountain, Scissors, Search, type LucideIcon } from "lucide-react";
import { catalogMatcher } from "@/lib/catalog-search";
import { LAB_EXPERIMENTS, type LabExperimentId } from "@/lib/lab";

export const LAB_ICONS: Record<LabExperimentId, LucideIcon> = {
  "uphill-volume": Mountain,
  "runaway-button": Hand,
  "cancel-maze": Scissors,
  "awkward-date": CalendarDays,
  "password-gauntlet": KeyRound,
};

export const labNumber = (id: LabExperimentId) => String(LAB_EXPERIMENTS.findIndex((item) => item.id === id) + 1).padStart(2, "0");

export function LabGallery() {
  const [query, setQuery] = useState("");
  const match = catalogMatcher(query);
  const shown = match ? LAB_EXPERIMENTS.filter((item) => match(item.title, item.blurb, ...item.tags)) : LAB_EXPERIMENTS;

  return (
    <>
      <div className="lab-head">
        <div>
          <h1 className="lab-title">Experiments</h1>
          <p className="lab-lede">Ridiculous interface experiments, safely contained. Poke at them, reset them, walk away whenever you like. Nothing here touches your account, settings or coins.</p>
        </div>
        <div className="lab-search" role="search">
          <Search aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search experiments"
            placeholder={`Search ${LAB_EXPERIMENTS.length} experiments`}
            className="lab-input"
          />
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {query ? `${shown.length} of ${LAB_EXPERIMENTS.length} experiments shown` : ""}
      </p>
      {shown.length === 0 ? (
        <div className="lab-empty">
          <p className="font-semibold">No experiments match “{query.trim()}”</p>
          <p className="lab-muted text-sm">Try a title or a tag like “button” or “forms”.</p>
          <button type="button" onClick={() => setQuery("")} className="lab-btn">
            Clear search
          </button>
        </div>
      ) : (
        <ul className="lab-grid">
          {shown.map((item, index) => {
            const Icon = LAB_ICONS[item.id];
            return (
              <li key={item.id} className="lab-enter" style={{ "--i": index } as CSSProperties}>
                <Link href={`/lab/${item.id}`} className="lab-card">
                  <span className="lab-card-art">
                    <span aria-hidden className="lab-card-num">
                      {labNumber(item.id)}
                    </span>
                    <span aria-hidden className="lab-glyph">
                      <Icon className="size-6" strokeWidth={1.75} />
                    </span>
                  </span>
                  <span className="lab-card-body">
                    <span className="lab-card-title">{item.title}</span>
                    <span className="lab-card-blurb">{item.blurb}</span>
                    <span className="lab-card-foot">
                      <span className="flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <span key={tag} className="lab-tag">
                            {tag}
                          </span>
                        ))}
                      </span>
                      <span aria-hidden className="lab-card-go">
                        Open
                        <ArrowRight className="size-3.5" />
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
