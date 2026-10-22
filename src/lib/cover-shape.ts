export const COVER_SHAPES = ["square", "portrait"] as const;
export type CoverShape = (typeof COVER_SHAPES)[number];