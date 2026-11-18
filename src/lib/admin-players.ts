/**
 * Admin Dashboard player tools: the shape returned by `admin_player_state()` and the actions the
 * player route accepts. The database checks admin access, ownership, balances and the season itself.
 */
import { z } from "zod";

const account = z.object({ id: z.string(), name: z.string().nullable(), email: z.string().nullable(), avatarUrl: z.string().nullable() }).nullable();

export const playerSchema = z.object({
  account,
  admin: z.enum(["owner", "admin"]).nullable(),
  memberSince: z.string().nullable(),
  wallet: z.object({ balance: z.number().int(), earned: z.number().int(), spent: z.number().int() }),
  transactions: z.array(
    z.object({ id: z.number(), amount: z.number().int(), kind: z.string(), balanceAfter: z.number().int(), createdAt: z.string(), reason: z.string().nullable() }),
  ),
  season: z
    .object({
      id: z.string(),
      endsAt: z.string(),
      price: z.number().int(),
      tier: z.number().int(),
      tiers: z.number().int().nullable(),
      premium: z.boolean(),
      premiumAt: z.string().nullable(),
      premiumSource: z.enum(["purchase", "admin"]).nullable(),
      premiumPaid: z.number().int().nullable(),
    })
    .nullable(),
  cosmetics: z.array(z.object({ id: z.string(), kind: z.string(), rarity: z.string().nullable(), acquiredAt: z.string() })),
  catalog: z.array(z.object({ id: z.string(), kind: z.string(), rarity: z.string().nullable() })),
  boosters: z.array(z.object({ id: z.string(), multiplier: z.number().int(), quantity: z.number().int(), active: z.number().int() })),
});

export type AdminPlayer = z.infer<typeof playerSchema>;

const slug = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/);

/** `id` is chosen by the client per request; a retry with the same id is never applied twice. */
export const playerActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("premium"), id: z.uuid(), premium: z.boolean(), refund: z.boolean() }),
  z.strictObject({
    action: z.literal("coins"),
    id: z.uuid(),
    amount: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
    reason: z.string().trim().min(3).max(200),
  }),
  z.strictObject({ action: z.literal("cosmetic"), id: z.uuid(), item: slug, owned: z.boolean() }),
  z.strictObject({ action: z.literal("booster"), id: z.uuid(), booster: slug, op: z.enum(["give", "take", "end"]), charges: z.number().int().min(1).max(10_000).nullable() }),
]);

export type PlayerActionResult = { status: "done" | "repeat" | "unchanged"; balance?: number; refund?: number };
