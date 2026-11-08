"use client";

import { createContext, use, type ReactNode } from "react";

const GuestContext = createContext(false);

export function GuestProvider({ guest, children }: { guest: boolean; children: ReactNode }) {
  return <GuestContext value={guest}>{children}</GuestContext>;
}

/** True in a guest session (Arcade only, no account features). */
export function useGuest() {
  return use(GuestContext);
}
