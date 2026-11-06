import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/auth";
import { SettingsGroup, SettingsHeader } from "../settings-ui";
import { CutsceneArchive } from "./cutscene-archive";

export const metadata: Metadata = { title: "Other · Settings" };

export default async function OtherSettingsPage() {
  await requireUser();
  return (
    <>
      <SettingsHeader title="Other" description="Older versions of things that have since been replaced, kept around so you can check them out again." />
      <SettingsGroup id="cutscenes" title="Rare pull cutscenes" description="Every version of the scene that plays when you pull a Secret or rarer item. Previews give you nothing; click, press Esc or use Skip to stop one.">
        <CutsceneArchive />
      </SettingsGroup>
    </>
  );
}
