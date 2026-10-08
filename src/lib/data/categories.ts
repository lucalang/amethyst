import "server-only";
import { sortCategories, type Category } from "@/lib/categories";
import type { AuthContext } from "@/lib/supabase/auth";
import type { EntryKind } from "@/lib/validation/entries";
import { fetchAll } from "./fetch-all";

/** The account's categories, alphabetically. */
export async function loadCategories(ctx: AuthContext, kind: EntryKind): Promise<Category[]> {
  const rows = await fetchAll((from, to) => ctx.supabase.from("categories").select("id, name").eq("kind", kind).order("name").range(from, to));
  return sortCategories(rows);
}

/** How many entries (of any kind) use each category. */
export async function loadCategoryUsage(ctx: AuthContext, kind: EntryKind): Promise<Record<string, number>> {
  const rows = await fetchAll((from, to) => ctx.supabase.from("entry_categories").select("category_id").eq("kind", kind).range(from, to));
  const usage: Record<string, number> = {};
  for (const row of rows) usage[row.category_id] = (usage[row.category_id] ?? 0) + 1;
  return usage;
}

export async function loadEntryCategoryIds(ctx: AuthContext, entryId: string): Promise<string[]> {
  const rows = await fetchAll((from, to) => ctx.supabase.from("entry_categories").select("category_id").eq("entry_id", entryId).range(from, to));
  return rows.map((row) => row.category_id);
}
