import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "The Ascent shop · Arcade" };

export default function TheAscentShopPage() {
  return <GameShopPage game="the-ascent" />;
}
