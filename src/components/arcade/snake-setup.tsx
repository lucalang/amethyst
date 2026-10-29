"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FRUIT_COUNT,
  SNAKE_FRUIT_IDS,
  SNAKE_FRUIT_LABELS,
  SNAKE_MODE_IDS,
  SNAKE_MODES,
  SNAKE_SIZE_IDS,
  SNAKE_SIZES,
  snakeVariant,
  type SnakeFruitChoice,
  type SnakeSetup,
} from "@/lib/snake";
import { cn } from "@/lib/utils";
import { drawFruitChoice } from "./snake-art";

/** The same artwork the board uses, as a small icon. */
export function FruitIcon({ fruit, size = 28, className }: { fruit: SnakeFruitChoice; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawFruitChoice(ctx, fruit, size / 2, size / 2, size * 0.9);
  }, [fruit, size]);
  return <canvas ref={ref} aria-hidden className={cn("shrink-0", className)} style={{ width: size, height: size }} />;
}

export function describeSetup(setup: SnakeSetup) {
  const fruit = setup.fruit === "salad" ? "Fruit Salad" : SNAKE_FRUIT_LABELS[setup.fruit];
  return `${SNAKE_MODES[setup.mode].label} · ${SNAKE_SIZES[setup.size].label} · ${setup.fruitCount} × ${fruit}`;
}

const option =
  "relative flex cursor-pointer rounded-lg border border-border bg-surface/50 transition-colors hover:bg-surface has-checked:border-amethyst has-checked:bg-amethyst/12 has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-60";

function Group({ title, children, hint }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">{title}</legend>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </fieldset>
  );
}

/** Mode, fruit, fruit amount and board size. Changes wait for the next round while one is under way. */
export function SnakeSetupPanel({
  setup,
  onChange,
  locked,
  waiting,
  records,
}: {
  setup: SnakeSetup;
  onChange: (next: SnakeSetup) => void;
  /** A round is in progress: settings can't change. */
  locked: boolean;
  /** The board still shows a finished round; the setup starts with the next one. */
  waiting: boolean;
  records: Record<string, number>;
}) {
  const update = (patch: Partial<SnakeSetup>) => onChange({ ...setup, ...patch });
  const best = records[snakeVariant(setup)];
  const count = setup.fruitCount;

  return (
    <section aria-labelledby="snake-setup-title" className="rounded-xl border border-border bg-surface/40 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="snake-setup-title" className="text-base font-semibold">Game setup</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{best ? `Best here ${best}` : "No best yet"}</span>
      </div>
      {locked ? (
        <p className="mb-3 rounded-lg bg-amethyst/10 px-3 py-2 text-xs text-foreground">Settings are locked during a round. Finish or restart to change them.</p>
      ) : waiting ? (
        <p className="mb-3 rounded-lg bg-amethyst/10 px-3 py-2 text-xs text-foreground">Changes start with your next round.</p>
      ) : null}
      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
        <Group title="Mode">
          <div className="grid grid-cols-2 gap-2">
            {SNAKE_MODE_IDS.map((mode) => (
              <label key={mode} className={cn(option, "flex-col px-3 py-2")}>
                <input
                  type="radio"
                  name="snake-mode"
                  value={mode}
                  checked={setup.mode === mode}
                  onChange={() => update({ mode })}
                  className="sr-only"
                />
                <span className="text-sm font-semibold">{SNAKE_MODES[mode].label}</span>
                <span className="text-xs leading-4 text-muted-foreground">{SNAKE_MODES[mode].blurb}</span>
              </label>
            ))}
          </div>
        </Group>

        <Group title="Fruit" hint="Every fruit is worth 1 point. Fruit Salad mixes them all.">
          <div className="grid grid-cols-4 gap-2">
            {SNAKE_FRUIT_IDS.map((fruit) => (
              <label key={fruit} className={cn(option, "flex-col items-center gap-1 px-1 py-2 text-center")} title={SNAKE_FRUIT_LABELS[fruit]}>
                <input
                  type="radio"
                  name="snake-fruit"
                  value={fruit}
                  checked={setup.fruit === fruit}
                  onChange={() => update({ fruit })}
                  className="sr-only"
                />
                <FruitIcon fruit={fruit} size={30} />
                <span className="text-[0.68rem] leading-3">{SNAKE_FRUIT_LABELS[fruit]}</span>
              </label>
            ))}
          </div>
        </Group>

        <Group title="Fruit on the board" hint="Eaten fruit is replaced right away while there is room.">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-surface/50">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8"
                aria-label="Less fruit"
                disabled={count <= FRUIT_COUNT.min}
                onClick={() => update({ fruitCount: count - 1 })}
              >
                <Minus aria-hidden />
              </Button>
              <output aria-live="polite" className="w-7 text-center text-sm font-semibold tabular-nums">{count}</output>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-8"
                aria-label="More fruit"
                disabled={count >= FRUIT_COUNT.max}
                onClick={() => update({ fruitCount: count + 1 })}
              >
                <Plus aria-hidden />
              </Button>
            </div>
            <div className="flex gap-1" role="group" aria-label="Fruit amount presets">
              {FRUIT_COUNT.presets.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={count === preset ? "secondary" : "ghost"}
                  aria-pressed={count === preset}
                  className="h-8 min-w-8 px-2 tabular-nums"
                  onClick={() => update({ fruitCount: preset })}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </div>
        </Group>

        <Group title="Board size">
          <div className="grid grid-cols-3 gap-2">
            {SNAKE_SIZE_IDS.map((size) => (
              <label key={size} className={cn(option, "flex-col items-center px-2 py-2")}>
                <input
                  type="radio"
                  name="snake-size"
                  value={size}
                  checked={setup.size === size}
                  onChange={() => update({ size })}
                  className="sr-only"
                />
                <span className="text-sm font-semibold">{SNAKE_SIZES[size].label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {SNAKE_SIZES[size].grid} × {SNAKE_SIZES[size].grid}
                </span>
              </label>
            ))}
          </div>
        </Group>
      </fieldset>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Best scores are kept separately for each mode, board size and fruit amount.
      </p>
    </section>
  );
}
