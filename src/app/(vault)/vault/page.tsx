import type { Metadata } from "next";
import { SecretVault } from "@/components/vault/secret-vault";
import { artworkSrc } from "@/lib/attachments";
import { requireUser } from "@/lib/supabase/auth";
import type { FrameSample } from "../settings/frame-settings";

export const metadata: Metadata = { title: "The Vault" };

export default async function VaultPage() {
  const ctx = await requireUser();
  const [{ data }, { data: profile }, { data: covers }] = await Promise.all([
    ctx.supabase.from("secret_code_redemptions").select("redeemed_at, coins, items").eq("user_id", ctx.userId).order("redeemed_at", { ascending: false }).limit(50),
    // The account's own avatar and covers, so rewards are shown on the user's real things.
    ctx.supabase.from("users").select("display_name, avatar_url").eq("id", ctx.userId).maybeSingle(),
    ctx.supabase.from("entries").select("title, cover_url, cover_shape").not("cover_url", "is", null).order("updated_at", { ascending: false }).limit(40),
  ]);
  const finds = (data ?? []).map((row) => ({ redeemedAt: row.redeemed_at, coins: row.coins, items: row.items }));
  const sample = (shape: "portrait" | "square"): FrameSample | null => {
    const row = (covers ?? []).find((cover) => cover.cover_shape === shape && artworkSrc(cover.cover_url));
    return row?.cover_url ? { title: row.title, coverUrl: row.cover_url } : null;
  };

  // Full-bleed: the chamber fills the content area edge to edge.
  return (
    <SecretVault
      finds={finds}
      profile={{ name: profile?.display_name ?? null, avatarUrl: profile?.avatar_url ?? null }}
      samples={{ portrait: sample("portrait"), square: sample("square") }}
    />
  );
}
