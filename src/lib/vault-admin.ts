import { z } from "zod";

/**
 * Shared by the admin code builder (client) and the admin API (server). Vault codes themselves never
 * appear here: drafts keep only the configuration, and the server hashes a code when publishing it.
 */

export const LIMITS = {
  label: 120,
  coins: 100_000,
  items: 100,
  achievements: 50,
  allowlist: 500,
  maxRedemptions: 1_000_000,
  perAccount: 100,
} as const;

/** Code-granted coins are recorded as their own kind and never count toward the daily earning limit. */
export const DAILY_EARNING_LIMIT = 600;

const isoDate = z.iso.datetime({ offset: true }).nullable();
const id = z.string().trim().min(1).max(80);

const configShape = {
  label: z.string().trim().min(1, "Give the code a label.").max(LIMITS.label),
  coins: z.number().int("Coins are whole numbers.").min(0).max(LIMITS.coins, `At most ${LIMITS.coins.toLocaleString("en")} coins.`),
  items: z.array(id).max(LIMITS.items),
  achievements: z.array(id).max(LIMITS.achievements),
  audience: z.enum(["everyone", "allowlist"]),
  allowlist: z.array(z.uuid()).max(LIMITS.allowlist),
  startsAt: isoDate,
  expiresAt: isoDate,
  maxRedemptions: z.number().int().min(1).max(LIMITS.maxRedemptions).nullable(),
  perAccountLimit: z.number().int().min(1).max(LIMITS.perAccount),
  codeMode: z.enum(["phrase", "random", "custom"]),
};

export const codeConfigSchema = z.strictObject(configShape);
/** Drafts may be incomplete, but never hold a code. */
export const draftConfigSchema = z.strictObject({ ...configShape, label: z.string().max(LIMITS.label) }).partial();

export type CodeConfig = z.infer<typeof codeConfigSchema>;

/** Editing a published code: everything except how the code text was made. Only future redemptions change. */
export const codeUpdateSchema = codeConfigSchema.omit({ codeMode: true });
export type CodeUpdate = z.infer<typeof codeUpdateSchema>;

export const EMPTY_CONFIG: CodeConfig = {
  label: "",
  coins: 0,
  items: [],
  achievements: [],
  audience: "everyone",
  allowlist: [],
  startsAt: null,
  expiresAt: null,
  maxRedemptions: null,
  perAccountLimit: 1,
  codeMode: "phrase",
};

/** A stored draft or clone source as a complete configuration (unknown or invalid parts dropped). */
export function configFrom(raw: unknown): CodeConfig {
  const parsed = draftConfigSchema.safeParse(raw);
  if (!parsed.success) return { ...EMPTY_CONFIG };
  const defined = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
  return { ...EMPTY_CONFIG, ...defined };
}

export type AdminAccount = { id: string; name: string | null; email: string | null; avatarUrl: string | null };

export type AdminCode = {
  id: string;
  label: string;
  format: "compact" | "phrase";
  coins: number;
  items: string[];
  achievements: string[];
  audience: "everyone" | "allowlist";
  allowlistCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  maxRedemptions: number | null;
  perAccountLimit: number;
  redemptionCount: number;
  disabledAt: string | null;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
};

export type AdminCodeDetail = AdminCode & {
  allowlist: AdminAccount[];
  redemptions: {
    id: number;
    account: AdminAccount | null;
    redeemedAt: string;
    coins: number;
    items: string[];
    achievements: string[];
    achievementsNew: string[];
  }[];
  audit: AdminAuditEntry[];
};

export type AuditAction = "publish" | "disable" | "enable" | "update";

export type AdminAuditEntry = {
  id: number;
  action: AuditAction;
  via: "app" | "cli";
  at: string;
  actor: AdminAccount | null;
  /** For edits: each changed field with its value before and after. */
  changes: Record<string, { from: unknown; to: unknown }> | null;
};

export type AdminActivity = {
  id: number;
  action: AuditAction;
  via: "app" | "cli";
  at: string;
  codeId: string;
  label: string;
  actor: AdminAccount | null;
  changed: string[] | null;
};

export type AdminStats = {
  timeZone: string;
  totals: { redemptions: number; coins: number; week: number; accounts: number };
  /** The last 30 local days, oldest first. */
  timeline: { day: string; redemptions: number; coins: number }[];
  activity: AdminActivity[];
};

export type AdminSnapshot = { codes: AdminCode[]; drafts: AdminDraft[]; stats: AdminStats; now: number };

export type AdminDraft = { id: string; label: string; config: unknown; updatedAt: string; updatedByName: string | null };

export type CatalogItem = {
  id: string;
  kind: "frame" | "avatar_decoration" | "game" | "badge" | "title";
  source: "shop" | "vault" | "achievement";
  secret: boolean;
  available: boolean;
  price: number;
  game: string | null;
  category: string | null;
};

export type CatalogAchievement = { id: string; coins: number; hidden: boolean; items: string[] };

export type CodeStatus = "active" | "scheduled" | "expired" | "used-up" | "disabled";

/** Code statuses in display order. Add a status here and the dashboard picks up its label and filter. */
export const CODE_STATUS: Record<CodeStatus, { label: string; hint: string; order: number }> = {
  active: { label: "Active", hint: "Players can redeem it now.", order: 0 },
  scheduled: { label: "Scheduled", hint: "Published, but its start time hasn’t come yet.", order: 1 },
  expired: { label: "Expired", hint: "Its expiry has passed.", order: 2 },
  "used-up": { label: "Used up", hint: "Every redemption it allowed has been made.", order: 3 },
  disabled: { label: "Disabled", hint: "Switched off by an administrator.", order: 4 },
};

export const CODE_STATUSES = (Object.keys(CODE_STATUS) as CodeStatus[]).sort((a, b) => CODE_STATUS[a].order - CODE_STATUS[b].order);

export const STATUS_LABEL = Object.fromEntries(CODE_STATUSES.map((s) => [s, CODE_STATUS[s].label])) as Record<CodeStatus, string>;

export function codeStatus(code: Pick<AdminCode, "disabledAt" | "startsAt" | "expiresAt" | "maxRedemptions" | "redemptionCount">, now: number): CodeStatus {
  if (code.disabledAt) return "disabled";
  if (code.expiresAt && Date.parse(code.expiresAt) <= now) return "expired";
  if (code.maxRedemptions !== null && code.redemptionCount >= code.maxRedemptions) return "used-up";
  if (code.startsAt && Date.parse(code.startsAt) > now) return "scheduled";
  return "active";
}

/** The most code coins one account, and everyone together, can receive (null: no upper bound). */
export function maxPayout(config: Pick<CodeConfig, "coins" | "perAccountLimit" | "maxRedemptions" | "audience" | "allowlist">) {
  const perAccount = config.coins * config.perAccountLimit;
  const bounds = [
    config.maxRedemptions !== null ? config.coins * config.maxRedemptions : null,
    config.audience === "allowlist" ? perAccount * config.allowlist.length : null,
  ].filter((value): value is number => value !== null);
  return { perAccount, total: bounds.length ? Math.min(...bounds) : null };
}

/** Repeatable coin codes must be confirmed explicitly before publishing. */
export const needsRepeatConfirmation = (config: Pick<CodeConfig, "coins" | "perAccountLimit">) =>
  config.coins > 0 && config.perAccountLimit > 1;
