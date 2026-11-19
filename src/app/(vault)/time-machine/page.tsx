import type { Metadata } from "next";
import { TimeMachineLoader } from "@/components/time-machine/time-machine-loader";
import { loadTimeMachine } from "@/lib/data/time-machine";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Amethyst Time Machine" };

export default async function TimeMachinePage() {
  const ctx = await requireUser();
  const { entries, collections } = await loadTimeMachine(ctx);
  return <TimeMachineLoader entries={entries} collections={collections} />;
}
