"use client";

import { useId, useState } from "react";
import { Check, Layers, LibraryBig, Sparkles, Wand2 } from "lucide-react";
import { useSaveSettings } from "@/app/(vault)/settings/setting-controls";
import { ChangedBadge, ResetIconButton } from "@/app/(vault)/settings/reset-button";
import { ArtworkPicker, type FanCollection } from "@/components/home/fan-editor";
import { MediaImage } from "@/components/media/media-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { FanItem } from "@/lib/home-fan";
import { DEFAULT_SETTINGS, MAX_WALL_ENTRIES, type HomeWall, type HomeWallSource } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const SOURCES: Record<HomeWallSource, { label: string; icon: typeof Wand2; hint: string }> = {
  auto: { label: "Automatic", icon: Wand2, hint: "Your cover fan, featured entry, pinned and recently opened entries, and collection covers." },
  collections: { label: "Collections", icon: LibraryBig, hint: "Every entry with cover art in the collections you choose, most recently updated first." },
  entries: { label: "Hand-picked", icon: Sparkles, hint: `Up to ${MAX_WALL_ENTRIES} entries you choose, in your order.` },
};

/** Customize Home (Flashy): which entries drift across the artwork wall behind the greeting. */
export function WallEditor({ wall, picks, collections }: { wall: HomeWall; picks: FanItem[]; collections: FanCollection[] }) {
  const save = useSaveSettings();
  const [local, setLocal] = useState(wall);
  const [chosen, setChosen] = useState(picks);
  const [shown, setShown] = useState({ wall, picks });
  if (JSON.stringify(shown) !== JSON.stringify({ wall, picks })) {
    setShown({ wall, picks });
    setLocal(wall);
    setChosen(picks);
  }
  const [pickerOpen, setPickerOpen] = useState(false);
  const name = useId();
  const isDefault = JSON.stringify(local) === JSON.stringify(DEFAULT_SETTINGS.homeWall);

  function commit(next: HomeWall) {
    const previous = local;
    setLocal(next);
    void save({ homeWall: next }).then((ok) => {
      if (!ok) setLocal(previous);
    });
  }

  function toggleCollection(id: string) {
    const selected = local.collections.includes(id);
    commit({ ...local, collections: selected ? local.collections.filter((item) => item !== id) : [...local.collections, id] });
  }

  const waiting =
    (local.source === "collections" && !local.collections.length) || (local.source === "entries" && !chosen.some((item) => item.kind === "entry" && item.coverUrl));

  return (
    <fieldset className="space-y-3">
      <legend className="flex min-h-6 items-center gap-2 text-sm font-medium">
        Artwork wall
        {isDefault ? null : (
          <>
            <ChangedBadge />
            <ResetIconButton
              label="the artwork wall"
              defaultLabel="automatic"
              onReset={() => {
                setChosen([]);
                commit(DEFAULT_SETTINGS.homeWall);
              }}
            />
          </>
        )}
      </legend>
      <p className="text-xs text-muted-foreground">The covers that drift behind your greeting.</p>

      <div role="radiogroup" aria-label="Wall artwork from" className="inline-flex flex-wrap rounded-md border border-white/[0.1] p-0.5">
        {(Object.keys(SOURCES) as HomeWallSource[]).map((option) => {
          const Icon = SOURCES[option].icon;
          return (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                local.source === option ? "bg-amethyst/15 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input type="radio" name={name} value={option} checked={local.source === option} onChange={() => commit({ ...local, source: option })} className="sr-only" />
              <Icon aria-hidden className="size-3.5" />
              {SOURCES[option].label}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{SOURCES[local.source].hint}</p>

      {local.source === "collections" ? (
        <div role="group" aria-label="Collections on the wall" className="flex flex-wrap gap-1.5">
          {collections.map((collection) => {
            const selected = local.collections.includes(collection.id);
            return (
              <button
                key={collection.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleCollection(collection.id)}
                className={cn(
                  "flex h-8 max-w-56 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-amethyst/50 bg-amethyst/15 text-foreground" : "border-white/[0.1] text-muted-foreground hover:text-foreground",
                )}
              >
                {selected ? <Check aria-hidden className="size-3.5 shrink-0 text-amethyst" /> : <span className="flex shrink-0 text-amethyst">{collection.icon}</span>}
                <span className="truncate">{collection.name}</span>
                <span className="text-muted-foreground tabular-nums">{collection.coverCount}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {local.source === "entries" ? (
        <div className="flex flex-wrap items-center gap-3">
          {chosen.length ? (
            <ol aria-label="Wall entries" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
              {chosen.map((item) =>
                item.kind === "entry" ? (
                  <li key={item.key} title={item.title} className={cn("relative shrink-0 overflow-hidden rounded-sm border border-white/[0.1] bg-surface", item.coverShape === "square" ? "size-10" : "h-12 w-8")}>
                    <MediaImage src={item.coverUrl} alt={item.title} fallbackLabel={item.title} className="text-[8px]" />
                  </li>
                ) : null,
              )}
            </ol>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" onClick={() => setPickerOpen(true)}>
            <Layers aria-hidden className="size-3.5 text-amethyst" />
            {chosen.length ? `Change entries (${chosen.length})` : "Choose entries"}
          </Button>
        </div>
      ) : null}

      {waiting ? <p className="text-xs text-warning">Nothing with cover art chosen yet, so the wall stays automatic for now.</p> : null}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex max-h-[min(46rem,calc(100dvh-2rem))] flex-col gap-4 sm:max-w-2xl">
          <ArtworkPicker
            items={chosen}
            collections={collections}
            max={MAX_WALL_ENTRIES}
            allowImages={false}
            reorderable
            title="Choose wall entries"
            description={`Pick up to ${MAX_WALL_ENTRIES} entries with cover art. They drift across the wall in this order.`}
            emptyText="Nothing selected. With no entries, the wall stays automatic."
            fullText="the wall is full"
            imageHint=""
            addImageLabel=""
            saveLabel="Save wall"
            onCancel={() => setPickerOpen(false)}
            onApply={(next) => {
              setPickerOpen(false);
              setChosen(next);
              commit({ ...local, entries: next.flatMap((item) => (item.kind === "entry" ? [item.entryId] : [])) });
            }}
          />
        </DialogContent>
      </Dialog>
    </fieldset>
  );
}
