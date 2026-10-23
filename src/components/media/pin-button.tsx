"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Pin or unpin an entry to Home; sits on top of a poster card. */
export function PinButton({ entryId, title, pinned: initial }: { entryId: string; title: string; pinned: boolean }) {
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
