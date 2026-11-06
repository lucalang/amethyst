import { z } from "zod";
import { ARCADE_GAMES } from "@/lib/arcade";
import { INVENTORY_TYPES, type InventoryType } from "@/lib/inventory";
import { RARITY_IDS } from "@/lib/rarities";

/**
 * Season Pass and Quests. The database owns dates, prices, tiers, rewards and the quest pool
 * (`seasons`, `season_tiers`, `season_quests`) and counts quest progress from finished runs; this
 * file describes how seasons look and how quests read. A new season needs rows there and an entry
 * in SEASONS.
 */
export const SEASONS: Record<string, { name: string; tagline: string; hue: string; glow: string }> = {
  "season-1": {
    name: "Season 1 · First Light",
    tagline: "The first Arcade season: quests every day and week, and thirty tiers of cosmetics to earn.",
    hue: "#8b5cf6",
    glow: "#f0abfc",
  },
};
export const seasonInfo = (id: string) => SEASONS[id] ?? { name: "Season", tagline: "", hue: "#8b5cf6", glow: "#f0abfc" };

export const QUEST_CADENCES = ["daily", "weekly", "season"] as const;
export type QuestCadence = (typeof QUEST_CADENCES)[number];
export const CADENCE_LABELS: Record<QuestCadence, { title: string; reset: string }> = {
  daily: { title: "Daily quests", reset: "New quests every day at 00:00 UTC" },
  weekly: { title: "Weekly quests", reset: "New quests every Monday at 00:00 UTC" },
  season: { title: "Season quests", reset: "Available until the season ends" },
};

/** Most tiers one skip purchase may cover (the database also stops at the last tier). */
export const MAX_SKIP = 30;

const kind = z
  .string()
  .nullable()
  .transform((value): InventoryType | null => (INVENTORY_TYPES.includes(value as InventoryType) ? (value as InventoryType) : null));

const rewardSchema = z.object({
  tier: z.number().int(),
  track: z.enum(["free", "premium"]),
  item: z.string().nullable(),
  kind,
  rarity: z.enum(RARITY_IDS).nullable(),
  coins: z.number().int(),
  owned: z.boolean(),
  claimed: z.boolean(),
  duplicate: z.boolean(),
  paid: z.number().int(),
});
const questSchema = z.object({
  id: z.string(),
  quest: z.string(),
  cadence: z.enum(QUEST_CADENCES),
  kind: z.enum(["runs", "score", "games", "days"]),
  game: z.string().nullable(),
  target: z.number().int(),
  threshold: z.number().int().nullable(),
  xp: z.number().int(),
  coins: z.number().int(),
  progress: z.number().int(),
  periodStart: z.string(),
  periodEnd: z.string(),
  claimedAt: z.string().nullable(),
});
export const seasonStateSchema = z.object({
  now: z.string(),
  balance: z.number().int(),
  season: z
    .object({
      id: z.string(),
      startsAt: z.string(),
      endsAt: z.string(),
      xpPerTier: z.number().int(),
      premiumPrice: z.number().int(),
      skipPrice: z.number().int(),
      tierCount: z.number().int(),
      active: z.boolean(),
    })
    .nullable(),
  progress: z.object({ xp: z.number().int(), skipped: z.number().int(), tier: z.number().int(), premium: z.boolean() }).optional(),
  rewards: z.array(rewardSchema).default([]),
  quests: z.array(questSchema).default([]),
  otherSeasons: z.array(z.object({ id: z.string(), claimable: z.number().int() })).default([]),
});

export type SeasonReward = z.infer<typeof rewardSchema>;
export type SeasonQuest = z.infer<typeof questSchema>;
export type SeasonState = z.infer<typeof seasonStateSchema>;

const gameTitle = (id: string | null) => ARCADE_GAMES.find((game) => game.id === id)?.title ?? "any game";
const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en")} ${count === 1 ? one : many}`;

/** A quest's objective in words. */
export function questTitle(quest: Pick<SeasonQuest, "kind" | "game" | "target" | "threshold">) {
  switch (quest.kind) {
    case "runs":
      if (quest.game === "sudoku") return `Solve ${plural(quest.target, "Sudoku puzzle")}`;
      return quest.game ? `Finish ${plural(quest.target, `${gameTitle(quest.game)} run`)}` : `Finish ${plural(quest.target, "run")} in any game`;
    case "score":
      return `Score ${(quest.threshold ?? 0).toLocaleString("en")}+ in ${gameTitle(quest.game)}${quest.target > 1 ? ` ${quest.target} times` : ""}`;
    case "games":
      return `Play ${plural(quest.target, "different game")}`;
    case "days":
      return `Play on ${plural(quest.target, "different day")}`;
  }
}

/** Where to go to work on a quest. */
export const questHref = (quest: Pick<SeasonQuest, "game">) => ARCADE_GAMES.find((game) => game.id === quest.game)?.href ?? "/arcade";
