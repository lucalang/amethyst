import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/layout/top-nav";

export function AuthShell({ title, description, children, footer }: { title: string; description: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(640px_circle_at_50%_-8%,rgb(165_124_255/0.18),transparent_70%),radial-gradient(420px_circle_at_85%_110%,rgb(244_114_168/0.08),transparent_70%)]"
      />
      <div className="relative w-full max-w-sm">
        <Link href="/login" className="enter mb-10 inline-flex rounded-md text-lg">
          <BrandMark />
        </Link>
        <div className="enter" style={{ "--enter-index": 1 } as React.CSSProperties}>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1.5 mb-7 text-sm text-muted-foreground">{description}</p>
          {children}
        </div>
        {footer ? (
          <div className="enter mt-8 border-t border-border pt-5 text-sm text-muted-foreground" style={{ "--enter-index": 2 } as React.CSSProperties}>
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
