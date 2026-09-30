import "server-only";

const PAGE = 1000;

/** Page through PostgREST results (max_rows caps a single response). */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
  limit = 20_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`Query failed (${error.code ?? "unknown"})`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}
