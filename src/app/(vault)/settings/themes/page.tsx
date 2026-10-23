import type { Metadata } from "next";
import { headingsFollowTheme } from "@/lib/appearance";
import { loadPreferences } from "@/lib/data/preferences";
import { THEMES } from "@/lib/themes";
import { requireUser } from "@/lib/supabase/auth";
import { SettingsGroup, SettingsHeader, resetFor } from "../settings-ui";
import { ResetSettingButton } from "../reset-button";
import { CustomHeadingsNote, ThemeSettings } from "../theme-settings";

export const metadata: Metadata = { title: "Themes" };

export default async function ThemesPage() {
  const preferences = await loadPreferences(await requireUser());
  const reset = resetFor(preferences, ["theme"], THEMES.amethyst.name);

  return (
    <>
      <SettingsHeader
        title="Themes"
        description="The look of the whole archive: backgrounds, surfaces, text, accents, fonts and corners. Your choice applies everywhere at once and follows your account to every device."
      />
      <SettingsGroup id="theme" title="Theme">
        <div className="mb-4 flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
          <p id="theme-label" className="text-sm font-medium text-foreground">
            App theme
          </p>
          <ResetSettingButton label="App theme" {...reset} />
        </div>
        <ThemeSettings value={preferences.theme} labelId="theme-label" />
        {headingsFollowTheme(preferences) ? null : <CustomHeadingsNote />}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Themes never change your writing font, text size or other editor choices, and your system’s reduced-motion setting is still respected.
        </p>
      </SettingsGroup>
    </>
  );
}
