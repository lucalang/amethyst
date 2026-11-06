import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Patches shop · Arcade" };

export default function PatchesShopPage() {
  return <GameShopPage game="patches" />;
}
