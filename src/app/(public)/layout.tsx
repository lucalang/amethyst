import type { ReactNode } from "react";
import Link from "next/link";
import { History, LogIn } from "lucide-react";
import { SettingsProvider } from "@/components/layout/settings-context";
import { settingsStyle } from "@/lib/appearance";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { getAuthContext } from "@/lib/supabase/auth";
import VaultLayout from "../(vault)/layout";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  if (await getAuthContext()) return <VaultLayout>{children}</VaultLayout>;
  return (
    <SettingsProvider value={DEFAULT_PREFERENCES}>
      <div className="flex min-h-dvh flex-col" data-app-theme={DEFAULT_PREFERENCES.theme} data-motion={DEFAULT_PREFERENCES.motion}>
        <style>{settingsStyle(DEFAULT_PREFERENCES)}</style>
        <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to content
        </a>
        <header className="border-b border-border bg-background/90">
          <nav aria-label="Public navigation" className="mx-auto flex max-w-[88rem] flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
            <Link href="/login" className="font-bold text-foreground focus-visible:outline-2 focus-visible:outline-ring">Amethyst</Link>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <Link href="/version-history" className="inline-flex items-center gap-1.5 text-amethyst focus-visible:outline-2 focus-visible:outline-ring"><History aria-hidden className="size-4" />Version history</Link>
              <Link href="/login" className="inline-flex items-center gap-1.5 text-foreground focus-visible:outline-2 focus-visible:outline-ring"><LogIn aria-hidden className="size-4" />Sign in</Link>
            </div>
          </nav>
        </header>
        <main id="main" className="flex-1 overflow-x-clip pb-10">{children}</main>
      </div>
    </SettingsProvider>
  );
}