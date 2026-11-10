import { BASE_PALETTE, PALETTE_VARIANTS, type Palette } from "@/lib/palette-variants";

/**
 * The Vault's colour schemes, chosen from the chamber and kept on the account. Ids are stored; never rename them.
 * `base` is the drawn design (obsidian steel or the crimson chamber); `palette` turns its reds into the variant.
 * `plain` is the accent with Special page designs off.
 */
export const VAULT_LOOKS = [
  { id: "obsidian", label: "Dark", swatch: "#4a4e56", base: "obsidian", palette: BASE_PALETTE, plain: "var(--amethyst)" },
  { id: "crimson", label: "Crimson", swatch: "#ff1f3d", base: "crimson", palette: BASE_PALETTE, plain: "rgb(225 29 72)" },
  ...PALETTE_VARIANTS.map((variant) => ({ ...variant, base: "crimson" as const, plain: variant.swatch })),
] as const satisfies readonly { id: string; label: string; swatch: string; base: "obsidian" | "crimson"; palette: Palette; plain: string }[];

export type VaultLook = (typeof VAULT_LOOKS)[number];
export type VaultLookId = VaultLook["id"];
export const VAULT_LOOK_IDS = VAULT_LOOKS.map((look) => look.id) as [VaultLookId, ...VaultLookId[]];
export const DEFAULT_VAULT_LOOK: VaultLookId = "obsidian";
export const vaultLook = (id: VaultLookId): VaultLook => VAULT_LOOKS.find((look) => look.id === id) ?? VAULT_LOOKS[0];
