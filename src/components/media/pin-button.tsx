"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Expand, MoreHorizontal, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { useShowcase } from "@/components/showcase/showcase-context";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import { artworkSrc } from "@/lib/attachments";
import { cn } from "@/lib/utils";

/** Optimistic pin state for one entry; follows the server value after refreshes. */
export function usePinToggle(entryId: string, title: string, initial: boolean) {
  const router = useRouter();
  const [pinned, setPinned] = useState(initial);
  const [pending, setPending] = useState(false);
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setPinned(initial);
  }

  async function toggle() {
    if (pending) return;
    const next = !pinned;
    setPinned(next);
    setPending(true);
    try {
      await apiFetch(`/api/entries/${entryId}/pin`, { method: next ? "PUT" : "DELETE" });
      router.refresh();
    } catch (error) {
      setPinned(!next);
      toast.error(`${next ? "Couldn’t pin" : "Couldn’t unpin"} “${title}”: ${errorMessage(error)}`);
    } finally {
      setPending(false);
    }
  }

  return { pinned, pending, toggle };
}

/** Pin or unpin an entry to Home; sits on top of a poster card. */
export function PinButton({ entryId, title, pinned: initial }: { entryId: string; title: string; pinned: boolean }) {
  const { pinned, toggle } = usePinToggle(entryId, title, initial);
  const label = pinned ? `Unpin ${title} from Home` : `Pin ${title} to Home`;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pinned}
      title={pinned ? "Unpin from Home" : "Pin to Home"}
      onClick={() => void toggle()}
      className={cn(
        "poster-pin absolute top-2 left-2 z-[3] grid size-8 place-items-center rounded-md border backdrop-blur-sm transition-[opacity,color,background-color,border-color,scale] duration-200 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-amethyst active:scale-90 pointer-coarse:size-9",
        pinned
          ? "border-amethyst/60 bg-amethyst/85 text-amethyst-foreground opacity-100 hover:bg-amethyst"
          : "border-white/15 bg-black/65 text-white/85 opacity-0 group-hover:opacity-100 hover:border-amethyst/60 hover:text-amethyst pointer-coarse:opacity-100",
      )}
    >
      <Pin aria-hidden className={cn("size-4", pinned && "fill-current")} />
    </button>
  );
}

/** Opens the artwork viewer for a card in a collection; sits beside the pin, revealed on hover. */
export function ViewArtworkButton({ entryId, title, coverUrl }: { entryId: string; title: string; coverUrl: string | null }) {
  const showcase = useShowcase();
  if (!showcase || !artworkSrc(coverUrl)) return null;
  return (
    <button
      type="button"
      aria-label={`View artwork: ${title}`}
      title="View artwork"
      onClick={(event) => showcase.viewArtwork(entryId, event.currentTarget)}
      className="poster-pin absolute top-2 left-11 z-[3] grid size-8 place-items-center rounded-md border border-white/15 bg-black/65 text-white/85 opacity-0 backdrop-blur-sm transition-[opacity,color,border-color,scale] duration-200 outline-none group-hover:opacity-100 hover:border-amethyst/60 hover:text-amethyst focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-amethyst active:scale-90 pointer-coarse:left-12 pointer-coarse:size-9 pointer-coarse:opacity-100"
    >
      <Expand aria-hidden className="size-4" />
    </button>
  );
}

/** Clean-covers actions: a small menu beside the title, never on the artwork. */
export function PosterMenu({
  entryId,
  title,
  href,
  pinned: initial,
  coverUrl = null,
  className,
}: {
  entryId: string;
  title: string;
  href: string;
  pinned: boolean;
  coverUrl?: string | null;
  className?: string;
}) {
  const { pinned, pending, toggle } = usePinToggle(entryId, title, initial);
  const showcase = useShowcase();
  const canView = Boolean(showcase && artworkSrc(coverUrl));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const viewing = useRef(false);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`Actions for ${title}`}
          title="Actions"
          className={cn(
            "poster-menu grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-[color,background-color,opacity] duration-200 outline-none hover:bg-white/[0.07] hover:text-foreground focus-visible:ring-2 focus-visible:ring-amethyst data-[state=open]:bg-white/[0.08] data-[state=open]:text-foreground pointer-coarse:size-9",
            className,
          )}
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-52"
        onCloseAutoFocus={(event) => {
          // The artwork viewer takes focus; don't pull it back to this menu's trigger.
          if (viewing.current) event.preventDefault();
          viewing.current = false;
        }}
      >
        <DropdownMenuLabel className="truncate text-xs font-medium text-muted-foreground">{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={() => void toggle()}>
          {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
          {pinned ? "Unpin from Home" : "Pin to Home"}
        </DropdownMenuItem>
        {canView ? (
          <DropdownMenuItem
            onSelect={() => {
              viewing.current = true;
              showcase?.viewArtwork(entryId, triggerRef.current);
            }}
          >
            <Expand aria-hidden /> View artwork
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={href}>
            <ArrowUpRight aria-hidden /> Open entry
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
