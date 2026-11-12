/**
 * Admin Dashboard (/admin-dashboard): the shapes returned by `admin_dashboard_state()` and the override
 * endpoints. Everything here is display data; the database decides roles, validity and outcomes.
 */
import { z } from "zod";

export const ADMIN_ROLES = ["owner", "admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export const OVERRIDE_STATUSES = ["queued", "consumed", "expired", "cancelled"] as const;
export type OverrideStatus = (typeof OVERRIDE_STATUSES)[number];

const account = z.object({ id: z.string(), name: z.string().nullable(), email: z.string().nullable(), avatarUrl: z.string().nullable() }).nullable();
const role = z.enum(ADMIN_ROLES);
const status = z.enum(OVERRIDE_STATUSES);

export const lootOverrideSchema = z.object({
  id: z.string(),
  kind: z.literal("loot"),
  case: z.string(),
  item: z.string(),
  rarity: z.string().nullable(),
  status,
  createdAt: z.string(),
  expiresAt: z.string(),
  resolvedAt: z.string().nullable(),
  openingId: z.string().nullable(),
});

export const slotOverrideSchema = z.object({
  id: z.string(),
  kind: z.literal("slots"),
  stops: z.array(z.number().int()),
  symbols: z.array(z.string()),
  multiplier: z.number().int(),
  status,
  createdAt: z.string(),
  expiresAt: z.string(),
  resolvedAt: z.string().nullable(),
  spinId: z.string().nullable(),
  bet: z.number().int().nullable(),
  payout: z.number().int().nullable(),
});

export const dashboardSchema = z.object({
  me: z.object({ id: z.string(), role, account }),
  admins: z.array(z.object({ id: z.string(), role, grantedAt: z.string(), account, grantedBy: account })),
  cases: z.array(
    z.object({
      id: z.string(),
      available: z.boolean(),
      items: z.array(z.object({ id: z.string(), rarity: z.string(), kind: z.string() })),
    }),
  ),
  machine: z
    .object({
      id: z.string(),
      reels: z.array(z.array(z.string())),
      paytable: z.array(z.object({ symbol: z.string(), count: z.number().int(), pays: z.number().int() })),
    })
    .nullable(),
  loot: z.array(lootOverrideSchema),
  slots: z.array(slotOverrideSchema),
  audit: z.array(
    z.object({
      id: z.number(),
      action: z.string(),
      details: z.record(z.string(), z.unknown()),
      createdAt: z.string(),
      actor: account,
      target: account,
    }),
  ),
});

export type AdminDashboardState = z.infer<typeof dashboardSchema>;
export type DashboardAccount = AdminDashboardState["me"]["account"];
export type LootOverride = z.infer<typeof lootOverrideSchema>;
export type SlotOverride = z.infer<typeof slotOverrideSchema>;
