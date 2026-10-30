"use client";

import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { BadgeEmblem, ProfileFlair } from "@/components/layout/profile-flair";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import { isAvatarDecorationId, isProfileBadgeId, isProfileTitleId, rewardItemInfo } from "@/lib/cosmetics";
import { isArtworkFrameId } from "@/lib/frames";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<ReturnType<typeof rewardItemInfo>["kind"], string> = {
  frame: "Artwork frame",
  avatar_decoration: "Avatar decoration",
  badge: "Profile badge",
  title: "Profile title",
  other: "Exclusive reward",
};

export function rewardKindLabel(id: string): string {
  return KIND_LABELS[rewardItemInfo(id).kind];
}

export function rewardCustomizeHref(id: string): string {
  const { kind } = rewardItemInfo(id);
  return kind === "frame" ? "/customization/frames" : "/customization/profile";
}

/** Real cosmetic artwork for any achievement reward item (no Three.js dependency). */
export function RewardItemVisual({
  id,
  size = "md",
  owner,
  className,
}: {
  id: string;
  size?: "sm" | "md" | "lg";
  owner?: { name?: string | null; avatarUrl?: string | null };
  className?: string;
}) {
  if (isAvatarDecorationId(id)) {
    const avatarSize = size === "lg" ? "size-11 text-sm" : size === "sm" ? "size-6 text-[9px]" : "size-8 text-[10px]";
    return (
      <span className={cn("grid shrink-0 place-items-center", size === "lg" ? "size-14" : size === "sm" ? "size-8" : "size-10", className)}>
        <ProfileAvatar name={owner?.name ?? null} src={owner?.avatarUrl ?? null} decoration={id} className={avatarSize} />
      </span>
    );
  }
  if (isArtworkFrameId(id)) {
    const frameWidth = size === "lg" ? "w-9" : size === "sm" ? "w-5" : "w-7";
    return (
      <span className={cn("grid shrink-0 place-items-center", size === "lg" ? "size-14" : size === "sm" ? "size-8" : "size-10", className)}>
        <ArtworkFrame frame={id} className={frameWidth}>
          <span className="relative block aspect-[2/3] overflow-hidden rounded-[4px] bg-[radial-gradient(circle_at_30%_25%,rgb(var(--accent-rgb)/0.85),transparent_60%),radial-gradient(circle_at_75%_80%,rgb(var(--rose-rgb)/0.65),transparent_55%),linear-gradient(160deg,rgb(var(--accent-soft-rgb)/0.55),rgb(var(--paper-rgb)))]" />
        </ArtworkFrame>
      </span>
    );
  }
  if (isProfileBadgeId(id)) {
    const badgeSize = size === "lg" ? "size-9" : size === "sm" ? "size-5" : "size-7";
    return (
      <span className={cn("grid shrink-0 place-items-center", size === "lg" ? "size-14" : size === "sm" ? "size-8" : "size-10", className)}>
        <BadgeEmblem badge={id} className={badgeSize} />
      </span>
    );
  }
  if (isProfileTitleId(id)) {
    return (
      <span className={cn("inline-flex shrink-0 items-center", className)}>
        <ProfileFlair badge={null} title={id} className={size === "sm" ? "[--flair-size:10px]" : "[--flair-size:11px]"} />
      </span>
    );
  }
  return null;
}
