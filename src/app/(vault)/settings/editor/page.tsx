import type { Metadata } from "next";
import { loadPreferences } from "@/lib/data/preferences";
import { requireUser } from "@/lib/supabase/auth";
import { ChecklistModeSetting, EditorAppearanceSettings } from "../editor-controls";
import { SettingRow, SettingsGroup, SettingsHeader } from "../settings-ui";

export const metadata: Metadata = { title: "Editor" };

export default async function EditorSettingsPage() {
  const preferences = await loadPreferences(await requireUser());

  return (
    <>
      <SettingsHeader title="Editor" description="Make notes and checklists comfortable to write in." />

      <SettingsGroup id="writing" title="Writing">
        <EditorAppearanceSettings settings={preferences} />
      </SettingsGroup>

      <SettingsGroup id="checklists" title="Checklists">
        <SettingRow labelId="checklist-mode-label" label="Completed tasks" description="What happens when you check off a task.">
          <ChecklistModeSetting value={preferences.checklistMode} labelId="checklist-mode-label" />
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
