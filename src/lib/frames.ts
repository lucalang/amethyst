/**
 * Decorative artwork frames for Showcase and the artwork viewer. The 2D look lives in
 * `globals.css` (`.art-frame[data-frame=…]`), the 3D look in the card renderer. Frames are
 * independent of the app theme and never apply to banners or images inside notes.
 */
export const ARTWORK_FRAME_IDS = ["none", "gilt", "amethyst", "holo", "aurora"] as const;
export type ArtworkFrameId = (typeof ARTWORK_FRAME_IDS)[number];
export const DEFAULT_ARTWORK_FRAME: ArtworkFrameId = "none";

export type ArtworkFrameInfo = { name: string; description: string; animated?: boolean };

export const ARTWORK_FRAMES: Record<ArtworkFrameId, ArtworkFrameInfo> = {
  none: { name: "No frame", description: "Just the artwork, edge to edge." },
  gilt: { name: "Gilt edge", description: "A slim champagne-gold rim with small studs at the corners." },
  amethyst: { name: "Amethyst filigree", description: "Violet filigree corners and a small faceted crest above the art." },
  holo: { name: "Holographic edge", description: "An iridescent rim that shifts color as the light moves across it." },
  aurora: { name: "Aurora trace", description: "A quiet thread of light that slowly travels around the edge.", animated: true },
};
