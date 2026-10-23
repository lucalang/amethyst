import type { ReactNode } from "react";
import { settingsStyle } from "@/lib/appearance";
import type { LibraryCategory } from "@/lib/collections";
import type { Preferences } from "@/lib/preferences";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { OpeningIntro } from "./opening-intro";
import { ScrollExitFallback } from "./scroll-exit-fallback";
import { SettingsProvider } from "./settings-context";
import { MobileTabBar, TopNav } from "./top-nav";

export function AppShell({
  children,
  displayName,
  collections,
  collectionIcons,
  userId,
  introSeenOn,
  preferences,
}: {
  children: ReactNode;
  displayName: string;
  collections: LibraryCategory[];
  userId: string;
  introSeenOn: string | null;
  preferences: Preferences;
  /** Server-rendered collection icons keyed by collection id. */
  collectionIcons?: Record<string, ReactNode>;
}) {
  const icons = collectionIcons;
  return (
    <SettingsProvider value={preferences}>
      <div
        className="flex min-h-dvh flex-col"
        data-app-theme={preferences.theme}
        data-motion={preferences.motion}
        data-shine={preferences.cardShine ? "on" : "off"}
      >
        <style>{settingsStyle(preferences)}</style>
        <OpeningIntro userId={userId} lastSeen={introSeenOn} motion={preferences.motion} frequency={preferences.introFrequency} />
        <KeyboardShortcuts collections={collections} />
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <TopNav displayName={displayName} collections={collections} icons={icons} />
        <main id="main" className="flex-1 overflow-x-clip pb-24 md:pb-10">
          {children}
        </main>
        <MobileTabBar collections={collections} icons={icons} />
        <ScrollExitFallback />
      </div>
    </SettingsProvider>
  );
}

export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[88rem] px-4 py-7 md:px-6 md:py-10 ${className}`}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="enter mb-7 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight break-words md:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
