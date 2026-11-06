import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Space Blaster shop · Arcade" };

export default function SpaceBlasterShopPage() {
  return <GameShopPage game="space-blaster" />;
}
