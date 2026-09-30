"use client";

import { useSyncExternalStore } from "react";

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const subscribeToMinutes = (onChange: () => void) => {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
};

/** The browser's local date (YYYY-MM-DD); null during SSR and hydration. */
export function useToday(): string | null {
  return useSyncExternalStore(subscribeToMinutes, localToday, () => null);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const thisYear = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const otherYear = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Friendly due-date label; relative wording only once the local date is known. */
export function describeDue(due: string, today: string | null): { text: string; overdue: boolean } {
  if (today) {
    if (due === today) return { text: "Today", overdue: false };
    if (due === addDays(today, 1)) return { text: "Tomorrow", overdue: false };
    if (due === addDays(today, -1)) return { text: "Yesterday", overdue: true };
  }
  const date = new Date(`${due}T00:00:00Z`);
  const text = today && due.slice(0, 4) === today.slice(0, 4) ? thisYear.format(date) : otherYear.format(date);
  return { text, overdue: today !== null && due < today };
}
