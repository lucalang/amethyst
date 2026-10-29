import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "2048 shop · Arcade" };

export default function G2048ShopPage() {
  return <GameShopPage game="2048" />;
}
