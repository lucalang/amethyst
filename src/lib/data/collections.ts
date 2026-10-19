import "server-only";
import { cache } from "react";
import { z } from "zod";
import type { AuthContext } from "@/lib/supabase/auth";
import { fetchAll } from "./fetch-all";

export const loadCollections = cache(async (ctx: AuthContext) =>
  fetchAll((from, to) => ctx.supabase.from("collections").select("id, name, legacy_slug").order("created_at").order("id").range(from, to)),
);

export async function loadCollection(ctx: AuthContext, id: string) {
  const collections = await loadCollections(ctx);
  const isId = z.uuid().safeParse(id).success;
  return collections.find((collection) => isId ? collection.id === id : collection.legacy_slug === id) ?? null;
}