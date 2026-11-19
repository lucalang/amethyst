import type { ReactNode } from "react";
import { SlimGate } from "@/components/layout/slim-gate";

/** Hidden while Slim Amethyst is on (see lib/slim.ts). */
export default function Layout({ children }: { children: ReactNode }) {
  return <SlimGate area="Achievements">{children}</SlimGate>;
}
