import type { Metadata } from "next";
import { Disc3 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { SpinWheelStudio } from "@/components/spin-wheel/spin-wheel-studio";
import { loadSpinWheels } from "@/lib/data/spin-wheels";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Spin Wheel" };

export default async function SpinWheelPage({ searchParams }: { searchParams: Promise<{ wheel?: string | string[] }> }) {
  const ctx = await requireUser();
  const [wheels, params] = await Promise.all([loadSpinWheels(ctx), searchParams]);
  const requested = typeof params.wheel === "string" ? params.wheel : null;
  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        title="Spin Wheel"
        description="Put in your own choices, spin, and let the wheel decide. Save wheels to reuse them on any device."
        icon={Disc3}
      />
      <SpinWheelStudio initialWheels={wheels} initialId={wheels.some((wheel) => wheel.id === requested) ? requested : null} />
    </PageContainer>
  );
}
