/**
 * Coin Slots: shapes shared by the machine page, its API and the client. The machine itself (reel
 * strips, paytable, bets and limits) lives in the `slot_machines` table, which the database uses to
 * settle every spin; the page reads the same row to show the exact odds.
 */

export type SlotRule = { symbol: string; count: number; pays: number };

export type SlotMachine = {
  id: string;
  reels: string[][];
  paytable: SlotRule[];
  bets: number[];
  dailyWagerLimit: number;
  maxSpinsPerMinute: number;
};

export type SlotOddsRow = SlotRule & { ways: number };
export type SlotOdds = { combos: number; rows: SlotOddsRow[]; hitWays: number; returned: number; topPays: number };

/** A settled spin as stored. `net` is payout minus bet: the actual profit or loss. */
export type SlotSpin = {
  spinId: string;
  bet: number;
  stops: number[];
  symbols: string[];
  multiplier: number;
  payout: number;
  net: number;
  balanceAfter: number;
  createdAt: string;
};

/** What a spin request returns: the spin plus the account's limits right after it. */
export type SlotSpinResult = SlotSpin & { replay: boolean; balance: number; wagered: number; room: number };

/** The best rule whose symbol shows exactly `count` times on the payline (0 = no win). */
export function lineMultiplier(paytable: SlotRule[], symbols: string[]) {
  let best = 0;
  for (const rule of paytable) {
    if (symbols.filter((symbol) => symbol === rule.symbol).length === rule.count) best = Math.max(best, rule.pays);
  }
  return best;
}

/** Exact odds, by settling every combination of stops (each stop on each reel is equally likely). */
export function slotOdds(machine: SlotMachine): SlotOdds {
  const [a = [], b = [], c = []] = machine.reels;
  const ways = new Map<SlotRule, number>();
  let returned = 0;
  for (const x of a) {
    for (const y of b) {
      for (const z of c) {
        const line = [x, y, z];
        let best: SlotRule | null = null;
        for (const rule of machine.paytable) {
          if (line.filter((symbol) => symbol === rule.symbol).length === rule.count && (!best || rule.pays > best.pays)) best = rule;
        }
        if (best) {
          ways.set(best, (ways.get(best) ?? 0) + 1);
          returned += best.pays;
        }
      }
    }
  }
  const rows = machine.paytable.map((rule) => ({ ...rule, ways: ways.get(rule) ?? 0 }));
  return {
    combos: a.length * b.length * c.length,
    rows,
    hitWays: rows.reduce((sum, row) => sum + row.ways, 0),
    returned,
    topPays: Math.max(0, ...machine.paytable.map((rule) => rule.pays)),
  };
}

/** Validates a `slot_machines` row; null if anything is off, so the page can close the machine instead of misreporting odds. */
export function parseSlotMachine(row: { id: string; reels: unknown; paytable: unknown; bets: number[]; daily_wager_limit: number; max_spins_per_minute: number }): SlotMachine | null {
  const reels = row.reels;
  const paytable = row.paytable;
  if (!Array.isArray(reels) || reels.length !== 3 || !reels.every((reel) => Array.isArray(reel) && reel.length > 0 && reel.every((s) => typeof s === "string"))) return null;
  if (!Array.isArray(paytable) || paytable.length === 0) return null;
  const rules = paytable.filter(
    (rule): rule is SlotRule =>
      typeof rule === "object" && rule !== null && typeof rule.symbol === "string" && Number.isInteger(rule.count) && Number.isInteger(rule.pays),
  );
  if (rules.length !== paytable.length) return null;
  return {
    id: row.id,
    reels: reels as string[][],
    paytable: rules.map(({ symbol, count, pays }) => ({ symbol, count, pays })),
    bets: [...row.bets].sort((x, y) => x - y),
    dailyWagerLimit: row.daily_wager_limit,
    maxSpinsPerMinute: row.max_spins_per_minute,
  };
}
