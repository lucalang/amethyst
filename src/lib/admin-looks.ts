import { BASE_PALETTE, PALETTE_VARIANTS, type Palette } from "@/lib/palette-variants";

/**
 * The Admin panel's colours, chosen in its header and kept on the account (independent of the Vault's).
 * Ids are stored; never rename them. `plain` is the accent with Special page designs off (the default keeps the app theme's).
 */
export const ADMIN_LOOKS = [
  { id: "crimson", label: "Crimson", swatch: "#ff1f3d", palette: BASE_PALETTE, plain: "var(--amethyst)" },
  ...PALETTE_VARIANTS.map((variant) => ({ ...variant, plain: variant.swatch })),
] as const satisfies readonly { id: string; label: string; swatch: string; palette: Palette; plain: string }[];

export type AdminLook = (typeof ADMIN_LOOKS)[number];
export type AdminLookId = AdminLook["id"];
export const ADMIN_LOOK_IDS = ADMIN_LOOKS.map((look) => look.id) as [AdminLookId, ...AdminLookId[]];
export const DEFAULT_ADMIN_LOOK: AdminLookId = "crimson";
export const adminLook = (id: AdminLookId): AdminLook => ADMIN_LOOKS.find((look) => look.id === id) ?? ADMIN_LOOKS[0];
