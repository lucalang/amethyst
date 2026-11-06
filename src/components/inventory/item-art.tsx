import type { CSSProperties } from "react";
import { Crown, Flag, Frame, Gamepad2, Image as ImageIcon, Medal, ScrollText, type LucideIcon } from "lucide-react";
import { ARCADE_CABINETS } from "@/components/arcade/previews";
import { CATEGORY_ICONS } from "@/components/arcade/shop/category-icons";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { BadgeEmblem, ProfileFlair } from "@/components/layout/profile-flair";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import { BannerSwatch, FrameSwatch } from "@/components/profile/profile-cosmetic-art";
import { SampleArt, type FrameSample } from "@/app/(vault)/settings/frame-settings";
import { GAME_SHOPS } from "@/lib/game-cosmetics";
import type { InventoryItem, InventoryType } from "@/lib/inventory";
import { cn } from "@/lib/utils";

export type ArtProfile = { name: string | null; avatarUrl: string | null };
export type ArtSamples = { portrait: FrameSample | null; square: FrameSample | null };

export const TYPE_LOOK: Record<InventoryType, { icon: LucideIcon; tone: string }> = {
  frame: { icon: ImageIcon, tone: "#f5b54a" },
  avatar_decoration: { icon: Crown, tone: "#c084fc" },
  profile_banner: { icon: Flag, tone: "#38bdf8" },
  profile_frame: { icon: Frame, tone: "#f472b6" },
  badge: { icon: Medal, tone: "#34d399" },
  title: { icon: ScrollText, tone: "#a78bfa" },
  game: { icon: Gamepad2, tone: "#ff7348" },
};

export const toneOf = (item: InventoryItem) => (item.type === "game" ? ARCADE_CABINETS[item.game].hue : TYPE_LOOK[item.type].tone);
export const toneStyle = (tone: string, enter?: number) => ({ "--tone": tone, ...(enter === undefined ? {} : { "--enter-index": enter }) }) as CSSProperties;

/** An owned item's artwork: frames on sample covers, decorations on the avatar, swatches, emblems and icons. */
export function ItemArt({ item, profile, samples, large = false }: { item: InventoryItem; profile: ArtProfile; samples: ArtSamples; large?: boolean }) {
  switch (item.type) {
    case "frame":
      return (
        <span className={cn("flex items-end justify-center", large ? "gap-5" : "")}>
          <ArtworkFrame frame={item.id} className={large ? "w-[6.5rem] sm:w-[7.25rem]" : "w-[4.5rem]"}>
            <SampleArt sample={samples.portrait} shape="portrait" />
          </ArtworkFrame>
          {large ? (
            <ArtworkFrame frame={item.id} className="w-[7.75rem] sm:w-[8.75rem]">
              <SampleArt sample={samples.square} shape="square" />
            </ArtworkFrame>
          ) : null}
        </span>
      );
    case "avatar_decoration":
      return (
        <span className={cn("flex items-center justify-center", large && "gap-8")}>
          <ProfileAvatar name={profile.name} src={profile.avatarUrl} decoration={item.id} className={large ? "size-28 text-3xl" : "size-16 text-lg"} />
          {large ? <ProfileAvatar name={profile.name} src={profile.avatarUrl} decoration={item.id} className="size-10 text-xs" /> : null}
        </span>
      );
    case "profile_banner":
      return (
        <span className={cn("block max-w-full", large ? "w-72" : "w-40")}>
          <BannerSwatch id={item.id} />
        </span>
      );
    case "profile_frame":
      return (
        <span className={cn("block max-w-full", large ? "w-72" : "w-40")}>
          <FrameSwatch id={item.id} className={large ? "[&_.pf-frame]:[--pf-corner:1.75rem]" : undefined} />
        </span>
      );
    case "badge":
      return <BadgeEmblem badge={item.id} className={large ? "size-28 drop-shadow-[0_10px_24px_rgb(0_0_0/0.45)]" : "size-16 drop-shadow-[0_6px_14px_rgb(0_0_0/0.4)]"} />;
    case "title":
      return (
        <span className={cn("flex max-w-full min-w-0 items-center rounded-xl border border-border bg-card/85 shadow-[0_14px_30px_-20px_rgb(0_0_0/0.8)]", large ? "gap-3 px-4 py-3" : "gap-2 px-2.5 py-2")}>
          <ProfileAvatar name={profile.name} src={profile.avatarUrl} decoration={null} className={large ? "size-11 text-sm" : "size-7 text-[10px]"} />
          <span className="min-w-0 text-left">
            <span className={cn("block truncate font-semibold text-foreground", large ? "text-base" : "text-xs")}>{profile.name ?? "You"}</span>
            <ProfileFlair badges={[]} title={item.id} className={large ? "[--flair-size:0.75rem]" : "[--flair-size:0.6rem]"} />
          </span>
        </span>
      );
    case "game": {
      if (large) return null;
      const Icon = CATEGORY_ICONS[GAME_SHOPS[item.game].categories.find((category) => category.id === item.category)?.icon ?? "sparkles"];
      return (
        <span className="grid size-16 place-items-center rounded-2xl border border-[color-mix(in_oklab,var(--tone)_50%,transparent)] bg-[color-mix(in_oklab,var(--tone)_16%,transparent)] text-(--tone) shadow-[0_14px_30px_-18px_var(--tone)]">
          <Icon aria-hidden className="size-7" />
        </span>
      );
    }
  }
}
