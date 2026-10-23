import type { Metadata } from "next";
import { loadPreferences } from "@/lib/data/preferences";
import { requireUser } from "@/lib/supabase/auth";
import { SettingsGroup, SettingsHeader } from "../settings-ui";
import { ShortcutSettings } from "../shortcut-settings";

export const metadata: Metadata = { title: "Shortcuts" };

export default async function ShortcutsPage() {
  const preferences = await loadPreferences(await requireUser());

  return (
    <>
      <SettingsHeader title="Shortcuts" description="Keyboard shortcuts for common actions, anywhere in the archive." />
      <SettingsGroup id="keyboard" title="Keyboard shortcuts">
        <ShortcutSettings value={preferences.shortcuts} />
      </SettingsGroup>
    </>
  );
}
