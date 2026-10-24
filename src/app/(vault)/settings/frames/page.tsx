import type { Metadata } from "next";
import Link from "next/link";
import { artworkSrc } from "@/lib/attachments";
import { loadPreferences } from "@/lib/data/preferences";
import { ARTWORK_FRAMES } from "@/lib/frames";
import { requireUser } from "@/lib/supabase/auth";
import { FrameSettings, type FrameSample } from "../frame-settings";
import { ResetSettingButton } from "../reset-button";
import { SettingsGroup, SettingsHeader, resetFor } from "../settings-ui";

export const metadata: Metadata = { title: "Artwork frames" };

export default async function ArtworkFramesPage() {
  const ctx = await requireUser();
  const [preferences, { data: covers }] = await Promise.all([
    loadPreferences(ctx),
    // A few of the account's own covers to preview frames on (row-level security keeps this to the account).
    ctx.supabase.from("entries").select("title, cover_url, cover_shape").not("cover_url", "is", null).order("updated_at", { ascending: false }).limit(40),
  ]);
  const sample = (shape: "portrait" | "square"): FrameSample | null => {
    const row = (covers ?? []).find((cover) => cover.cover_shape === shape && artworkSrc(cover.cover_url));
    return row?.cover_url ? { title: row.title, coverUrl: row.cover_url } : null;
  };
  const reset = resetFor(preferences, ["artworkFrame"], ARTWORK_FRAMES.none.name);

  return (
    <>
      <SettingsHeader
        title="Artwork frames"
        description="A decorative frame around artwork in Showcase and the artwork viewer, including the 3D card. Frames sit around the edges, never over the picture, and follow your account to every device. This is your default: any entry can choose its own frame in Edit details, and entries set to “Use my default” follow this choice."
      />
      <SettingsGroup id="frame" title="Frame">
        <div className="mb-4 flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
          <p id="frame-label" className="text-sm font-medium text-foreground">
            Artwork frame
          </p>
          <ResetSettingButton label="Artwork frame" {...reset} />
        </div>
        <FrameSettings value={preferences.artworkFrame} labelId="frame-label" portrait={sample("portrait")} square={sample("square")} />
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Frames don’t change your theme, library cards, collection banners or images in notes. Animated frames hold still when animations are off or your system asks
          for reduced motion. Open any collection and choose{" "}
          <Link href="/" className="text-amethyst underline-offset-4 hover:underline">
            Showcase
          </Link>{" "}
          to see yours. Unlock more frames with coins from the{" "}
          <Link href="/arcade/shop" className="text-amethyst underline-offset-4 hover:underline">
            Arcade shop
          </Link>
          .
        </p>
      </SettingsGroup>
    </>
  );
}
