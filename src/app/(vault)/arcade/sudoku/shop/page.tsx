import type { Metadata } from "next";
import { GameShopPage } from "@/components/arcade/shop/game-shop-page";

export const metadata: Metadata = { title: "Sudoku shop · Arcade" };

export default function SudokuShopPage() {
  return <GameShopPage game="sudoku" />;
}
