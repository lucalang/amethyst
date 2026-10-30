"use client";

import { PROFILE_BADGES, PROFILE_TITLES, type ProfileBadgeId, type ProfileTitleId } from "@/lib/cosmetics";
import { cn } from "@/lib/utils";
import { useCosmetics } from "./cosmetics-context";

function BadgeArt({ badge }: { badge: ProfileBadgeId }) {
  if (badge === "badge-keyhole") {
    return (
      <>
        <circle cx="16" cy="15" r="8" fill="#a78bfa" opacity="0.35" />
        <path d="M16,8.6 a4,4 0 0 0 -2.3,7.3 L12.6,23 H19.4 L18.3,15.9 A4,4 0 0 0 16,8.6 Z" fill="#ffd36b" stroke="#8a5a00" strokeWidth="0.8" />
        <circle cx="16" cy="12.6" r="1.3" fill="#1d1236" />
        <path d="M15.4,13.6 L14.9,19.6 H17.1 L16.6,13.6 Z" fill="#1d1236" />
      </>
    );
  }
  if (badge === "badge-comet") {
    return (
      <>
        <path d="M19,9.6 L6.5,24.5 L21.6,13.6 Z" fill="#c4b5fd" opacity="0.75" />
        <path d="M19.4,10.6 L10,21.4 L20.8,12.4 Z" fill="#f0abfc" />
        <circle cx="20.6" cy="11.6" r="3.6" fill="#fff1b8" stroke="#ffd36b" strokeWidth="0.8" />
        <circle cx="9.5" cy="9.5" r="0.9" fill="#fff" />
        <circle cx="24" cy="21.5" r="0.7" fill="#fff" opacity="0.8" />
      </>
    );
  }
  return (
    <>
      <circle cx="16" cy="17" r="8.5" fill="#ffd36b" opacity="0.2" />
      <path d="M13.5,9 a2.5,2.5 0 0 1 5,0" fill="none" stroke="#e8b84a" strokeWidth="1.2" />
      <rect x="12" y="9.2" width="8" height="2.3" rx="0.8" fill="#b9862c" />
      <rect x="12.6" y="11.5" width="6.8" height="10" rx="1.6" fill="#ffd36b" stroke="#8a5a00" strokeWidth="0.8" />
      <ellipse cx="16" cy="16.8" rx="1.8" ry="3" fill="#fff7d6" />
      <rect x="11.6" y="21.5" width="8.8" height="2" rx="0.8" fill="#b9862c" />
    </>
  );
}

/** A profile badge: a small round emblem. */
export function BadgeEmblem({ badge, className }: { badge: ProfileBadgeId; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-5 shrink-0", className)} data-badge={badge}>
      <circle cx="16" cy="16" r="15" fill="#1d1236" stroke="#e8b84a" strokeWidth="1.4" />
      <circle cx="16" cy="16" r="12.6" fill="none" stroke="#c4b5fd" strokeOpacity="0.35" strokeWidth="0.8" />
      <BadgeArt badge={badge} />
    </svg>
  );
}

/**
 * The badge and title shown with a name. Defaults to the signed-in account's equipped ones; pass
 * them explicitly to preview. Renders nothing when neither is set.
 */
export function ProfileFlair({ badge, title, className }: { badge?: ProfileBadgeId | null; title?: ProfileTitleId | null; className?: string }) {
  const equipped = useCosmetics();
  const shownBadge = badge === undefined ? equipped.badge : badge;
  const shownTitle = title === undefined ? equipped.title : title;
  if (!shownBadge && !shownTitle) return null;
  return (
    <span className={cn("profile-flair", className)}>
      {shownBadge ? (
        <span className="inline-flex items-center" title={PROFILE_BADGES[shownBadge].name}>
          <BadgeEmblem badge={shownBadge} />
          <span className="sr-only">Badge: {PROFILE_BADGES[shownBadge].name}</span>
        </span>
      ) : null}
      {shownTitle ? <span className="profile-title">{PROFILE_TITLES[shownTitle].name}</span> : null}
    </span>
  );
}
