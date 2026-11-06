import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Zip shop · Arcade" };

export default function ZipShopPage() {
  return <GameShopPage game="zip" />;
}
