import { redirect } from "next/navigation";
import { collectionForKind } from "@/lib/collections";

export default async function LegacyNewEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { kind } = await searchParams;
  redirect(`/${collectionForKind(typeof kind === "string" ? kind : "anime").slug}/new`);
}
