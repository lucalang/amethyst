import Link from "next/link";
import {
  ArrowRight,
  Box,
  Folder,
  Gamepad2,
  House,
  ImageIcon,
  Link2,
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

export const KIND_META: Record<ChangeKind, { label: string; section: string; icon: LucideIcon; tone: string; text: string }> = {
  new: { label: "New", section: "New features", icon: Plus, tone: "bg-amethyst/12 text-amethyst ring-amethyst/30", text: "text-amethyst" },
  improved: { label: "Improved", section: "Improvements", icon: Sparkles, tone: "bg-rose/10 text-rose ring-rose/30", text: "text-rose" },
  fixed: { label: "Fixed", section: "Fixes", icon: Wrench, tone: "bg-white/[0.05] text-muted-foreground ring-white/[0.14]", text: "text-muted-foreground" },
};

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
};

export function ReleaseGlyph({ icon, className }: { icon: ReleaseIcon; className?: string }) {
  const Icon = RELEASE_ICONS[icon];
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-lg bg-amethyst/10 text-amethyst ring-1 ring-amethyst/20", className)}>
      <Icon className="size-[55%]" />
    </span>
  );
}

export function KindMark({ kind, className }: { kind: ChangeKind; className?: string }) {
  const meta = KIND_META[kind];
  return (
    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full ring-1", meta.tone, className)}>
      <meta.icon aria-hidden className="size-3" />
      <span className="sr-only">{meta.label}:</span>
    </span>
  );
}

export function KindLegend({ className }: { className?: string }) {
  return (
    <ul aria-label="Change types" className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground", className)}>
      {CHANGE_KINDS.map((kind) => (
        <li key={kind} className="flex items-center gap-1.5">
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

export function HighlightList({ highlights, className }: { highlights: readonly Highlight[]; className?: string }) {
  return (
    <ul className={cn("space-y-2.5", className)}>
      {highlights.map((item) => (
        <li key={item.feature} className="flex gap-3">
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
    <p role="note" className="flex gap-2 rounded-md border-l-2 border-rose bg-rose/[0.06] px-3 py-2 text-sm leading-6 text-foreground/90">
      <TriangleAlert aria-hidden className="mt-1 size-4 shrink-0 text-rose" />
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
