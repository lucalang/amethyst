import type { Metadata } from "next";
import { loadPreferences } from "@/lib/data/preferences";
import { requireUser } from "@/lib/supabase/auth";
import { DensitySetting, HoverScaleSetting, MotionSetting } from "../appearance-controls";
import { CardInfoSetting } from "../card-info-setting";
import { PinStyleSetting } from "../pin-style-setting";
import { SwitchSetting } from "../setting-controls";
import { SettingRow, SettingsGroup, SettingsHeader } from "../settings-ui";

export const metadata: Metadata = { title: "Appearance" };

export default async function AppearancePage() {
  const preferences = await loadPreferences(await requireUser());

  return (
    <>
      <SettingsHeader title="Appearance" description="Motion, effects and how your library is laid out. Changes follow your account to every device." />

      <SettingsGroup id="motion" title="Motion and effects">
        <div className="space-y-8">
          <SettingRow labelId="motion-label" label="Animation intensity" description="How much the interface moves. Your system’s reduced-motion setting is always respected.">
            <MotionSetting value={preferences.motion} labelId="motion-label" />
          </SettingRow>
          <SettingRow labelId="shine-label" label="Card shine" description="The light sweep across a cover when you hover it.">
            <SwitchSetting settingKey="cardShine" value={preferences.cardShine} labelId="shine-label" onLabel="Shine on" offLabel="Shine off" />
          </SettingRow>
          <SettingRow labelId="hover-scale-label" label="Hover scaling" description="How much a cover grows when you point at it.">
            <HoverScaleSetting value={preferences.hoverScale} labelId="hover-scale-label" />
          </SettingRow>
        </div>
      </SettingsGroup>

      <SettingsGroup id="library" title="Library">
        <div className="space-y-8">
          <SettingRow labelId="density-label" label="Library density" description="Cover size and spacing in your collections.">
            <DensitySetting value={preferences.libraryDensity} labelId="density-label" />
          </SettingRow>
          <SettingRow labelId="pin-style-label" label="Cover details" description="Show pins and progress on the artwork, or keep covers clean with details below.">
            <PinStyleSetting value={preferences.pinStyle} labelId="pin-style-label" />
          </SettingRow>
          <SettingRow
            labelId="card-info-label"
            label="Card information"
            description="Which details appear on collection cards. This doesn’t change your cover details style above."
          >
            <CardInfoSetting
              labelId="card-info-label"
              value={{ cardTitle: preferences.cardTitle, cardLabels: preferences.cardLabels, cardProgress: preferences.cardProgress }}
            />
          </SettingRow>
        </div>
      </SettingsGroup>
    </>
  );
}
