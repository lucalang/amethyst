import type { CSSProperties } from "react";

/**
 * The gems of the Flashy Admin Dashboard ("Geode"), chosen in its rail and kept on the account. Each gem lights
 * the whole design: `a` is the body colour, `b` the refraction, `c` the highlight and `deep` the dark it sits in.
 * Ids are stored; never rename them.
 */
export const ADMIN_GEMS = [
  { id: "amethyst", label: "Amethyst", a: "#a774ff", b: "#ff6ad5", c: "#7ee8ff", deep: "#120a24" },
  { id: "sapphire", label: "Sapphire", a: "#4d8dff", b: "#62f0ff", c: "#b98cff", deep: "#06122b" },
  { id: "emerald", label: "Emerald", a: "#2ee6a0", b: "#c2ff6a", c: "#4dd6ff", deep: "#03190f" },
  { id: "citrine", label: "Citrine", a: "#ffc23d", b: "#ff7a45", c: "#fff1a8", deep: "#1c1204" },
  { id: "rose", label: "Rose quartz", a: "#ff8fb8", b: "#c9a2ff", c: "#ffd9e8", deep: "#1e0b16" },
] as const satisfies readonly { id: string; label: string; a: string; b: string; c: string; deep: string }[];

export type AdminGem = (typeof ADMIN_GEMS)[number];
export type AdminGemId = AdminGem["id"];
export const ADMIN_GEM_IDS = ADMIN_GEMS.map((gem) => gem.id) as [AdminGemId, ...AdminGemId[]];
export const DEFAULT_ADMIN_GEM: AdminGemId = "amethyst";
export const adminGem = (id: AdminGemId): AdminGem => ADMIN_GEMS.find((gem) => gem.id === id) ?? ADMIN_GEMS[0];

/** The gem as the custom properties the Geode stylesheet reads (also on dialogs, which portal out). */
export const gemStyle = (id: AdminGemId) => {
  const gem = adminGem(id);
  return { "--gem-a": gem.a, "--gem-b": gem.b, "--gem-c": gem.c, "--gem-deep": gem.deep } as CSSProperties;
};
