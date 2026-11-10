"use client";

import { useEffect, useSyncExternalStore } from "react";
import { IntentLink as Link } from "./intent-link";
import { usePathname } from "next/navigation";
import { Megaphone, Play } from "lucide-react";
import { PREVIEW_INTRO_EVENT } from "@/components/layout/opening-intro";
import { useSettings } from "@/components/layout/settings-context";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SEEN_KEY = "archive:whats-new-seen";
const SEEN_EVENT = "archive:whats-new-seen";

function readSeen(latestId: string): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return latestId;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SEEN_EVENT, onChange);
  };
}

/** True when this device hasn't opened the latest update yet. False during server rendering. */
function useUnread(latestId: string) {
  return useSyncExternalStore(
    subscribe,
    () => readSeen(latestId) !== latestId,
    () => false,
  );
}

/** Top-bar entry point to the update log, with a dot while there is something unread. `latestId` comes from the server so the log itself never ships to the browser. */
export function WhatsNewButton({ latestId, className }: { latestId: string; className?: string }) {
  const unread = useUnread(latestId);
  const active = usePathname().startsWith("/whats-new");
  const label = unread ? "What’s new (new update)" : "What’s new";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon" className={cn("relative shrink-0", active && "bg-amethyst/10 text-amethyst", className)}>
          <Link href="/whats-new" aria-label={label} aria-current={active ? "page" : undefined}>
            <Megaphone aria-hidden />
            {unread ? <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-rose ring-2 ring-background" /> : null}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">What’s new</TooltipContent>
    </Tooltip>
  );
}

/** Marks the latest update as seen on this device once the log has been opened. */
export function MarkUpdatesSeen({ latestId }: { latestId: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(SEEN_KEY, latestId);
    } catch {
      return;
    }
    window.dispatchEvent(new Event(SEEN_EVENT));
  }, [latestId]);
  return null;
}

/** Plays the opening animation once, without changing the frequency or counting as today's showing. */
export function PreviewIntroButton() {
  const { motion } = useSettings();
  const off = motion === "off";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={off}
      title={off ? "Animations are turned off in Customization → Appearance" : undefined}
      onClick={() => window.dispatchEvent(new Event(PREVIEW_INTRO_EVENT))}
      className="h-8 gap-1.5"
    >
      <Play aria-hidden className="size-3.5" />
      Preview animation
    </Button>
  );
}
