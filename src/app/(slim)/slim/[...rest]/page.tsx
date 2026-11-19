import type { Metadata } from "next";
import Link from "next/link";
import { FULL_NAME, SLIM_BASE, SLIM_NAME } from "@/lib/edition";

export const metadata: Metadata = { title: "Not in this edition" };

/** Any address Slim doesn't have: offer the same page in the full app instead of a dead end. */
export default async function SlimMissingPage({ params }: { params: Promise<{ rest: string[] }> }) {
  const { rest } = await params;
  const full = `/${rest.map(encodeURIComponent).join("/")}`;
  return (
    <div className="slim-page grid max-w-xl gap-4">
      <h1 className="text-2xl font-bold tracking-tight">This page is only in {FULL_NAME}</h1>
      <p className="text-sm text-muted-foreground">{SLIM_NAME} keeps just your archive. Open the page in the full app, or go back to your archive here.</p>
      <div className="flex flex-wrap gap-2">
        <Link href={full} className="slim-switch">
          Open in {FULL_NAME}
        </Link>
        <Link href={SLIM_BASE} className="slim-switch">
          {SLIM_NAME} home
        </Link>
      </div>
    </div>
  );
}
