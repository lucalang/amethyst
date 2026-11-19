import Link from "next/link";
import type { ReactNode } from "react";
import { Gem, Home, LogOut, Search } from "lucide-react";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { CosmeticsProvider } from "@/components/layout/cosmetics-context";
import { EditionProvider } from "@/components/layout/edition-context";
import { SettingsProvider } from "@/components/layout/settings-context";
import { settingsStyle } from "@/lib/appearance";
import { collectionPath, type LibraryCategory } from "@/lib/collections";
import { SLIM_BASE, SLIM_NAME } from "@/lib/edition";
import type { Preferences } from "@/lib/preferences";
import { FullSwitch, SlimNavLink } from "./slim-links";
import "./slim.css";

/** Copies the account's theme and motion onto <html> before first paint, like the full app shell. */
const ROOT_ATTRIBUTES_SCRIPT = `(function(){var s=document.currentScript.parentElement.parentElement.dataset,r=document.documentElement.dataset;r.appTheme=s.appTheme;r.motion=s.motion})()`;

/**
 * The Slim edition's shell: a compact bar (home, search, switch to the full app, sign out) and a list of
 * collections. It carries only the providers the archive needs: the account's settings (read-only here), the
 * frames it owns (for the frame picker) and the edition, so shared components link within Slim.
 */
export function SlimShell({
  preferences,
  collections,
  ownedCosmetics,
  name,
  children,
}: {
  preferences: Preferences;
  collections: LibraryCategory[];
  ownedCosmetics: string[];
  name: string | null;
  children: ReactNode;
}) {
  const nav = collections.map((collection) => (
    <li key={collection.id} className="min-w-0">
      <SlimNavLink href={`${SLIM_BASE}${collectionPath(collection)}`} nested>
        <CollectionIcon icon={collection.icon} className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="truncate">{collection.name}</span>
      </SlimNavLink>
    </li>
  ));
  return (
    <SettingsProvider value={preferences}>
      <CosmeticsProvider value={{ owned: ownedCosmetics, avatarDecoration: null, badges: [], title: null }}>
        <EditionProvider edition="slim">
          <div className="slim" data-app-theme={preferences.theme} data-motion={preferences.motion} data-shine="off">
            <style>{settingsStyle(preferences)}</style>
            <div hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `<script>${ROOT_ATTRIBUTES_SCRIPT}</script>` }} />
            <a href="#main" className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
              Skip to content
            </a>
            <header className="slim-bar">
              <Link href={SLIM_BASE} className="slim-brand" aria-label={`${SLIM_NAME} home`}>
                <Gem aria-hidden className="size-5" />
                <span className="hidden sm:inline">{SLIM_NAME}</span>
              </Link>
              <form action={`${SLIM_BASE}/search`} method="get" role="search" className="slim-search">
                <Search aria-hidden className="slim-search-icon" />
                <input type="search" name="q" placeholder="Search entries" aria-label="Search entries" autoComplete="off" />
              </form>
              <nav aria-label={SLIM_NAME} className="flex items-center gap-1">
                <SlimNavLink href={SLIM_BASE} className="slim-icon-link">
                  <Home aria-hidden className="size-4" />
                  <span className="sr-only md:not-sr-only">Home</span>
                </SlimNavLink>
                <FullSwitch />
                <form action="/auth/signout" method="post">
                  <button type="submit" className="slim-icon-link" title={name ? `Sign out ${name}` : "Sign out"}>
                    <LogOut aria-hidden className="size-4" />
                    <span className="sr-only">Sign out</span>
                  </button>
                </form>
              </nav>
            </header>
            <div className="slim-body">
              <aside className="slim-side" aria-label="Collections">
                <div className="slim-side-head">
                  <h2>Collections</h2>
                  <NewCategoryButton label="New" className="h-7 px-2 text-xs" />
                </div>
                <ul className="slim-side-list">{nav}</ul>
              </aside>
              <nav aria-label="Collections" className="slim-strip">
                <ul>{nav}</ul>
              </nav>
              <main id="main" tabIndex={-1} className="slim-main">
                {children}
              </main>
            </div>
          </div>
        </EditionProvider>
      </CosmeticsProvider>
    </SettingsProvider>
  );
}
