import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/app-shell";
import { SettingsSearch } from "@/components/layout/settings-search";
import { SettingsNav } from "../settings/settings-nav";

export default function CustomizationLayout({ children }: { children: ReactNode }) {
  return (
    <PageContainer className="max-w-6xl">
      <SettingsSearch area="Customization" />
      <div className="grid gap-6 md:grid-cols-[13.5rem_minmax(0,1fr)] md:gap-10 lg:gap-14">
        <SettingsNav area="customization" />
        <div className="min-w-0">{children}</div>
      </div>
    </PageContainer>
  );
}