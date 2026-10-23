"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { LibraryCategory } from "@/lib/collections";

type EntryCollection = { id: string | null; set: (id: string | null) => void };

const EntryCollectionContext = createContext<EntryCollection>({ id: null, set: () => {} });

/** Lets entry pages (/entries/<slug>) tell the navigation which collection they belong to. */
export function CurrentCollectionProvider({ children }: { children: ReactNode }) {
  const [id, set] = useState<string | null>(null);
  const value = useMemo(() => ({ id, set }), [id]);
  return <EntryCollectionContext value={value}>{children}</EntryCollectionContext>;
}

/** Rendered by the entry page with the entry's current collection. */
export function EntryCollectionMarker({ id }: { id: string }) {
  const { set } = useContext(EntryCollectionContext);
  useEffect(() => {
    set(id);
    return () => set(null);
  }, [id, set]);
  return null;
}

/** The collection being viewed, or the open entry's collection; null elsewhere. */
export function useCurrentCollectionId(collections: LibraryCategory[]): string | null {
  const pathname = usePathname();
  const { id } = useContext(EntryCollectionContext);
  const [, section, segment] = pathname.split("/");
  if (section === "collections" && segment) {
    const param = decodeURIComponent(segment);
    return collections.find((collection) => collection.slug === param || collection.id === param)?.id ?? null;
  }
  return section === "entries" ? id : null;
}
