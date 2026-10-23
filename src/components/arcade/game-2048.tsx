"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { swipeDirection } from "./engine";
import { GameOverlay, GameShell, Stat, keyDirection, useArcade, useGameKeys, useRecord } from "./game-shell";
import { GOAL, SIZE, hasMoves, newBoard, slide, type Board, type Direction } from "./logic-2048";

type Phase = "playing" | "won" | "over";

const CELLS = Array.from({ length: SIZE * SIZE }, (_, cell) => cell);

/** Color strength from 2 (faint) to 2048 (full accent). */
const strength = (value: number) => Math.min(1, (Math.log2(value) - 1) / 10);
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
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Leaving mid-game still keeps a new best.
  useEffect(() => {
    const score = scoreRef;
    return () => {
      submit(score.current, { keepalive: true });
    };
  }, [submit]);

  function move(direction: Direction) {
    if (phase !== "playing") return;
    const result = slide(board, direction);
    if (!result.moved) return;
    setBoard(result.board);
    scoreRef.current = result.board.score;
    if (result.gained) {
      setGain({ key: result.board.score, value: result.gained });
      play("merge", Math.min(1.8, 0.85 + Math.log2(result.largestMerge) / 14));
    } else {
      play("move");
    }
    if (!continued && result.largestMerge >= GOAL) {
      setPhase("won");
      submit(result.board.score);
      play("win");
    } else if (!hasMoves(result.board)) {
      setPhase("over");
      submit(result.board.score);
      play("over");
    }
  }

  function restart() {
    submit(scoreRef.current);
    scoreRef.current = 0;
    setBoard(newBoard());
    setPhase("playing");
    setContinued(false);
    setGain(null);
    boardRef.current?.focus({ preventScroll: true });
  }

  function keepPlaying() {
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
      title="2048"
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
          {board.tiles.map((tile) => {
            const t = strength(tile.value);
            return (
              <div
                key={tile.id}
                className={cn(
                  "g2048-tile",
                  t >= 0.55 && "is-strong",
                  tile.value > GOAL && "is-super",
                  tile.merged && "is-merged",
                  tile.fresh && "is-fresh",
                  tile.consumed && "is-consumed",
                )}
                aria-hidden={tile.consumed || undefined}
                style={{ "--r": tile.row, "--c": tile.col, "--t": t, "--fs": fontScale(tile.value) } as CSSProperties}
              >
                {tile.value}
              </div>
            );
          })}
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
          </GameOverlay>
        ) : phase === "over" ? (
          <GameOverlay
            title="No moves left"
            actions={<Button size="sm" onClick={restart} autoFocus>Play again</Button>}
          >
            Score {score.toLocaleString("en")}
            {score > 0 && score >= best ? " · new best!" : ` · best ${shownBest.toLocaleString("en")}`}
          </GameOverlay>
        ) : null}
      </div>
    </GameShell>
  );
}
