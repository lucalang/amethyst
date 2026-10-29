"use client";

import { useSyncExternalStore } from "react";
import { dailyDate, msUntilDailyReset } from "@/lib/arcade-daily";

const subscribeSecond = (onChange: () => void) => {
  const id = window.setInterval(onChange, 1000);
  return () => window.clearInterval(id);
};
const nowSecond = () => Math.floor(Date.now() / 1000);

/** Today's daily challenge date (UTC); updates when a new challenge starts. */
export function useDailyDate() {
  return useSyncExternalStore(subscribeSecond, () => dailyDate(), () => dailyDate());
}

/** "Nov 3" for a challenge date. */
export function formatDailyDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Time left until the next daily challenge (00:00 UTC), ticking each second. */
export function DailyCountdown() {
  const second = useSyncExternalStore(subscribeSecond, nowSecond, () => 0);
  const left = Math.ceil(msUntilDailyReset(second * 1000) / 1000);
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    <span className="tabular-nums" title="A new challenge starts every day at 00:00 UTC">
      Next challenge in {h}:{pad(m)}:{pad(s)}
    </span>
  );
}
