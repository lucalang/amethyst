import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { settingsStyle } from "@/lib/appearance";
import type { AvatarDecorationId, ProfileBadgeId, ProfileTitleId } from "@/lib/cosmetics";
import type { LibraryCategory } from "@/lib/collections";
import type { Preferences } from "@/lib/preferences";
import { AchievementNotifications } from "@/components/achievements/achievement-notifications";
import { CosmeticsProvider } from "./cosmetics-context";
import { CurrentCollectionProvider } from "./current-collection";
import { GuestBar } from "./guest-bar";
import { GuestProvider } from "./guest-context";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { OpeningIntro } from "./opening-intro";
import { ScrollExitFallback } from "./scroll-exit-fallback";
import { SettingsProvider } from "./settings-context";
import { MobileTabBar, TopNav, type AccountSummary } from "./top-nav";

/** Copies the shell's theme and motion onto <html> before first paint (SettingsProvider keeps them in sync). */
const ROOT_ATTRIBUTES_SCRIPT = `(function(){var s=document.currentScript.parentElement.parentElement.dataset,r=document.documentElement.dataset;r.appTheme=s.appTheme;r.motion=s.motion})()`;

export function AppShell({
  children,
  account,
  collections,
  collectionIcons,
  userId,
  introSeenOn,
  preferences,
  cosmetics,
  latestChangeId,
}: {
  children: ReactNode;
  account: AccountSummary;
  collections: LibraryCategory[];
  userId: string;
  introSeenOn: string | null;
  preferences: Preferences;
  /** Arcade shop items the account owns, its avatar decoration and its profile badges and title. */
  cosmetics: { owned: string[]; avatarDecoration: AvatarDecorationId | null; badges: ProfileBadgeId[]; title: ProfileTitleId | null };
  /** Server-rendered collection icons keyed by collection id. */
  collectionIcons?: Record<string, ReactNode>;
  /** Newest update-log id, passed in so the log itself stays out of client bundles. */
  latestChangeId: string;
}) {
  const icons = collectionIcons;
  const guest = Boolean(account.guest);
  return (
    <SettingsProvider value={preferences}>
      <GuestProvider guest={guest}>
      <CosmeticsProvider value={cosmetics}>
      <CurrentCollectionProvider>
      <div
        className="flex min-h-dvh flex-col"
        data-app-theme={preferences.theme}
        data-motion={preferences.motion}
        data-shine={preferences.cardShine ? "on" : "off"}
      >
        <style>{settingsStyle(preferences)}</style>
        <div hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `<script>${ROOT_ATTRIBUTES_SCRIPT}</script>` }} />
        {guest ? null : <OpeningIntro userId={userId} lastSeen={introSeenOn} motion={preferences.motion} frequency={preferences.introFrequency} />}
        <KeyboardShortcuts collections={collections} />
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <TopNav account={account} collections={collections} icons={icons} latestChangeId={latestChangeId} />
        {guest ? <GuestBar /> : null}
        <main id="main" tabIndex={-1} className="flex-1 overflow-x-clip pb-24 md:pb-10">
          {children}
        </main>
        {guest ? null : <AchievementNotifications enabled={preferences.achievementNotifications} />}
        <MobileTabBar collections={collections} icons={icons} />
        <ScrollExitFallback />
      </div>
      </CurrentCollectionProvider>
      </CosmeticsProvider>
      </GuestProvider>
    </SettingsProvider>
  );
}

export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[88rem] px-4 py-7 md:px-6 md:py-10 ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon,
  tone,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  /** Any CSS color; tints the header glow and icon (defaults to the theme accent). */
  tone?: string;
}) {
  return (
    <div className="ui-hero enter mb-7 flex flex-wrap items-end justify-between gap-3" style={tone ? ({ "--tone": tone } as CSSProperties) : undefined}>
      <div className="flex min-w-0 items-center gap-4">
        {Icon ? (
          <span aria-hidden className="ui-hero-icon">
            <Icon className="size-6" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight break-words md:text-3xl">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
