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
  if (badge === "badge-sovereign") {
    return (
      <>
        <rect x="8.5" y="10.5" width="15" height="13" rx="2.4" fill="#f43f5e" stroke="#fde68a" strokeWidth="1" />
        <path d="M10.5,16 L9.5,11.2 L13.2,13.8 L16,9.5 L18.8,13.8 L22.5,11.2 L21.5,16 Z" fill="#fde68a" stroke="#78350f" strokeWidth="0.6" />
        <polygon points="16,17.2 18.2,19.8 16,22.2 13.8,19.8" fill="#fffbeb" />
      </>
    );
  }
  if (badge === "badge-needle") {
    return (
      <>
        <rect x="9.2" y="7.5" width="3.2" height="17" rx="1" fill="#38bdf8" opacity="0.8" />
        <rect x="19.6" y="7.5" width="3.2" height="17" rx="1" fill="#38bdf8" opacity="0.8" />
        <path d="M7,16 C11,12.5 14,12.5 16,16 C18,12.5 21,12.5 25,16 C21,18.8 18,18.8 16,16 C14,18.8 11,18.8 7,16 Z" fill="#fef08a" stroke="#0284c7" strokeWidth="0.8" />
        <circle cx="16" cy="16" r="1.8" fill="#fff" />
      </>
    );
  }
  if (badge === "badge-ouroboros") {
    return (
      <>
        <circle cx="16" cy="16" r="7.2" fill="none" stroke="#34d399" strokeWidth="2.8" strokeDasharray="39 6" strokeLinecap="round" />
        <circle cx="16" cy="16" r="7.2" fill="none" stroke="#a7f3d0" strokeWidth="1" strokeDasharray="2 3" />
        <polygon points="21.5,10 24.5,11.8 21.2,13.6" fill="#fde68a" />
        <circle cx="22.4" cy="11.5" r="0.7" fill="#064e3b" />
      </>
    );
  }
  if (badge === "badge-aegis") {
    return (
      <>
        <polygon points="16,6.8 23.2,11.2 23.2,20.8 16,25.2 8.8,20.8 8.8,11.2" fill="#be123c" stroke="#fda4af" strokeWidth="0.9" />
        <circle cx="16" cy="14.2" r="2.6" fill="#ffe4e6" />
        <path d="M14.8,15.8 L14,21.5 H18 L17.2,15.8 Z" fill="#ffe4e6" />
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
