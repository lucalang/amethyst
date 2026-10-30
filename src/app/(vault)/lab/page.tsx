import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { LabGallery } from "@/components/lab/lab-gallery";

export const metadata: Metadata = { title: "The Lab" };

export default function LabPage() {
  return (
    <PageContainer>
      <PageHeader title="The Lab" description="Ridiculous interface experiments, safely contained. Poke at them, reset them, walk away whenever you like." />
      <LabGallery />
    </PageContainer>
  );
}
