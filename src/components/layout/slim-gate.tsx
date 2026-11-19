import "server-only";
import Link from "next/link";
import type { ReactNode } from "react";
import { Feather, Home, Settings } from "lucide-react";
import { PageContainer } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { loadPreferences } from "@/lib/data/preferences";
import { SLIM_NAME, type SlimArea } from "@/lib/slim";
import { getAuthContext, type AuthContext } from "@/lib/supabase/auth";

/** Whether the signed-in account has Slim Amethyst on (signed-out visitors and guests never do). */
export async function slimModeOn(ctx?: AuthContext | null) {
  const auth = ctx === undefined ? await getAuthContext() : ctx;
  if (!auth || auth.guest) return false;
  return (await loadPreferences(auth)).slimMode;
}

/** What a direct link into a hidden area shows while Slim is on: where the area went and how to get it back. */
export function SlimHiddenNotice({ area }: { area: SlimArea["label"] }) {
  return (
    <PageContainer>
      <section className="ui-panel mx-auto mt-6 max-w-xl p-6 text-center md:p-8" aria-labelledby="slim-hidden-title">
        <span aria-hidden className="ui-hero-icon mx-auto">
          <Feather className="size-5" />
        </span>
        <h1 id="slim-hidden-title" className="mt-4 text-xl font-semibold tracking-tight">
          {area} is hidden in {SLIM_NAME}
        </h1>
        <p className="mt-2 text-sm text-pretty text-muted-foreground">
          Nothing in it has changed and everything you own still works. Turn {SLIM_NAME} off in Settings to open it again.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/settings#slim-mode-label-setting">
              <Settings aria-hidden /> Settings
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">
              <Home aria-hidden /> Home
            </Link>
          </Button>
        </div>
      </section>
    </PageContainer>
  );
}

/**
 * Wraps a hidden area's pages: in Slim mode a direct link lands on the notice instead of the feature (whose code
 * then never loads). Interface only, never authorization: the area's own checks still run when Slim is off,
 * and its API routes are untouched.
 */
export async function SlimGate({ area, children }: { area: SlimArea["label"]; children: ReactNode }) {
  return (await slimModeOn()) ? <SlimHiddenNotice area={area} /> : children;
}
