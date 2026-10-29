import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Fruit Slice shop · Arcade" };

export default function FruitSliceShopPage() {
  return <GameShopPage game="fruit-slice" />;
}
