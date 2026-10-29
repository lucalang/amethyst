import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Tower Stacker shop · Arcade" };

export default function StackerShopPage() {
  return <GameShopPage game="stacker" />;
}
