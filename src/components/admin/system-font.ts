import { Barlow_Semi_Condensed, Jost } from "next/font/google";

/** The admin panel's geometric face; only admin routes load it. */
export const systemFont = Jost({ variable: "--font-system", subsets: ["latin"], display: "swap" });

/** Condensed capitals for the console's headings and labels (also painted into the 3D panes). */
export const displayFont = Barlow_Semi_Condensed({ variable: "--font-system-display", subsets: ["latin"], weight: ["500", "600"], display: "swap" });
