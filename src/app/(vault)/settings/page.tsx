import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadCollections } from "@/lib/data/collections";
import { loadPreferences } from "@/lib/data/preferences";
import { DEFAULT_SETTINGS } from "@/lib/preferences";
import { requireUser } from "@/lib/supabase/auth";
import { SwitchSetting } from "./setting-controls";
import { SettingRow, SettingsGroup, SettingsHeader, resetFor } from "./settings-ui";
import { PullCutscenesSetting } from "./pull-cutscenes-setting";
import { SfxVolumeSetting } from "./sfx-volume-setting";
import { StartupSetting } from "./startup-setting";
import { TimeZoneSetting } from "./time-zone-setting";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Older links opened the labels of one collection here.
  const { collection } = await searchParams;
  if (typeof collection === "string" && collection) redirect(`/settings/labels?collection=${encodeURIComponent(collection)}`);

  const ctx = await requireUser();
  const [preferences, collections] = await Promise.all([loadPreferences(ctx), loadCollections(ctx)]);

  return (
    <>
      <SettingsHeader title="General" description="Your account, where the app opens, notifications and security." />

      <SettingsGroup id="startup" title="Startup">
        <SettingRow
          labelId="startup-label"
          label="Startup destination"
          description="The first page you see when you open the archive."
          reset={{ keys: ["startup", "startupCollectionId"], changed: preferences.startup !== DEFAULT_SETTINGS.startup, defaultLabel: "Home" }}
        >
          <StartupSetting
            value={preferences.startup}
            collectionId={preferences.startupCollectionId}
            collections={collections.map(({ id, name }) => ({ id, name }))}
            labelId="startup-label"
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="time" title="Date and time">
        <SettingRow
          labelId="time-zone-label"
          label="Time zone"
          description="Decides when a new day starts for My Day in To Do and how due dates count as today. By default this follows the device you're using."
          reset={resetFor(preferences, ["timeZone"], "Device time zone")}
        >
          <TimeZoneSetting value={preferences.timeZone} labelId="time-zone-label" />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="notifications" title="Notifications">
        <div className="space-y-8">
          <SettingRow
            labelId="achievement-notifications-label"
            label="Achievement celebrations"
            description="Play a short celebration when you earn an achievement. It never takes focus and waits until you finish typing or playing. Progress tracking stays on when this is off."
            reset={resetFor(preferences, ["achievementNotifications"], "On")}
          >
            <SwitchSetting
              settingKey="achievementNotifications"
              value={preferences.achievementNotifications}
              labelId="achievement-notifications-label"
              onLabel="Celebrations on"
              offLabel="Celebrations off"
            />
          </SettingRow>
          <SettingRow
            labelId="sound-effects-label"
            label="Sound effects"
            description="Short sounds for Arcade games, completing tasks, shop purchases, case openings, Season Pass rewards, streaks and achievements. The sound button inside a game changes this too."
            reset={resetFor(preferences, ["arcadeSound"], "On")}
          >
            <SwitchSetting settingKey="arcadeSound" value={preferences.arcadeSound} labelId="sound-effects-label" onLabel="Sounds on" offLabel="Sounds off" />
          </SettingRow>
          <SettingRow
            labelId="sfx-volume-label"
            label="SFX Volume"
            description="How loud every sound effect plays, from games and tasks to case openings and the Vault. 0% mutes them without turning Sound effects off."
            reset={resetFor(preferences, ["sfxVolume"], "100%")}
          >
            <SfxVolumeSetting value={preferences.sfxVolume} labelId="sfx-volume-label" />
          </SettingRow>
          <SettingRow
            labelId="pull-cutscenes-label"
            label="Rare pull cutscenes"
            description="Which rarities play a cutscene when you pull them from a case. Higher rarities get bigger scenes; every scene can be skipped. Reduced motion turns them all off."
            reset={resetFor(preferences, ["pullCutscenes"], "All on")}
          >
            <PullCutscenesSetting value={preferences.pullCutscenes} labelId="pull-cutscenes-label" />
          </SettingRow>
        </div>
      </SettingsGroup>

      <SettingsGroup
        id="profile"
        title="Account"
        description={<>Signed in as <span className="text-foreground">{ctx.email ?? "unknown email"}</span>. Your sign-in email and password stay separate from your profile.</>}
      >
        <Button asChild variant="outline">
          <Link href="/customization/profile">
            <UserRound aria-hidden /> Edit profile
          </Link>
        </Button>
      </SettingsGroup>

      <SettingsGroup id="security" title="Security" description="Change your password, or sign out of this device. Your data is private to your account.">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/settings/password">
              <KeyRound aria-hidden /> Change password
            </Link>
          </Button>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline">
              <LogOut aria-hidden /> Sign out
            </Button>
          </form>
        </div>
      </SettingsGroup>
    </>
  );
}
