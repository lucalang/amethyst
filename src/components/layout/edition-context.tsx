"use client";

import { createContext, use, useMemo, type ReactNode } from "react";
import { collectionPath, entryPath } from "@/lib/collections";
import { SLIM_BASE, type Edition } from "@/lib/edition";

const EditionContext = createContext<Edition>("full");

/** Marks a subtree as one edition, so shared archive components link within it. Full is the default. */
export function EditionProvider({ edition, children }: { edition: Edition; children: ReactNode }) {
  return <EditionContext value={edition}>{children}</EditionContext>;
}

export const useEdition = () => use(EditionContext);

/** Entry and collection addresses in the current edition. */
export function useArchivePaths() {
  const edition = useEdition();
  return useMemo(() => {
    const base = edition === "slim" ? SLIM_BASE : "";
    return {
      edition,
      base,
      home: edition === "slim" ? SLIM_BASE : "/",
      entry: (entry: { id: string; slug?: string | null }) => `${base}${entryPath(entry)}`,
      collection: (collection: { id: string; slug?: string | null }) => `${base}${collectionPath(collection)}`,
    };
  }, [edition]);
}
