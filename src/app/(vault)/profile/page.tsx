import { redirect } from "next/navigation";
import { memberPath } from "@/lib/data/profiles";
import { requireUser } from "@/lib/supabase/auth";

export default async function MyProfilePage() {
  const ctx = await requireUser();
  redirect(memberPath(ctx.userId));
}
