"use client";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { CoverStack } from "@/components/home/cover-stack";
import { ArtworkPicker } from "@/components/home/fan-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import type { CollectionCoverChoices } from "@/lib/data/collection-covers";
import { fanItemInput, type FanItem } from "@/lib/home-fan";

const MAX_COVERS = 3;

const asPreview = (item: FanItem) =>
  item.kind === "entry"
    ? { id: item.key, title: item.title, coverUrl: item.coverUrl, coverShape: item.coverShape }
    : { id: item.key, title: "Your image", coverUrl: item.url, coverShape: item.shape };

/** Choose and order the artwork a collection shows on Home, the Archive and the hub. Entry artwork is never changed. */
export function CollectionCoverDialog({ open, onOpenChange, collection }: { open: boolean; onOpenChange: (open: boolean) => void; collection: { id: string; name: string } }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const queryKey = ["collection-covers", collection.id];
  const choices = useQuery({
    queryKey,
    queryFn: ({ signal }) => apiFetch<CollectionCoverChoices>(`/api/collections/${collection.id}/covers`, { signal }),
    enabled: open,
    refetchOnWindowFocus: false,
  });

  async function save(items: FanItem[]) {
    try {
      await apiFetch(`/api/collections/${collection.id}/covers`, { method: "PUT", json: { items: items.map(fanItemInput) } });
      onOpenChange(false);
      toast.success(items.length ? `Saved cover art for “${collection.name}”` : `“${collection.name}” uses automatic cover art again`);
      await queryClient.invalidateQueries({ queryKey });
      router.refresh();
    } catch (error) {
      toast.error(`Couldn’t save the cover art: ${errorMessage(error)}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(48rem,calc(100dvh-2rem))] flex-col gap-4 sm:max-w-2xl">
        {choices.data ? (
          <ArtworkPicker
            key={JSON.stringify(choices.data.items)}
            items={choices.data.items}
            collections={[]}
            scope={collection.id}
            max={MAX_COVERS}
            reorderable
            title={`Cover art for ${collection.name}`}
            description={`Choose up to ${MAX_COVERS} covers or images; the first sits on top. Your entries’ own artwork is never changed.`}
            emptyText="Nothing chosen, so the collection shows its most recently updated covers automatically."
            fullText="all slots used"
            imageHint="Paste a link or upload an image. It only decorates the collection; no entry is created."
            addImageLabel="Add image"
            saveLabel="Save covers"
            preview={(draft) => {
              const custom = draft.map(asPreview).filter((item) => item.coverUrl);
              const shown = custom.length ? custom : choices.data.automatic;
              return (
                <div className="flex items-center gap-4 rounded-lg border border-white/[0.1] bg-black/30 p-3">
                  {shown.length ? (
                    <CoverStack previews={shown} />
                  ) : (
                    <span aria-hidden className="grid h-24 w-16 shrink-0 place-items-center rounded-md border border-dashed border-white/[0.16] text-[10px] text-muted-foreground">
                      No art
                    </span>
                  )}
                  <div className="min-w-0 text-sm">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
                    <p className="mt-1 font-medium">{custom.length ? "Your chosen covers" : "Automatic artwork"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {custom.length
                        ? "Shown wherever this collection’s artwork appears."
                        : shown.length
                          ? "Recently updated entries with covers."
                          : "Add covers to entries, or choose an image, to give this collection artwork."}
                    </p>
                  </div>
                </div>
              );
            }}
            footerAction={(setDraft, draft) =>
              draft.length ? (
                <Button type="button" variant="ghost" className="gap-2" onClick={() => setDraft([])}>
                  <RotateCcw aria-hidden className="size-4" /> Use automatic
                </Button>
              ) : null
            }
            onCancel={() => onOpenChange(false)}
            onApply={(items) => void save(items)}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>Cover art for {collection.name}</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              {choices.isError ? (
                <span role="alert" className="text-rose">Couldn’t load the cover art. Close and try again.</span>
              ) : (
                <>
                  <Loader2 aria-hidden className="size-4 animate-spin" /> Loading…
                </>
              )}
            </DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}
