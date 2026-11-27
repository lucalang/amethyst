import { describe, expect, it } from "vitest";
import { MIN_ISLAND_TILES, WATER, WIN_SHARE, continueAfterWin, createGame, matchScore, neighbors, step, type Settings } from "@/components/arcade/front-wars/engine";

const settings = (over: Partial<Settings> = {}): Settings => ({ map: "world", difficulty: "normal", bots: 100, nations: true, ...over }) as Settings;

function islands(game: ReturnType<typeof createGame>) {
  const seen = new Uint8Array(game.terrain.length);
  const sizes: number[] = [];
  for (let s = 0; s < game.terrain.length; s += 1) {
    if (game.terrain[s] === WATER || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    let n = 0;
    while (stack.length) {
      const t = stack.pop()!;
      n += 1;
      for (const m of neighbors(t, game.w, game.h)) if (game.terrain[m] !== WATER && !seen[m]) {
          seen[m] = 1;
          stack.push(m);
        }
    }
    sizes.push(n);
  }
  return sizes;
}

describe("Front Wars map", () => {
  it("has no tiny islands except those holding a Nation's home", () => {
    const game = createGame(settings(), 7);
    const small = islands(game).filter((size) => size < MIN_ISLAND_TILES);
    // Only a Nation's own small home may remain (Taiwan is the smallest on the list).
    expect(small.length).toBeLessThanOrEqual(2);
    expect(game.landTiles).toBeGreaterThan(50_000);
  });

  it("lets the player play on after winning and ends only on every tile", () => {
    const game = createGame(settings({ bots: 0, nations: false }), 3);
    const player = game.nations[1];
    game.phase = "battle";
    // Hand the player 80% of the land by hand.
    let given = 0;
    for (let t = 0; t < game.owner.length && given < game.landTiles * 0.8; t += 1) {
      if (game.terrain[t] !== WATER) {
        game.owner[t] = 1;
        given += 1;
      }
    }
    player.tiles = given;
    player.spawned = true;
    step(game);
    expect(game.outcome?.reason).toBe("share");
    expect(player.tiles / game.landTiles).toBeGreaterThanOrEqual(WIN_SHARE);
    expect(continueAfterWin(game)).toBe(true);
    expect(game.outcome).toBeNull();
    step(game);
    expect(game.outcome).toBeNull();
    expect(matchScore(game)).toBeGreaterThan(0);
    // Not allowed twice, nor after a defeat.
    expect(continueAfterWin(game)).toBe(false);
  });
});
