import "server-only";
import type { FrameSample } from "@/app/(vault)/settings/frame-settings";
import type { VaultLooks } from "@/components/vault/vault-reveal";
import { artworkSrc } from "@/lib/attachments";
import type { AuthContext } from "@/lib/supabase/auth";
import type { AdminAccount, AdminCode, AdminCodeDetail, AdminDraft, CatalogAchievement, CatalogItem } from "@/lib/vault-admin";

/** Admin reads; each database function checks the administrator list itself. */
async function call<T>(promise: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error("The admin panel couldn’t load its data.");
  return data as T;
}

export const loadAdminOverview = async (ctx: AuthContext) => ({
  ...(await call<{ codes: AdminCode[]; drafts: AdminDraft[] }>(ctx.supabase.rpc("admin_vault_overview"))),
  now: Date.now(),
});

export const loadAdminCode = async (ctx: AuthContext, id: string) => ({
  code: await call<AdminCodeDetail | null>(ctx.supabase.rpc("admin_vault_code", { p_id: id })),
  now: Date.now(),
});

export const loadAdminCatalog = (ctx: AuthContext) =>
  call<{ items: CatalogItem[]; achievements: CatalogAchievement[] }>(ctx.supabase.rpc("admin_vault_catalog"));

export const loadAdminAccounts = async (ctx: AuthContext, ids: string[]) =>
  ids.length ? call<AdminAccount[]>(ctx.supabase.rpc("admin_vault_accounts", { p_ids: ids })) : [];

/** The administrator's own avatar and covers, so cosmetics preview on real things (as in the Vault). */
export async function loadAdminLooks(ctx: AuthContext): Promise<VaultLooks> {
  const [{ data: profile }, { data: covers }] = await Promise.all([
    ctx.supabase.from("users").select("display_name, avatar_url").eq("id", ctx.userId).maybeSingle(),
    ctx.supabase.from("entries").select("title, cover_url, cover_shape").not("cover_url", "is", null).order("updated_at", { ascending: false }).limit(40),
  ]);
  const sample = (shape: "portrait" | "square"): FrameSample | null => {
    const row = (covers ?? []).find((cover) => cover.cover_shape === shape && artworkSrc(cover.cover_url));
    return row?.cover_url ? { title: row.title, coverUrl: row.cover_url } : null;
  };
  return {
    profile: { name: profile?.display_name ?? null, avatarUrl: profile?.avatar_url ?? null },
    samples: { portrait: sample("portrait"), square: sample("square") },
  };
}
