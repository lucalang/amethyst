import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Coins, LibraryBig } from "lucide-react";
import { MarqueeArt } from "@/components/home/arcade-marquee";
import { MediaImage } from "@/components/media/media-image";
import { MyDaySummary } from "@/components/tasks/home-my-day";
import { ARCADE_GAMES } from "@/lib/arcade";
import type { HomePreview } from "@/lib/data/home";
import { DESTINATIONS, type DestinationId } from "@/lib/destinations";
import type { Task } from "@/lib/tasks/model";

export type HubData = {
  archive: { collections: number; entries: number; covers: HomePreview[] };
  todo: { tasks: Task[] };
  arcade: { balance: number | null };
};

const COVER_SLOTS: Record<number, string[]> = { 1: ["center"], 2: ["left", "right"], 3: ["left", "center", "right"] };
const plural = (count: number, word: string, many = `${word}s`) => `${count.toLocaleString("en")} ${count === 1 ? word : many}`;

/** Artwork and a live status line for each destination; keyed by id so a new destination must add both. */
const CARDS: Record<DestinationId, { art: (data: HubData) => ReactNode; status: (data: HubData) => ReactNode }> = {
  archive: {
    art: ({ archive }) => {
      const covers = archive.covers.slice(0, 3);
      if (covers.length === 0) {
        return (
          <span className="hub-glyph">
            <LibraryBig />
          </span>
        );
      }
      return covers.map((cover, index) => (
        <span key={cover.id} className="hub-cover" data-slot={COVER_SLOTS[covers.length][index]}>
          <MediaImage src={cover.coverUrl} alt="" fallbackLabel={cover.title} className="text-[10px]" />
        </span>
      ));
    },
    status: ({ archive }) =>
      archive.collections ? (
        <>
          {plural(archive.collections, "collection")} · {plural(archive.entries, "entry", "entries")}
        </>
      ) : (
        "Start your first collection"
      ),
  },
  todo: {
    art: () => (
      <span className="hub-todo">
        <span className="hub-todo-sun" />
        <span className="hub-todo-row" data-done="">
          <span className="hub-todo-check" />
          <span className="hub-todo-line" style={{ width: "58%" }} />
        </span>
        <span className="hub-todo-row" data-next="">
          <span className="hub-todo-check" />
          <span className="hub-todo-line" style={{ width: "74%" }} />
        </span>
        <span className="hub-todo-row">
          <span className="hub-todo-check" />
          <span className="hub-todo-line" style={{ width: "46%" }} />
        </span>
      </span>
    ),
    status: ({ todo }) => <MyDaySummary tasks={todo.tasks} />,
  },
  arcade: {
    art: () => (
      <span className="hub-arcade">
        <MarqueeArt />
        <span className="hub-arcade-sweep" />
      </span>
    ),
    status: ({ arcade }) =>
      arcade.balance === null ? (
        `${ARCADE_GAMES.length} quick games`
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <Coins aria-hidden className="coin-ink size-3.5" />
          <span className="font-semibold text-foreground tabular-nums">{arcade.balance.toLocaleString("en")}</span>
          {arcade.balance === 1 ? "coin" : "coins"} · {ARCADE_GAMES.length} games
        </span>
      ),
  },
};

/** Home's app hub: a large card for each destination in the registry. */
export function DestinationHub({ data, startIndex = 1 }: { data: HubData; startIndex?: number }) {
  return (
    <nav aria-label="Destinations">
      <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {DESTINATIONS.map((destination, index) => {
          const card = CARDS[destination.id];
          const Icon = destination.icon;
          return (
            <li key={destination.id} className="enter min-w-0" style={{ "--enter-index": startIndex + index } as CSSProperties}>
              <Link href={destination.href} data-destination={destination.id} className="hub-card h-full">
                <span aria-hidden className="hub-card-art">
                  {card.art(data)}
                </span>
                <span className="hub-card-body">
                  <span className="hub-card-title">
                    <Icon aria-hidden />
                    {destination.label}
                  </span>
                  <span className="text-sm text-pretty text-muted-foreground">{destination.tagline}</span>
                  <span className="mt-auto pt-2 text-sm text-foreground/80">{card.status(data)}</span>
                </span>
                <ArrowRight aria-hidden className="hub-card-arrow" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
