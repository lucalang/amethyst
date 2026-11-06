import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Box,
  Folder,
  Gamepad2,
  House,
  ImageIcon,
  Link2,
  ListChecks,
  Medal,
  Megaphone,
  NotebookPen,
  Palette,
  Plus,
  Shapes,
  Sparkles,
  Tag,
  TriangleAlert,
  Trophy,
  Upload,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { PreviewIntroButton } from "@/components/layout/whats-new";
import { CHANGE_KINDS, type ChangeKind, type Highlight, type ReleaseIcon, type ReleaseNote } from "@/lib/changelog";
import { cn } from "@/lib/utils";

/** `tone` is a CSS color fed to the shared --tone surfaces. */
export const KIND_META: Record<ChangeKind, { label: string; section: string; icon: LucideIcon; tone: string; text: string }> = {
  new: { label: "New", section: "New features", icon: Plus, tone: "var(--amethyst)", text: "text-amethyst" },
  improved: { label: "Improved", section: "Improvements", icon: Sparkles, tone: "var(--rose)", text: "text-rose" },
  fixed: { label: "Fixed", section: "Fixes", icon: Wrench, tone: "var(--muted-foreground)", text: "text-muted-foreground" },
};

export const toneStyle = (tone: string) => ({ "--tone": tone }) as CSSProperties;

const RELEASE_ICONS: Record<ReleaseIcon, LucideIcon> = {
  megaphone: Megaphone,
  palette: Palette,
  box: Box,
  medal: Medal,
  trophy: Trophy,
  gamepad: Gamepad2,
  link: Link2,
  image: ImageIcon,
  home: House,
  shapes: Shapes,
  folder: Folder,
  tag: Tag,
  upload: Upload,
  notebook: NotebookPen,
  sparkles: Sparkles,
  tasks: ListChecks,
};

export function ReleaseGlyph({ icon, hero = false, className }: { icon: ReleaseIcon; hero?: boolean; className?: string }) {
  const Icon = RELEASE_ICONS[icon];
  return (
    <span aria-hidden className={cn(hero ? "ui-hero-icon" : "ui-icon", className)}>
      <Icon className="size-[50%]" />
    </span>
  );
}

export function KindMark({ kind, className }: { kind: ChangeKind; className?: string }) {
  const meta = KIND_META[kind];
  return (
    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border border-(--tone)/40 bg-(--tone)/15 text-(--tone)", className)} style={toneStyle(meta.tone)}>
      <meta.icon aria-hidden className="size-3" />
      <span className="sr-only">{meta.label}:</span>
    </span>
  );
}

export function KindLegend({ className }: { className?: string }) {
  return (
    <ul aria-label="Change types" className={cn("ui-segment items-center gap-1 text-xs text-muted-foreground", className)}>
      {CHANGE_KINDS.map((kind) => (
        <li key={kind} className="flex items-center gap-1.5 rounded-xl px-2.5 py-1">
          <KindMark kind={kind} />
          <span aria-hidden>{KIND_META[kind].label}</span>
        </li>
      ))}
    </ul>
  );
}

/** "3 new · 1 improved" for a release's highlights. */
export function kindCounts(highlights: readonly Highlight[]): string {
  return CHANGE_KINDS.map((kind) => [kind, highlights.filter((item) => item.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${KIND_META[kind].label.toLowerCase()}`)
    .join(" · ");
}

export function previewHighlights(highlights: readonly Highlight[]): Highlight[] {
  const newHighlights = highlights.filter((highlight) => highlight.kind === "new").slice(0, 2);
  const improvedHighlights = highlights.filter((highlight) => highlight.kind === "improved");
  return [...newHighlights, ...improvedHighlights.slice(0, 2 - newHighlights.length)];
}

export function HighlightList({ highlights, className }: { highlights: readonly Highlight[]; className?: string }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {highlights.map((item, index) => (
        <li key={`${item.feature}-${index}`} className="flex gap-3">
          <KindMark kind={item.kind} className="mt-0.5" />
          <p className="min-w-0 text-sm leading-6 text-pretty text-muted-foreground">
            <span className="font-semibold text-foreground">{item.feature}</span>
            <span aria-hidden> — </span>
            <span className="sr-only">: </span>
            {item.text}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function ReleaseNotice({ children }: { children: React.ReactNode }) {
  return (
    <p role="note" className="ui-panel flex gap-3 px-3.5 py-3 text-sm leading-6 text-foreground/90" data-glow style={toneStyle("var(--rose)")}>
      <span aria-hidden className="ui-icon ui-icon-sm">
        <TriangleAlert className="size-3.5" />
      </span>
      <span>
        <span className="font-semibold">Heads up: </span>
        {children}
      </span>
    </p>
  );
}

export function NoteTopic({ note }: { note: ReleaseNote }) {
  return (
    <div className="min-w-0">
      <h3 className="text-base font-semibold tracking-tight">{note.title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-pretty text-foreground/85">{note.body}</p>
      {note.points?.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/85 marker:text-amethyst/60">
          {note.points.map((point) => (
            <li key={point} className="text-pretty">
              {point}
            </li>
          ))}
        </ul>
      ) : null}
      {note.where || note.link || note.action ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {note.where ? (
            <span className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">Where: </span>
              {note.where}
            </span>
          ) : null}
          {note.link ? (
            <Link
              href={note.link.href}
              className="inline-flex items-center gap-1 rounded text-xs font-medium text-amethyst underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {note.link.label}
              <ArrowRight aria-hidden className="size-3" />
            </Link>
          ) : null}
          {note.action === "preview-intro" ? <PreviewIntroButton /> : null}
        </div>
      ) : null}
    </div>
  );
}
