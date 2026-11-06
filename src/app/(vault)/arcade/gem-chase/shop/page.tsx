import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Gem Chase shop · Arcade" };

export default function GemChaseShopPage() {
  return <GameShopPage game="gem-chase" />;
}
