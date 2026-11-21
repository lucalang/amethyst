import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Sumbreak shop · Arcade" };

export default function SumbreakShopPage() {
  return <GameShopPage game="sumbreak" />;
}
