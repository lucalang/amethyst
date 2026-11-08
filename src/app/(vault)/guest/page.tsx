import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Gamepad2, Lock, LogIn, UserPlus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { GUEST_HOME } from "@/lib/guest";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Guest mode" };

const CAN = ["Play every Arcade game", "Earn coins and keep streaks during this session", "Check the Arcade leaderboards"];
const NEEDS_ACCOUNT = ["Archive collections and entries", "To Do lists and tasks", "Shop, cases and game cosmetics", "Season Pass and quests", "Inventory, achievements and your profile", "Settings, notes and the Lab"];

export default async function GuestPage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const ctx = await requireUser();
  if (!ctx.guest) redirect("/");
  const { from } = await searchParams;
  const blocked = typeof from === "string" && from.startsWith("/");

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Guest mode"
        icon={Gamepad2}
        description={blocked ? "That page needs an account. As a guest you can only use the Arcade." : "You’re playing without an account, so only the Arcade is open."}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="ui-panel p-5" aria-labelledby="guest-can">
          <h2 id="guest-can" className="text-sm font-semibold">
            Guests can
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {CAN.map((item) => (
              <li key={item} className="flex gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-400" /> {item}
              </li>
            ))}
          </ul>
        </section>
        <section className="ui-panel p-5" aria-labelledby="guest-needs">
          <h2 id="guest-needs" className="text-sm font-semibold">
            Needs an account
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {NEEDS_ACCOUNT.map((item) => (
              <li key={item} className="flex gap-2">
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" /> {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="mt-5 text-sm text-pretty text-muted-foreground">
        Guest coins, scores and streaks aren’t moved to a new account, and they’re discarded when you end the guest session.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/register">
            <UserPlus aria-hidden /> Create account
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">
            <LogIn aria-hidden /> Sign in
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href={GUEST_HOME}>
            <Gamepad2 aria-hidden /> Back to the Arcade
          </Link>
        </Button>
      </div>
    </PageContainer>
  );
}
