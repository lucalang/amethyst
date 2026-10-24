import type { CoverShape } from "@/lib/cover-shape";

/** Most artwork the Home cover fan shows (the database allows a little headroom). */
export const MAX_FAN_ITEMS = 9;

/** One saved piece of fan artwork, in fan order (left to right). */
export type FanItem =
  | {
      key: string;
      kind: "entry";
      entryId: string;
      title: string;
      collectionName: string;
      coverUrl: string | null;
      coverShape: CoverShape;
      /** The entry's own frame choice; null inherits the account frame. */
      frame: string | null;
    }
  | { key: string; kind: "image"; url: string; shape: CoverShape };

/** Request body item for PUT /api/home-fan. */
export type FanItemInput = { entryId: string } | { imageUrl: string; shape: CoverShape };

export const fanItemInput = (item: FanItem): FanItemInput => (item.kind === "entry" ? { entryId: item.entryId } : { imageUrl: item.url, shape: item.shape });

/** Stable across saves (rows are rewritten on every save), so the fan never remounts its cards. */
export const fanKey = (source: { entryId: string } | { imageUrl: string }) => ("entryId" in source ? `e:${source.entryId}` : `i:${source.imageUrl}`);
