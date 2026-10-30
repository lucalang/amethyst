/**
 * The Vault's timeline in milliseconds, shared by the 3D scene, the page and the sound so all three tell one story.
 */

/** "full" plays the first time in a browser session; later visits get the short re-summon. */
export type SummonKind = "full" | "short";

export const SUMMON: Record<SummonKind, { total: number; rise: number; hud: number; panel: number; settle: number }> = {
  // Darkness, embers and the floor sigil; the aura gathers; the vault rises; the window projects; everything locks.
  full: { total: 3300, rise: 850, hud: 1500, panel: 2050, settle: 2750 },
  short: { total: 1150, rise: 0, hud: 0, panel: 250, settle: 800 },
};

/** The unlock after a confirmed grant: rings align, teeth retract, gates part, then the rewards come out. */
export const UNLOCK = { retract: 300, open: 560, burst: 650, settle: 1500 } as const;

/** Gap between reward cards as they leave the vault. */
export const CARD_STAGGER = 110;
