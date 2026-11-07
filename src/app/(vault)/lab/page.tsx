import type { Metadata } from "next";
import { LabGallery } from "@/components/lab/lab-gallery";
import { LabSite } from "@/components/lab/lab-site";

export const metadata: Metadata = { title: "The Lab" };

export default function LabPage() {
  return (
    <LabSite>
      <LabGallery />
    </LabSite>
  );
}
