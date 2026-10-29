import type { Metadata, Viewport } from "next";
import { Bungee, Caveat, Fredoka, JetBrains_Mono, Literata, Manrope, Patrick_Hand, Permanent_Marker, Playfair_Display, Press_Start_2P, Special_Elite, VT323 } from "next/font/google";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

// Optional writing fonts (Settings → Editor): not preloaded, so only accounts that pick them download them.
const literata = Literata({ variable: "--font-literata", subsets: ["latin"], display: "swap", preload: false });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], display: "swap", preload: false });
// Theme display fonts (Settings → Themes), likewise only downloaded when a theme or its preview uses them.
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], display: "swap", preload: false });
const vt323 = VT323({ variable: "--font-vt323", weight: "400", subsets: ["latin"], display: "swap", preload: false });
const pressStart = Press_Start_2P({ variable: "--font-press-start", weight: "400", subsets: ["latin"], display: "swap", preload: false });
// Arcade cosmetic fonts (2048 and Sudoku shops), only downloaded when an equipped item or preview uses them.
const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], display: "swap", preload: false });
const specialElite = Special_Elite({ variable: "--font-special-elite", weight: "400", subsets: ["latin"], display: "swap", preload: false });
const permanentMarker = Permanent_Marker({ variable: "--font-permanent-marker", weight: "400", subsets: ["latin"], display: "swap", preload: false });
const bungee = Bungee({ variable: "--font-bungee", weight: "400", subsets: ["latin"], display: "swap", preload: false });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], display: "swap", preload: false });
const patrickHand = Patrick_Hand({ variable: "--font-patrick-hand", weight: "400", subsets: ["latin"], display: "swap", preload: false });

const FONT_VARIABLES = [manrope, literata, jetbrains, playfair, vt323, pressStart, fredoka, specialElite, permanentMarker, bungee, caveat, patrickHand]
  .map((font) => font.variable)
  .join(" ");

export const metadata: Metadata = {
  title: { default: "Amethyst", template: "%s · Amethyst" },
  description: "Amethyst is your private place to organize anything: collections in Archive, tasks in To Do and games in Arcade.",
  applicationName: "Amethyst",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${FONT_VARIABLES} h-full`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
