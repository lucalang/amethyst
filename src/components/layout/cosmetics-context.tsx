"use client";

import { createContext, use, type ReactNode } from "react";
import type { AvatarDecorationId, ProfileBadgeId, ProfileTitleId } from "@/lib/cosmetics";

type Cosmetics = {
  /** Ids of the Arcade shop items this account owns. */
  owned: readonly string[];
  avatarDecoration: AvatarDecorationId | null;
  /** The profile badges (in display order) and title shown with the account's name. */
  badges: readonly ProfileBadgeId[];
  title: ProfileTitleId | null;
};

const CosmeticsContext = createContext<Cosmetics>({ owned: [], avatarDecoration: null, badges: [], title: null });

export function CosmeticsProvider({ value, children }: { value: Cosmetics; children: ReactNode }) {
  return <CosmeticsContext value={value}>{children}</CosmeticsContext>;
}

export const useCosmetics = () => use(CosmeticsContext);
