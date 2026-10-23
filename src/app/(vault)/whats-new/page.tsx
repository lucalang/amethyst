import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Megaphone, Plus, Sparkles, Wrench } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { MarkUpdatesSeen, PreviewIntroButton } from "@/components/layout/whats-new";
import { CHANGELOG, formatChangeDate, type ChangeItem } from "@/lib/changelog";
import { requireUser } from "@/lib/supabase/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "What’s new" };

const GROUPS = [
  { key: "added", title: "New", icon: Plus, tone: "text-amethyst bg-amethyst/10 ring-amethyst/25" },
  { key: "improved", title: "Improved", icon: Sparkles, tone: "text-rose bg-rose/10 ring-rose/25" },
  { key: "fixed", title: "Fixed", icon: Wrench, tone: "text-muted-foreground bg-white/[0.04] ring-white/[0.1]" },
] as const;

function Item({ item }: { item: ChangeItem }) {
  return (
    <li className="min-w-0 rounded-lg border border-white/[0.06] bg-surface/40 px-4 py-3">
      <p className="text-sm leading-6 text-pretty text-foreground/90">{item.text}</p>
      {item.where || item.link || item.action ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          {item.where ? <span className="text-xs text-muted-foreground">{item.where}</span> : null}
          {item.link ? (
            <Link
              href={item.link.href}
              className="inline-flex items-center gap-1 rounded text-xs font-medium text-amethyst underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.link.label}
              <ArrowRight aria-hidden className="size-3" />
            </Link>
          ) : null}
          {item.action === "preview-intro" ? <PreviewIntroButton /> : null}
        </div>
      ) : null}
    </li>
  );
}

export default async function WhatsNewPage() {
  await requireUser();
  return (
    <EntranceScope>
      <PageContainer className="max-w-4xl">
        <MarkUpdatesSeen />
        <PageHeader title="What’s new" description="Every update to Amethyst Archives, newest first, and where to find each change." />
        <ol className="space-y-10">
          {CHANGELOG.map((entry, index) => (
            <li key={entry.id} className="enter" style={{ "--enter-index": Math.min(index, 4) + 1 } as React.CSSProperties}>
              <article aria-labelledby={`${entry.id}-title`} className="relative border-l border-white/[0.08] pl-5 md:pl-7">
                <span aria-hidden className={cn("absolute top-1.5 -left-[5px] size-2.5 rounded-full ring-4 ring-background", index === 0 ? "bg-amethyst" : "bg-white/25")} />
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <time dateTime={entry.date}>{formatChangeDate(entry.date)}</time>
                  {index === 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amethyst/10 px-2 py-px text-[10px] font-semibold tracking-wide text-amethyst uppercase">
                      <Megaphone aria-hidden className="size-3" /> Latest
                    </span>
                  ) : null}
                </p>
                <h2 id={`${entry.id}-title`} className="mt-1 text-xl font-semibold tracking-tight">
                  {entry.title}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>
                <div className="mt-4 space-y-5">
                  {GROUPS.map((group) => {
                    const items = entry[group.key];
                    if (!items?.length) return null;
                    return (
                      <section key={group.key} aria-label={`${group.title} in ${entry.title}`}>
                        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          <span aria-hidden className={cn("grid size-5 place-items-center rounded ring-1", group.tone)}>
                            <group.icon className="size-3" />
                          </span>
                          {group.title}
                        </h3>
                        <ul className="space-y-2">
                          {items.map((item) => (
                            <Item key={item.text} item={item} />
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              </article>
            </li>
          ))}
        </ol>
      </PageContainer>
    </EntranceScope>
  );
}
