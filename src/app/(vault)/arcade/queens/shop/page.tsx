import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Queens shop · Arcade" };

export default function QueensShopPage() {
  return <GameShopPage game="queens" />;
}
