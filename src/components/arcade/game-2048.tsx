"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { swipeDirection } from "./engine";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { GameOverlay, GameShell, Stat, keyDirection, sendAchievementEvent, useArcade, useGameAchievementTracking, useGameKeys, useRecord } from "./game-shell";
import { GOAL, SIZE, hasMoves, newBoard, slide, type Board, type Direction } from "./logic-2048";

type Phase = "playing" | "won" | "over";

const CELLS = Array.from({ length: SIZE * SIZE }, (_, cell) => cell);

/** Palette step: 1 for a 2 up to 11 for 2048; 12 for anything beyond (styled in globals.css). */
const tileStep = (value: number) => Math.min(12, Math.log2(value));
const fontScale = (value: number) => {
  const digits = String(value).length;
  return digits <= 2 ? 0.46 : digits === 3 ? 0.38 : digits === 4 ? 0.3 : 0.24;
};

export default function Game2048({ best: initialBest }: { best: number | null }) {
  const { play, effects } = useArcade();
  const { best, submit } = useRecord("2048", initialBest);
  const [board, setBoard] = useState<Board>(newBoard);
  const [phase, setPhase] = useState<Phase>("playing");
  const [continued, setContinued] = useState(false);
  const [gain, setGain] = useState<{ key: number; value: number } | null>(null);
  const scoreRef = useRef(0);
    const maxTile = useRef(2);
  // After "Keep going", coins count only the points scored since the win (the win already paid).
  const baseline = useRef(0);
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("2048");
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useGameAchievementTracking("2048", phase);

  // Leaving mid-game still keeps a new best (and counts the run's coins).
  useEffect(() => {
    const score = scoreRef;
    const tile = maxTile;
    const from = baseline;
    return () => {
      submit(score.current, { keepalive: true });
      finishRun(score.current - from.current, { maxTile: tile.current }, { keepalive: true });
      if (tile.current > 2) sendAchievementEvent({ type: "run_progress", game: "2048", maxTile: tile.current });
    };
  }, [submit, finishRun]);

  function settle(total: number, options?: { announce?: boolean }) {
    finishRun(total - baseline.current, { maxTile: maxTile.current }, options);
  }

  function move(direction: Direction) {
    if (phase !== "playing") return;
    const result = slide(board, direction);
    if (!result.moved) return;
    beginRun();
    setBoard(result.board);
    scoreRef.current = result.board.score;
    maxTile.current = Math.max(maxTile.current, result.largestMerge);
    if (result.gained) {
      setGain({ key: result.board.score, value: result.gained });
      play("merge", Math.min(1.8, 0.85 + Math.log2(result.largestMerge) / 14));
    } else {
      play("move");
    }
    if (!continued && result.largestMerge >= GOAL) {
      setPhase("won");
      submit(result.board.score);
      settle(result.board.score);
      sendAchievementEvent({ type: "run_finished", game: "2048", maxTile: maxTile.current });
      play("win");
    } else if (!hasMoves(result.board)) {
      setPhase("over");
      submit(result.board.score);
      settle(result.board.score);
      sendAchievementEvent({ type: "run_finished", game: "2048", maxTile: maxTile.current });
      play("over");
    }
  }

  function restart() {
    if (phase !== "playing") sendAchievementEvent({ type: "run_finished", game: "2048", maxTile: maxTile.current });
    submit(scoreRef.current);
    settle(scoreRef.current, { announce: true });
    scoreRef.current = 0;
    baseline.current = 0;
    maxTile.current = 2;
    setBoard(newBoard());
    setPhase("playing");
    setContinued(false);
    setGain(null);
    boardRef.current?.focus({ preventScroll: true });
  }

  function keepPlaying() {
    baseline.current = scoreRef.current;
    setContinued(true);
    setPhase("playing");
    boardRef.current?.focus({ preventScroll: true });
  }

  useGameKeys((event) => {
    const direction = keyDirection(event);
    if (!direction) return false;
    move(direction);
    return true;
  });

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== event.pointerId) return;
    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y, 24);
    if (direction) move(direction);
  }

  const score = board.score;
  const shownBest = Math.max(best, score);

  return (
    <GameShell
      game="2048"
      title="2048"
      active={phase === "playing"}
      stats={
        <>
          <Stat
            label="Score"
            value={
              <span className="relative">
                {score.toLocaleString("en")}
                {gain && effects !== "off" ? (
                  <span key={gain.key} aria-hidden className="g2048-gain">
                    +{gain.value.toLocaleString("en")}
                  </span>
                ) : null}
              </span>
            }
          />
          <Stat label="Best" value={shownBest.toLocaleString("en")} highlight={score > 0 && score >= best} />
        </>
      }
      actions={
        <Button variant="outline" size="sm" className="h-8" onClick={restart}>
          <RotateCcw aria-hidden />
          New game
        </Button>
      }
      help="Use the arrow keys (or WASD), or swipe on the board. Matching tiles merge once per move; reach 2048 to win, then keep going if you like."
    >
      <div className="arcade-stage [--stage-h:min(62dvh,34rem)] [--stage-ratio:1]">
        <div
          ref={boardRef}
          tabIndex={-1}
          role="group"
          aria-label={`2048 board, score ${score}. Use the arrow keys or swipe to move the tiles.`}
          className="g2048 outline-none"
          data-effects={effects}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipe.current = null)}
        >
          {CELLS.map((cell) => (
            <div key={cell} aria-hidden className="g2048-cell" style={{ "--r": Math.floor(cell / SIZE), "--c": cell % SIZE } as CSSProperties} />
          ))}
          {board.tiles.map((tile) => (
            <div
              key={tile.id}
              data-step={tileStep(tile.value)}
              className={cn("g2048-tile", tile.merged && "is-merged", tile.fresh && "is-fresh", tile.consumed && "is-consumed")}
              aria-hidden={tile.consumed || undefined}
              style={{ "--r": tile.row, "--c": tile.col, "--fs": fontScale(tile.value) } as CSSProperties}
            >
              {tile.value}
            </div>
          ))}
        </div>
        {phase === "won" ? (
          <GameOverlay
            title="You made 2048!"
            actions={
              <>
                <Button size="sm" onClick={keepPlaying} autoFocus>Keep going</Button>
                <Button size="sm" variant="outline" onClick={restart}>New game</Button>
              </>
            }
          >
            Score {score.toLocaleString("en")}
            {score >= best ? " · new best" : ""}
            <CoinReward state={coins} />
          </GameOverlay>
        ) : phase === "over" ? (
          <GameOverlay
            title="No moves left"
            actions={<Button size="sm" onClick={restart} autoFocus>Play again</Button>}
          >
            Score {score.toLocaleString("en")}
            {score > 0 && score >= best ? " · new best!" : ` · best ${shownBest.toLocaleString("en")}`}
            <CoinReward state={coins} />
          </GameOverlay>
        ) : null}
      </div>
    </GameShell>
  );
}
