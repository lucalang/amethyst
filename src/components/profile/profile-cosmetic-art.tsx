import type { CSSProperties } from "react";
import { PROFILE_BANNERS, PROFILE_FRAMES, profileBannerStyle, type ProfileBannerId, type ProfileFrameId } from "@/lib/profile-cosmetics";
import { cn } from "@/lib/utils";
import "./profile-showcase.css";

const CORNERS = ["tl", "tr", "bl", "br"] as const;

/** Banner-theme tokens and hooks for an element that hosts showcase art (the stage or a preview). */
export function bannerProps(id: ProfileBannerId) {
  const palette = profileBannerStyle(id);
  return {
    style: palette as CSSProperties | undefined,
    "data-pf-banner": palette ? id : undefined,
    "data-pf-pattern": PROFILE_BANNERS[id].pattern,
  };
}

/** The ornamental profile frame overlay; purely decorative and never interactive. */
export function ProfileFrameArt({ id }: { id: ProfileFrameId }) {
  const frame = PROFILE_FRAMES[id];
  return (
    <div aria-hidden className="pf-frame" data-pf-metal={frame.metal} data-pf-edge={frame.edge}>
      <span className="pf-frame-rule" />
      <span className="pf-frame-mid" data-edge="top" />
      <span className="pf-frame-mid" data-edge="bottom" />
      {CORNERS.map((corner) => (
        <svg key={corner} className="pf-frame-corner" data-corner={corner} viewBox="0 0 48 48">
          <path className="pf-frame-line" d={frame.corner.lines} />
          <path className="pf-frame-gem" d={frame.corner.gem} />
        </svg>
      ))}
    </div>
  );
}

/** A small preview of a banner theme. */
export function BannerSwatch({ id, aura, className }: { id: ProfileBannerId; aura?: string | null; className?: string }) {
  return (
    <span aria-hidden className={cn("pf-banner-swatch", className)} {...bannerProps(id)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny decorative blur of an already-loaded avatar */}
      {aura ? <img src={aura} alt="" decoding="async" className="pf-banner-swatch-aura" /> : null}
      <i />
    </span>
  );
}

/** A small preview of a profile frame (or of no frame). */
export function FrameSwatch({ id, className }: { id: ProfileFrameId | null; className?: string }) {
  return (
    <span aria-hidden className={cn("pf-frame-swatch", className)}>
      {id ? <ProfileFrameArt id={id} /> : <span className="pf-frame-swatch-empty">No frame</span>}
    </span>
  );
}
