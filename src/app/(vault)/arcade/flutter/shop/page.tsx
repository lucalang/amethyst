import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Flutter shop · Arcade" };

export default function FlutterShopPage() {
  return <GameShopPage game="flutter" />;
}
