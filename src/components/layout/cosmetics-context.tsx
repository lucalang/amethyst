"use client";

import { createContext, use, type ReactNode } from "react";
import type { AvatarDecorationId } from "@/lib/cosmetics";

type Cosmetics = {
  /** Ids of the Arcade shop items this account owns. */
  owned: readonly string[];
  avatarDecoration: AvatarDecorationId | null;
};

const CosmeticsContext = createContext<Cosmetics>({ owned: [], avatarDecoration: null });

export function CosmeticsProvider({ value, children }: { value: Cosmetics; children: ReactNode }) {
  return <CosmeticsContext value={value}>{children}</CosmeticsContext>;
}

export const useCosmetics = () => use(CosmeticsContext);
