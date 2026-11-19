"use client";

import dynamic from "next/dynamic";
import type { TimeCollection, TimeEntry } from "@/lib/time-machine";

const TimeMachine = dynamic(() => import("./time-machine"), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid h-[calc(100dvh-7.5rem)] min-h-[30rem] place-items-center text-sm tracking-[0.24em] text-muted-foreground uppercase md:h-[calc(100dvh-3.5rem)]">
      Charging the Time Machine…
    </div>
  ),
});

/** The Time Machine reads the browser (WebGL, the URL, the device's zone), so it only renders on the client. */
export function TimeMachineLoader(props: { entries: TimeEntry[]; collections: TimeCollection[] }) {
  return <TimeMachine {...props} />;
}
