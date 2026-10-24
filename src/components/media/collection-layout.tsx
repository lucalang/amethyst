"use client";

import { createContext, use, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Table2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import { COLLECTION_LAYOUT_IDS, COLLECTION_LAYOUTS, readCollectionLayout, type CollectionLayout } from "@/lib/collection-layouts";
import { cn } from "@/lib/utils";

const ICONS: Record<CollectionLayout, LucideIcon> = { gallery: LayoutGrid, list: List, table: Table2 };

type LayoutState = { layout: CollectionLayout; setLayout: (next: CollectionLayout) => void };

const LayoutContext = createContext<LayoutState | null>(null);

/** The collection's chosen layout, shown at once and saved for this collection only. */
export function CollectionLayoutProvider({ collectionId, initial, children }: { collectionId: string; initial: string | undefined; children: ReactNode }) {
  const router = useRouter();
  const saved = readCollectionLayout(initial);
  const [layout, setLocal] = useState(saved);
  const [shown, setShown] = useState(saved);
  if (shown !== saved) {
    setShown(saved);
    setLocal(saved);
  }
  const request = useRef(0);

  function setLayout(next: CollectionLayout) {
    if (next === layout) return;
    const previous = layout;
    const token = ++request.current;
    setLocal(next);
    apiFetch(`/api/collections/${collectionId}/layout`, { method: "PUT", json: { layout: next } })
      .then(() => {
        if (token === request.current) router.refresh();
      })
      .catch((error) => {
        if (token !== request.current) return;
        setLocal(previous);
        toast.error(`Couldn’t save the layout: ${errorMessage(error)}`);
      });
  }

  return <LayoutContext value={{ layout, setLayout }}>{children}</LayoutContext>;
}

export function useCollectionLayout(): CollectionLayout {
  return use(LayoutContext)?.layout ?? "gallery";
}

/** A compact segmented control beside the filters. */
export function LayoutSwitcher({ className }: { className?: string }) {
  const state = use(LayoutContext);
  if (!state) return null;
  return (
    <div role="radiogroup" aria-label="Layout" className={cn("flex h-10 shrink-0 items-center gap-0.5 rounded-md border border-input bg-white/[0.02] p-1", className)}>
      {COLLECTION_LAYOUT_IDS.map((id) => {
        const Icon = ICONS[id];
        const checked = state.layout === id;
        const { name, description } = COLLECTION_LAYOUTS[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={name}
            title={`${name}: ${description}`}
            tabIndex={checked ? 0 : -1}
            onClick={() => state.setLayout(id)}
            onKeyDown={(event) => {
              const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              const ids = COLLECTION_LAYOUT_IDS;
              const next = ids[(ids.indexOf(id) + step + ids.length) % ids.length];
              state.setLayout(next);
              (event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-layout="${next}"]`))?.focus();
            }}
            data-layout={id}
            className={cn(
              "grid h-full w-8 place-items-center rounded-[5px] text-muted-foreground transition-colors outline-none hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:w-9",
              checked && "bg-amethyst/15 text-amethyst hover:bg-amethyst/20 hover:text-amethyst",
            )}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
