import { z } from "zod";
import { COVER_SHAPES } from "@/lib/cover-shape";
import { fanKey } from "@/lib/home-fan";
import { artworkUrl } from "@/lib/validation/entries";

/** One hand-picked piece of artwork: an entry's live cover or a standalone image. */
export const artworkItemSchema = z.union([
  z.object({ entryId: z.uuid() }).strict(),
  z.object({ imageUrl: artworkUrl.pipe(z.string({ error: "Add an image link or upload an image." })), shape: z.enum(COVER_SHAPES) }).strict(),
]);

export type ArtworkItemInput = z.infer<typeof artworkItemSchema>;

export const uniqueArtwork = (items: ArtworkItemInput[]) => new Set(items.map(fanKey)).size === items.length;

/** The database RPC shape shared by set_home_fan and set_collection_covers. */
export const artworkRpcItems = (items: ArtworkItemInput[]) =>
  items.map((item) => ("entryId" in item ? { entry_id: item.entryId } : { image_url: item.imageUrl, image_shape: item.shape }));
