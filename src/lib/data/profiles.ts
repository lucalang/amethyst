import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { isProfileTitleId, toProfileBadges, type AvatarDecorationId, type ProfileBadgeId, type ProfileTitleId } from "@/lib/cosmetics";
import { toAvatarDecoration } from "@/lib/data/shop";
import {
  pedestalCollectible,
  toProfileAmbient,
  toProfileSections,
  toProfileStyle,
  type ShowcaseArrangement,
  type ShowcasePiece,
  type ShowcaseShape,
} from "@/lib/profile-styles";
import { toProfileBanner, toProfileFrame } from "@/lib/profile-cosmetics";
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

export type MemberShowcase = ShowcaseArrangement & { pieces: ShowcasePiece[] };

const ACHIEVEMENT_IDS = new Set<string>(ACHIEVEMENTS.map((item) => item.id));
const toShape = (value: unknown): ShowcaseShape => (value === "square" || value === "wide" ? value : "portrait");
const toAccent = (value: unknown) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null);

const showcaseSchema = z.object({
  style: z.string(),
  sections: z.array(z.string()).catch([]),
  ambient: z.string().catch("motes"),
  pedestal: z.string().nullable().catch(null),
  banner: z.string().nullable().catch(null),
  frame: z.string().nullable().catch(null),
  achievements: z.array(z.string()),
  items: z.array(
    z.object({
      position: z.number().int(),
      kind: z.enum(["entry", "collection"]),
      title: z.string().nullable(),
      accent: z.string().nullable(),
      shape: z.string().nullable(),
      image: z.string().regex(/^[0-9a-f]+$/).nullable(),
    }),
  ),
});

export const memberShowcaseImagePath = (id: string, position: number, version: string) => `/api/profiles/${id}/showcase/${position}?v=${version}`;

/** What any signed-in member sees of a showcase: style, pinned achievement ids and approved artwork fields. */
export const loadMemberShowcase = cache(async (ctx: AuthContext, id: string): Promise<MemberShowcase> => {
  const empty: MemberShowcase = { style: toProfileStyle(null), sections: toProfileSections(null), ambient: toProfileAmbient(null), pedestal: null, banner: toProfileBanner(null), frame: null, achievements: [], pieces: [] };
  if (!isMemberId(id)) return empty;
  const { data, error } = await ctx.supabase.rpc("member_showcase", { p_user: id });
  if (error) throw new Error(`Query failed (${error.code ?? "unknown"})`);
  const parsed = showcaseSchema.safeParse(data);
  if (!parsed.success) return empty;
  return {
    style: toProfileStyle(parsed.data.style),
    sections: toProfileSections(parsed.data.sections),
    ambient: toProfileAmbient(parsed.data.ambient),
    pedestal: pedestalCollectible(parsed.data.pedestal) ? parsed.data.pedestal : null,
    banner: toProfileBanner(parsed.data.banner),
    frame: toProfileFrame(parsed.data.frame),
    achievements: parsed.data.achievements.filter((item) => ACHIEVEMENT_IDS.has(item)),
    pieces: parsed.data.items.map((item) => ({
      key: String(item.position),
      kind: item.kind,
      title: item.title?.trim() || null,
      accent: toAccent(item.accent),
      shape: toShape(item.shape),
      src: item.image ? memberShowcaseImagePath(id, item.position, item.image) : null,
    })),
  };
});

/** An Archive item the owner can feature; `art` is the owner's own image reference (never sent to others). */
export type ShowcaseChoice = { kind: "entry" | "collection"; id: string; name: string; accent: string | null; shape: ShowcaseShape; art: string | null };
export type ShowcaseDraftItem = ShowcaseChoice & { showTitle: boolean };
/** A saved look, with its featured items resolved for the owner (items no longer in the Archive are dropped). */
export type SavedLook = ShowcaseArrangement & { id: string; name: string; items: ShowcaseDraftItem[] };
export type ShowcaseEditorData = {
  earned: string[];
  collections: ShowcaseChoice[];
  items: ShowcaseDraftItem[];
  looks: SavedLook[];
  activeLook: string | null;
};

const lookItemsSchema = z.array(z.object({ kind: z.enum(["entry", "collection"]), id: z.string(), showTitle: z.boolean() })).catch([]);

function check<T extends { error: { code?: string } | null }>(result: T): T {
  if (result.error) throw new Error(`Query failed (${result.error.code ?? "unknown"})`);
  return result;
}

/** The owner's editing data: earned achievements, collections with their cover, and the saved featured items. */
export async function loadShowcaseEditor(ctx: AuthContext): Promise<ShowcaseEditorData> {
  const { supabase, userId } = ctx;
  const [earned, collections, covers, saved, looks, worn] = await Promise.all([
    supabase.from("user_achievements").select("achievement_id, earned_at").eq("user_id", userId).order("earned_at", { ascending: false }),
    supabase.from("collections").select("id, name, accent_color, banner_url").eq("user_id", userId).order("position"),
    supabase.from("collection_cover_items").select("collection_id, entry_id, image_url, image_shape").eq("user_id", userId).order("position"),
    supabase.from("profile_showcase_items").select("position, entry_id, collection_id, show_title").eq("user_id", userId).order("position"),
    supabase.from("profile_looks").select("id, name, style, sections, ambient, pedestal, banner, frame, achievements, items").eq("user_id", userId).order("created_at"),
    supabase.from("users").select("profile_look").eq("id", userId).maybeSingle(),
  ]);
  [earned, collections, covers, saved, looks, worn].forEach(check);

  const lookRows = (looks.data ?? []).map((row) => ({ ...row, items: lookItemsSchema.parse(row.items) }));
  const entryIds = [
    ...new Set([
      ...(covers.data ?? []).flatMap((row) => (row.entry_id ? [row.entry_id] : [])),
      ...(saved.data ?? []).flatMap((row) => (row.entry_id ? [row.entry_id] : [])),
      ...lookRows.flatMap((row) => row.items.flatMap((item) => (item.kind === "entry" && isMemberId(item.id) ? [item.id] : []))),
    ]),
  ];
  const entries = entryIds.length
    ? check(await supabase.from("entries").select("id, title, cover_url, cover_shape").eq("user_id", userId).in("id", entryIds)).data ?? []
    : [];
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  const coverByCollection = new Map<string, { art: string; shape: ShowcaseShape }>();
  for (const row of covers.data ?? []) {
    if (coverByCollection.has(row.collection_id)) continue;
    const entry = row.entry_id ? entryById.get(row.entry_id) : undefined;
    const art = row.image_url ?? entry?.cover_url ?? null;
    if (art) coverByCollection.set(row.collection_id, { art, shape: toShape(row.image_url ? row.image_shape : entry?.cover_shape) });
  }
  const collectionChoices: ShowcaseChoice[] = (collections.data ?? []).map((collection) => {
    const cover = coverByCollection.get(collection.id);
    return {
      kind: "collection",
      id: collection.id,
      name: collection.name,
      accent: toAccent(collection.accent_color),
      shape: cover?.shape ?? "wide",
      art: cover?.art ?? collection.banner_url ?? null,
    };
  });
  const collectionById = new Map(collectionChoices.map((choice) => [choice.id, choice]));

  const resolve = (kind: "entry" | "collection", id: string, showTitle: boolean): ShowcaseDraftItem[] => {
    if (kind === "collection") {
      const choice = collectionById.get(id);
      return choice ? [{ ...choice, showTitle }] : [];
    }
    const entry = entryById.get(id);
    if (!entry) return [];
    return [{ kind: "entry", id: entry.id, name: entry.title, accent: null, shape: toShape(entry.cover_shape), art: entry.cover_url, showTitle }];
  };
  const earnedIds = (earned.data ?? []).map((row) => row.achievement_id).filter((item) => ACHIEVEMENT_IDS.has(item));
  const earnedSet = new Set(earnedIds);

  return {
    earned: earnedIds,
    collections: collectionChoices,
    items: (saved.data ?? []).flatMap((row) =>
      row.collection_id ? resolve("collection", row.collection_id, row.show_title) : row.entry_id ? resolve("entry", row.entry_id, row.show_title) : [],
    ),
    looks: lookRows.map((row) => ({
      id: row.id,
      name: row.name,
      style: toProfileStyle(row.style),
      sections: toProfileSections(row.sections),
      ambient: toProfileAmbient(row.ambient),
      pedestal: pedestalCollectible(row.pedestal) ? row.pedestal : null,
      banner: toProfileBanner(row.banner),
      frame: toProfileFrame(row.frame),
      achievements: row.achievements.filter((id) => earnedSet.has(id)),
      items: row.items.flatMap((item) => resolve(item.kind, item.id, item.showTitle)),
    })),
    activeLook: worn.data?.profile_look ?? null,
  };
}
