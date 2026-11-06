import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Tango shop · Arcade" };

export default function TangoShopPage() {
  return <GameShopPage game="tango" />;
}
