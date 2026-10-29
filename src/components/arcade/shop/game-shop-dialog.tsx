"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import type { ArcadeGameId } from "@/lib/arcade";
import type { GameShopData } from "@/lib/data/shop";
import { GAME_SHOPS, type GameLook } from "@/lib/game-cosmetics";
import { GameShop } from "./game-shop";

/** The game's shop over the paused game; equipping applies to the running game straight away. */
export default function GameShopDialog({
  game,
  open,
  onLook,
  onOpenChange,
}: {
  game: ArcadeGameId;
  open: boolean;
  look: GameLook;
  onLook: (look: GameLook) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const shop = GAME_SHOPS[game];
  const [data, setData] = useState<{ shop: GameShopData; version: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch<GameShopData>(`/api/shop/game?game=${encodeURIComponent(game)}`)
      .then((next) => {
        if (cancelled) return;
        setData((current) => ({ shop: next, version: (current?.version ?? 0) + 1 }));
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, game, attempt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full gap-4 p-4 sm:max-w-5xl md:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Store aria-hidden className="size-5 text-amethyst" />
            {shop.title} shop
          </DialogTitle>
          <DialogDescription>{shop.blurb} Your game is paused and stays exactly as it was.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onOpenChange(false)}>
            <ArrowLeft aria-hidden />
            Back to game
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/arcade/shop">
              <Store aria-hidden />
              Arcade Shop
            </Link>
          </Button>
        </div>
        {data ? (
          <GameShop key={data.version} data={data.shop} onLook={onLook} compact />
        ) : failed ? (
          <div role="alert" className="grid justify-items-start gap-3 rounded-xl border border-border p-4 text-sm text-muted-foreground">
            The shop couldn’t be loaded. Check your connection and try again.
            <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Opening the shop…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
