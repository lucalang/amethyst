import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Snake shop · Arcade" };

export default function SnakeShopPage() {
  return <GameShopPage game="snake" />;
}
