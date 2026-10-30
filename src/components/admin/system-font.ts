import { Jost } from "next/font/google";

/** The admin panel's geometric face; only admin routes load it. */
export const systemFont = Jost({ variable: "--font-system", subsets: ["latin"], display: "swap" });
