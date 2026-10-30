import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/layout/app-shell";
import { LabShell } from "@/components/lab/lab-shell";
import { findLabExperiment } from "@/lib/lab";

type Props = { params: Promise<{ experiment: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const experiment = findLabExperiment((await params).experiment);
  return { title: experiment ? `${experiment.title} · The Lab` : "The Lab" };
}

export default async function LabExperimentPage({ params }: Props) {
  const experiment = findLabExperiment((await params).experiment);
  if (!experiment) notFound();
  return (
    <PageContainer>
      <LabShell id={experiment.id} title={experiment.title} blurb={experiment.blurb} />
    </PageContainer>
  );
}
