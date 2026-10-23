import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page title for one settings section. */
export function SettingsHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="enter mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight break-words md:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A titled group of related settings. */
export function SettingsGroup({ id, title, description, children, className }: { id: string; title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={cn("enter enter-soft scroll-mt-28 border-t border-white/[0.08] py-7 first-of-type:border-t-0 first-of-type:pt-0", className)}>
      <div className="mb-5">
        <h2 id={`${id}-heading`} className="text-base font-semibold tracking-normal">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** One preference: label and explanation beside (or above, on small screens) its control. */
export function SettingRow({ label, description, labelId, children }: { label: string; description?: ReactNode; labelId?: string; children: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-8">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium text-foreground">{label}</p>
        {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
