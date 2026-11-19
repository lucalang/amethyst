"use client";

import dynamic from "next/dynamic";
import type { TimeCollection, TimeEntry } from "@/lib/time-machine";

const TimeMachine = dynamic(() => import("./time-machine"), {
  ssr: false,
  loading: () => (
    <div role="status" className="fixed inset-0 z-[95] grid place-items-center bg-[#05040a] text-sm tracking-[0.24em] text-white/60 uppercase">
      Charging the Time Machine…
    </div>
  ),
});

/** The Time Machine reads the browser (the device's zone, motion settings, canvas), so it only renders on the client. */
export function TimeMachineLoader(props: { entries: TimeEntry[]; collections: TimeCollection[] }) {
  return <TimeMachine {...props} />;
}
