"use client";

import dynamic from "next/dynamic";

/**
 * The Shop card's case art, split out of Home's bundle: its code (and the lootbox styles) only downloads when the
 * card is shown, so Slim Amethyst, which hides the Shop card, never loads it.
 */
export const HubCaseArt = dynamic(() => import("@/components/lootboxes/parts").then((module) => module.CaseArt));
