import type { CSSProperties } from "react";
import { Compass, Joystick, LibraryBig, LockKeyhole, type LucideIcon } from "lucide-react";
import { AchievementIcon } from "@/components/achievements/achievement-icon";
import type { AchievementDefinition, AchievementGroup } from "@/lib/achievements";
import { cn } from "@/lib/utils";

export type BadgeStyle = {
  label: string;
  emblem: LucideIcon;
  /** clip-path for the medal silhouette; layers are inset copies of it. */
  shape: string;
  ribbon: boolean;
  enamel: { hi: string; mid: string; lo: string };
  /** RGB channels used for halos, edge light, meters and sparks. */
  glow: string;
};

/** One entry per group. New groups only need a style here; the badge CSS is generic. */
export const BADGE_STYLES: Record<AchievementGroup, BadgeStyle> = {
  Arcade: {
    label: "Arcade",
    emblem: Joystick,
    shape: "polygon(29% 0, 71% 0, 100% 29%, 100% 71%, 71% 100%, 29% 100%, 0 71%, 0 29%)",
    ribbon: false,
    enamel: { hi: "#ffb38a", mid: "#f0456e", lo: "#4a0a2c" },
    glow: "255 96 128",
  },
  Archive: {
    label: "Archive",
    emblem: LibraryBig,
    shape: "circle(50% at 50% 50%)",
    ribbon: true,
    enamel: { hi: "#a9c4ff", mid: "#4766e6", lo: "#101a5c" },
    glow: "112 146 255",
  },
  Discovery: {
    label: "Discovery",
    emblem: Compass,
    shape: "polygon(50% 0, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)",
    ribbon: false,
    enamel: { hi: "#9bf7d9", mid: "#17b78f", lo: "#03423a" },
    glow: "46 214 168",
  },
};

export function badgeVars(group: AchievementGroup): CSSProperties {
  const style = BADGE_STYLES[group];
  return {
    "--ach-shape": style.shape,
    "--ach-hi": style.enamel.hi,
    "--ach-mid": style.enamel.mid,
    "--ach-lo": style.enamel.lo,
    "--ach-glow": style.glow,
  } as CSSProperties;
}

type BadgeMotion = "assemble" | "reveal";

export function AchievementBadge({
  achievement,
  earned,
  size = 96,
  motion,
  className,
}: {
  achievement: Pick<AchievementDefinition, "icon" | "group">;
  earned: boolean;
  size?: number;
  /** "assemble" builds the medal piece by piece (celebration); "reveal" swings it into view (details). */
  motion?: BadgeMotion;
  className?: string;
}) {
  const style = BADGE_STYLES[achievement.group];
  return (
    <span
      aria-hidden
      className={cn("ach-badge", motion && `ach-badge--${motion}`, className)}
      data-state={earned ? "earned" : "locked"}
      style={{ ...badgeVars(achievement.group), "--ach-size": `${size}px` } as CSSProperties}
    >
      <span className="ach-badge-halo" />
      {style.ribbon ? <span className="ach-badge-ribbon" /> : null}
      <span className="ach-badge-body">
        <span className="ach-badge-rim" />
        <span className="ach-badge-bevel" />
        <span className="ach-badge-face">
          <span className="ach-badge-engrave" />
          <AchievementIcon name={achievement.icon} className="ach-badge-icon" />
        </span>
        <span className="ach-badge-gloss" />
        <span className="ach-badge-sweep" />
      </span>
      {!earned ? (
        <span className="ach-badge-lock">
          <LockKeyhole />
        </span>
      ) : null}
    </span>
  );
}
