"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

// Pathname of the currently mounted scope; cleared on unmount so returning to a page animates again.
let mountedPath: string | null = null;

/**
 * Plays page entrances on real navigations only. When only search params change
 * (filters, sorting), the App Router remounts the page with the same pathname;
 * those remounts skip the entrance instead of replaying it.
 */
export function EntranceScope({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [replay] = useState(() => typeof window !== "undefined" && mountedPath === pathname);

  useEffect(() => {
    mountedPath = pathname;
    return () => {
      if (mountedPath === pathname) mountedPath = null;
    };
  }, [pathname]);

  return (
    <div data-entrance={replay ? "skip" : "play"} className="contents">
      {children}
    </div>
  );
}
