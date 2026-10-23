import { redirect } from "next/navigation";
import { startupPath } from "@/lib/data/startup";
import { requireUser } from "@/lib/supabase/auth";

/** Opening the app (first Home visit of a session, or signing in) lands here and continues to the chosen destination. */
export default async function StartPage() {
  redirect(await startupPath(await requireUser()));
}
