import "server-only";
import { SUDOKU_DIFFICULTIES, type SudokuDifficulty } from "@/lib/arcade";
import { COSMETICS, isAvatarDecorationId, isCosmeticId, type AvatarDecorationId, type CosmeticKind, type ShopItem } from "@/lib/cosmetics";
import { GAME_SHOPS, gameCosmetic, lookFromItems, type GameLook, type ShopGame } from "@/lib/game-cosmetics";
import type { AuthContext } from "@/lib/supabase/auth";
import { measureServer } from "./timing";

/** The account's coin balance (0 before the first reward). */
export async function loadCoinBalance(ctx: AuthContext): Promise<number> {
  const { data, error } = await ctx.supabase.from("coin_wallets").select("balance").eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(`Could not load the coin balance: ${error.code}`);
  return data?.balance ?? 0;
}

/** Ids of the cosmetics this account owns. */
export async function loadOwnedCosmetics(ctx: AuthContext): Promise<string[]> {
  const { data, error } = await ctx.supabase.from("user_cosmetics").select("item_id").eq("user_id", ctx.userId);
  if (error) throw new Error(`Could not load owned cosmetics: ${error.code}`);
  return (data ?? []).map((row) => row.item_id);
}

export const toAvatarDecoration = (value: string | null | undefined): AvatarDecorationId | null => (isAvatarDecorationId(value) ? value : null);

export type CoinTransaction = { id: number; amount: number; balanceAfter: number; kind: "reward" | "purchase" | "code" | "slots"; label: string; createdAt: string };

const GAME_NAMES: Record<string, string> = {
  "2048": "2048",
  flutter: "Flutter",
  snake: "Snake",
  sudoku: "Sudoku",
  "fruit-slice": "Fruit Slice",
  stacker: "Tower Stacker",
};

function transactionLabel(kind: CoinTransaction["kind"], details: unknown) {
  const info = (details ?? {}) as Record<string, unknown>;
  if (kind === "code") return "Secret code";
  if (kind === "slots") return "Coin Slots";
  if (kind === "purchase") {
    if (isCosmeticId(info.item)) return `Bought ${COSMETICS[info.item].name}`;
    const game = gameCosmetic(info.item);
    return game ? `Bought ${game.name} (${GAME_SHOPS[game.game].title})` : "Purchase";
  }
  const game = typeof info.game === "string" ? (GAME_NAMES[info.game] ?? "Arcade") : "Arcade";
  if (info.game === "sudoku" && SUDOKU_DIFFICULTIES.includes(info.difficulty as SudokuDifficulty)) return `${game} · ${info.difficulty as string} puzzle`;
  return typeof info.score === "number" ? `${game} · score ${info.score.toLocaleString("en")}` : game;
}

export type CoinRule = { game: string; variant: string; minScore: number; minSeconds: number; pointsPerCoin: number; flatCoins: number; maxCoins: number };

export type ShopData = {
  balance: number;
  earned: number;
  items: ShopItem[];
  history: CoinTransaction[];
  rules: CoinRule[];
};

/** Everything the shop shows: server prices, ownership, what is equipped, recent coin history and the earning rules. */
type EquippedCosmetics = { frame: string; decoration: string | null };

export async function loadShop(ctx: AuthContext, equipped: EquippedCosmetics | Promise<EquippedCosmetics>): Promise<ShopData> {
  const check = <T,>({ data, error }: { data: T | null; error: { code?: string } | null }) => {
    if (error) throw new Error(`Could not load the shop: ${error.code}`);
    return data;
  };
  const [wallet, items, owned, history, rules, look] = await Promise.all([
    measureServer("shop.wallet", () => ctx.supabase.from("coin_wallets").select("balance, earned").eq("user_id", ctx.userId).maybeSingle().then(check)),
    measureServer("shop.catalog", () => ctx.supabase.from("cosmetic_items").select("id, kind, price, available").neq("kind", "game").then(check)),
    measureServer("shop.ownership", () => ctx.supabase.from("user_cosmetics").select("item_id").eq("user_id", ctx.userId).then(check)),
    ctx.supabase
      .from("coin_transactions")
      .select("id, amount, balance_after, kind, details, created_at")
      .eq("user_id", ctx.userId)
      .neq("kind", "slots")
      .order("created_at", { ascending: false })
      .limit(12)
      .then(check),
    ctx.supabase.from("arcade_reward_rules").select("game, variant, min_score, min_seconds, points_per_coin, flat_coins, max_coins").then(check),
    equipped,
  ]);
  const ownedIds = new Set((owned ?? []).map((row) => row.item_id));
  const order = Object.keys(COSMETICS);
  return {
    balance: wallet?.balance ?? 0,
    earned: wallet?.earned ?? 0,
    items: (items ?? [])
      .filter((item) => item.kind !== "game" && isCosmeticId(item.id))
      .map((item) => {
        const id = item.id as ShopItem["id"];
        const kind = item.kind as CosmeticKind;
        const isOwned = ownedIds.has(id);
        return {
          id,
          kind,
          price: item.price,
          available: item.available,
          owned: isOwned,
          equipped: isOwned && (kind === "frame" ? look.frame === id : look.decoration === id),
        };
      })
      .filter((item) => item.available || item.owned)
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
    history: (history ?? []).map((row) => ({
      id: row.id,
      amount: row.amount,
      balanceAfter: row.balance_after,
      kind: row.kind,
      label: transactionLabel(row.kind, row.details),
      createdAt: row.created_at,
    })),
    rules: (rules ?? []).map((rule) => ({
      game: rule.game,
      variant: rule.variant,
      minScore: rule.min_score,
      minSeconds: rule.min_seconds,
      pointsPerCoin: Number(rule.points_per_coin),
      flatCoins: rule.flat_coins,
      maxCoins: rule.max_coins,
    })),
  };
}

/** The cosmetics this account has equipped in one game (missing categories use the free default). */
export async function loadGameLoadout(ctx: AuthContext, game: ShopGame): Promise<GameLook> {
  const { data, error } = await ctx.supabase.from("game_loadouts").select("category, item_id").eq("user_id", ctx.userId).eq("game", game);
  if (error) throw new Error(`Could not load game cosmetics: ${error.code}`);
  return lookFromItems(game, data ?? []);
}

export type GameShopItemState = { id: string; price: number; available: boolean; owned: boolean };
export type GameShopData = { game: ShopGame; balance: number; items: GameShopItemState[]; look: GameLook };

/** One game's shop: server prices, what this account owns and what is equipped. */
export async function loadGameShop(ctx: AuthContext, game: ShopGame): Promise<GameShopData> {
  const check = <T,>({ data, error }: { data: T | null; error: { code?: string } | null }) => {
    if (error) throw new Error(`Could not load the shop: ${error.code}`);
    return data;
  };
  const [balance, items, owned, look] = await Promise.all([
    loadCoinBalance(ctx),
    ctx.supabase.from("cosmetic_items").select("id, price, available").eq("kind", "game").eq("game", game).then(check),
    ctx.supabase.from("user_cosmetics").select("item_id").eq("user_id", ctx.userId).like("item_id", `${GAME_SHOPS[game].prefix}-%`).then(check),
    loadGameLoadout(ctx, game),
  ]);
  const ownedIds = new Set((owned ?? []).map((row) => row.item_id));
  return {
    game,
    balance,
    items: (items ?? [])
      .filter((row) => gameCosmetic(row.id)?.game === game)
      .map((row) => ({ id: row.id, price: row.price, available: row.available, owned: ownedIds.has(row.id) })),
    look,
  };
}
