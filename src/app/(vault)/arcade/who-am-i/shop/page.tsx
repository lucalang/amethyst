import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Who Am I? shop · Arcade" };

export default function WhoAmIShopPage() {
  return <GameShopPage game="who-am-i" />;
}
