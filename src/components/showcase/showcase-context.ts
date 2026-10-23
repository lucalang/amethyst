"use client";

import { createContext, use } from "react";
import type { CoverShape } from "@/lib/cover-shape";

export type ArtworkItem = { id: string; title: string; coverUrl: string; coverShape: CoverShape };

export type ShowcaseApi = {
  /** Entries in the current results that have artwork. */
  count: number;
  openShowcase: (opener?: HTMLElement | null) => void;
  viewArtwork: (entryId: string, opener?: HTMLElement | null) => void;
};

export const ShowcaseContext = createContext<ShowcaseApi | null>(null);

/** Showcase and artwork-viewer actions for the open collection; null outside a collection page. */
export function useShowcase(): ShowcaseApi | null {
  return use(ShowcaseContext);
}
