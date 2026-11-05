"use client";

import { useSettings } from "@/components/layout/settings-context";

/** Loading state for /admin in whichever look Special page designs selects. */
export function AdminSkeleton() {
  if (useSettings().specialPages) {
    return (
      <div aria-busy aria-label="Opening the admin panel" className="-mb-24 grid h-[calc(100dvh-3.5rem-1px)] place-items-center bg-[#030203] md:-mb-10">
        <span className="size-16 animate-pulse rounded-full border border-[#ff1f3d]/40 shadow-[0_0_40px_#ff1f3d55]" />
      </div>
    );
  }
  return (
    <div aria-busy aria-label="Opening the admin panel" className="mx-auto w-full max-w-[88rem] px-4 py-7 md:px-6 md:py-10">
      <div className="mb-6 h-10 w-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
