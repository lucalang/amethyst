import type { Metadata } from "next";
import Link from "next/link";
import { loadViewerPresets } from "@/lib/data/viewer-presets";
import { requireUser } from "@/lib/supabase/auth";
import { SettingsGroup, SettingsHeader } from "../settings-ui";
import { ShowcaseLookSettings } from "./showcase-look-settings";

export const metadata: Metadata = { title: "3D Showcase" };

export default async function ShowcaseSettingsPage() {
  const presets = await loadViewerPresets(await requireUser());
  return (
    <>
      <SettingsHeader
        title="3D Showcase"
        description="How the 3D artwork viewer stages your art: backdrop, lighting, reflections, glow and motion. Presets never change frames, themes or images, and follow your account to every device."
      />
      <SettingsGroup id="look" title="Look and presets">
        <ShowcaseLookSettings presets={presets} />
        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          You can also adjust the look while viewing artwork: open a collection’s{" "}
          <Link href="/" className="text-amethyst underline-offset-4 hover:underline">
            Showcase
          </Link>
          , open any artwork and use the sliders button at the top. Frames are chosen in{" "}
          <Link href="/settings/frames" className="text-amethyst underline-offset-4 hover:underline">
            Artwork frames
          </Link>
          .
        </p>
      </SettingsGroup>
    </>
  );
}
