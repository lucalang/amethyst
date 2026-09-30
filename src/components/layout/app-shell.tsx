import { Suspense, type ReactNode } from "react";
import { MobileTabBar, TopNav } from "./top-nav";

export function AppShell({ children, displayName }: { children: ReactNode; displayName: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Suspense fallback={<div className="h-14 border-b border-border" />}>
        <TopNav displayName={displayName} />
      </Suspense>
      <main id="main" className="flex-1 pb-24 md:pb-10">
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}

export function PageContainer({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8 ${className}`}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
