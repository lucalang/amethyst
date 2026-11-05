import "server-only";
import { cache } from "react";
import { z } from "zod";
import { isProfileTitleId, toProfileBadges, type AvatarDecorationId, type ProfileBadgeId, type ProfileTitleId } from "@/lib/cosmetics";
import { toAvatarDecoration } from "@/lib/data/shop";
import type { AuthContext } from "@/lib/supabase/auth";

/** The approved, member-visible profile fields. Never add private account data here. */
export type MemberProfile = {
  id: string;
  name: string | null;
  hasAvatar: boolean;
  motto: string | null;
  decoration: AvatarDecorationId | null;
  badges: ProfileBadgeId[];
  title: ProfileTitleId | null;
  memberSince: string;
};

export const isMemberId = (value: string) => z.uuid().safeParse(value).success;

export const memberPath = (id: string) => `/profile/${id}`;
export const memberAvatarPath = (id: string) => `/api/profiles/${id}/avatar`;

/** The signed-in account's own badges, in display order. */
export const loadOwnBadges = cache(async (ctx: AuthContext): Promise<ProfileBadgeId[]> => {
  const { data, error } = await ctx.supabase.from("user_profile_badges").select("badge_id").eq("user_id", ctx.userId).order("position");
  if (error) throw new Error(`Query failed (${error.code ?? "unknown"})`);
  return toProfileBadges(data.map((row) => row.badge_id));
});

/** A signed-in member's public profile, or null when the id is unknown. */
export const loadMemberProfile = cache(async (ctx: AuthContext, id: string): Promise<MemberProfile | null> => {
  if (!isMemberId(id)) return null;
  const { data, error } = await ctx.supabase.rpc("member_profile", { p_user: id });
  if (error) throw new Error(`Query failed (${error.code ?? "unknown"})`);
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.display_name?.trim() || null,
    hasAvatar: row.has_avatar,
    motto: row.motto?.trim() || null,
    decoration: toAvatarDecoration(row.avatar_decoration),
    badges: toProfileBadges(row.profile_badges),
    title: isProfileTitleId(row.profile_title) ? row.profile_title : null,
    memberSince: row.member_since,
  };
});
