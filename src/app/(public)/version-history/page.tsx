import type { Metadata } from "next";
import { VersionHistoryBrowser } from "@/components/version-history/version-history-browser";
import { loadDemoStates } from "@/lib/version-demo-runtime";

export const metadata: Metadata = { title: "Version history" };

export default async function VersionHistoryPage() {
  const initialDemos = await loadDemoStates();

  return <VersionHistoryBrowser initialDemos={initialDemos} />;
}
