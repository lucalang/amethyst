"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { LabExperimentId } from "@/lib/lab";

/** Props every experiment gets. `assist` swaps in a plain, accessible version of the joke. */
export type LabProps = { assist: boolean };

const loading = () => <p className="py-16 text-center text-sm text-muted-foreground">Warming up the apparatus…</p>;

export const LAB_COMPONENTS: Record<LabExperimentId, ComponentType<LabProps>> = {
  "uphill-volume": dynamic(() => import("./uphill-volume").then((m) => m.UphillVolume), { loading }),
  "runaway-button": dynamic(() => import("./runaway-button").then((m) => m.RunawayButton), { loading }),
  "cancel-maze": dynamic(() => import("./cancel-maze").then((m) => m.CancelMaze), { loading }),
  "awkward-date": dynamic(() => import("./awkward-date").then((m) => m.AwkwardDate), { loading }),
  "password-gauntlet": dynamic(() => import("./password-gauntlet").then((m) => m.PasswordGauntlet), { loading }),
};
