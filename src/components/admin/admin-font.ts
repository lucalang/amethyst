import { Cinzel } from "next/font/google";

/** Engraved capitals for the Sanctum's titles and numbers; only admin routes load it. */
export const sanctumFont = Cinzel({ variable: "--font-sanctum", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });
