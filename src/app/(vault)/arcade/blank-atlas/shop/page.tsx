import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "The Descent shop · Arcade" };

export default function BlankAtlasShopPage() {
  return <GameShopPage game="blank-atlas" />;
}
