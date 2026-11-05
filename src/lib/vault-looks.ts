/** The Vault's colour schemes, chosen from the chamber and kept on the account. Ids are stored; never rename them. */
export const VAULT_LOOKS = [
  { id: "obsidian", label: "Dark" },
  { id: "crimson", label: "Crimson" },
] as const;

export type VaultLookId = (typeof VAULT_LOOKS)[number]["id"];
export const VAULT_LOOK_IDS = VAULT_LOOKS.map((look) => look.id) as [VaultLookId, ...VaultLookId[]];
export const DEFAULT_VAULT_LOOK: VaultLookId = "obsidian";
