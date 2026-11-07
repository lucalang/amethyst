"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { LabExperimentId } from "@/lib/lab";

export type LabPoint = { x: number; y: number };

/** Props every experiment gets. `assist` swaps in a plain, accessible version of the joke; `celebrate` plays a success burst (at a viewport point, else the stage centre). */
export type LabProps = { assist: boolean; celebrate: (at?: LabPoint) => void };

const loading = () => (
  <p role="status" className="lab-loading">
    <span aria-hidden>
      <i />
      <i />
      <i />
    </span>
    Warming up the apparatus…
  </p>
);

export const LAB_COMPONENTS: Record<LabExperimentId, ComponentType<LabProps>> = {
  "uphill-volume": dynamic(() => import("./uphill-volume").then((m) => m.UphillVolume), { loading }),
  "runaway-button": dynamic(() => import("./runaway-button").then((m) => m.RunawayButton), { loading }),
  "cancel-maze": dynamic(() => import("./cancel-maze").then((m) => m.CancelMaze), { loading }),
  "awkward-date": dynamic(() => import("./awkward-date").then((m) => m.AwkwardDate), { loading }),
  "password-gauntlet": dynamic(() => import("./password-gauntlet").then((m) => m.PasswordGauntlet), { loading }),
};
