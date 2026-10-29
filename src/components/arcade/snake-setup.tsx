"use client";

import { useEffect, useRef, type ComponentType, type ReactNode, type SVGProps } from "react";
import {
  ArrowLeftRight,
  Bird,
  Blender,
  Bomb,
  BrickWall,
  Contrast,
  Flashlight,
  Flower2,
  Gamepad2,
  Ghost,
  Hourglass,
  InfinityIcon,
  KeyRound,
  Landmark,
  Layers,
  Lock,
  Minus,
  Mountain,
  Orbit,
  Package,
  Plus,
  Skull,
  Timer,
  Trophy,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BLEND_MODE_IDS,
  FRUIT_COUNT,
  SNAKE_FRUIT_IDS,
  SNAKE_FRUIT_LABELS,
  SNAKE_MODE_IDS,
  SNAKE_MODES,
  SNAKE_SIZE_IDS,
  SNAKE_SIZES,
  activeModes,
  blendClash,
  snakeVariant,
  type BlendMode,
  type SnakeFruitChoice,
  type SnakeMode,
  type SnakeSetup,
  type SnakeSize,
} from "@/lib/snake";
import { cn } from "@/lib/utils";
import { drawFruitChoice } from "./snake-art";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** A wedge of cheese with holes, drawn like the other line icons. */
function CheeseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 17 21 8v11H3z" />
      <path d="M3 17 13 4l8 4" />
      <circle cx="9" cy="16" r="1" />
      <circle cx="15.5" cy="14.5" r="1.5" />
      <circle cx="17" cy="18" r="0.6" />
    </svg>
  );
}

/** Icon and accent color per mode; new modes add a row here. */
const MODE_LOOK: Record<SnakeMode, { icon: Icon; color: string }> = {
  classic: { icon: Gamepad2, color: "#4fcf6a" },
  wrap: { icon: InfinityIcon, color: "#38bdf8" },
  peace: { icon: Flower2, color: "#f9a8d4" },
  obstacles: { icon: Mountain, color: "#a8a29e" },
  wall: { icon: BrickWall, color: "#e2725b" },
  portal: { icon: Orbit, color: "#a77bff" },
  twin: { icon: ArrowLeftRight, color: "#fbbf24" },
  winged: { icon: Bird, color: "#7dd3fc" },
  yinyang: { icon: Contrast, color: "#e5e7eb" },
  cheese: { icon: CheeseIcon, color: "#facc15" },
  ghost: { icon: Ghost, color: "#bae6fd" },
  key: { icon: KeyRound, color: "#f5b700" },
  sokoban: { icon: Package, color: "#d39457" },
  poison: { icon: Skull, color: "#a3a3b8" },
  statue: { icon: Landmark, color: "#a7b0a2" },
  light: { icon: Flashlight, color: "#fde68a" },
  dimension: { icon: Layers, color: "#2dd4bf" },
  minesweeper: { icon: Bomb, color: "#ff6a2e" },
  timed: { icon: Timer, color: "#60a5fa" },
  blender: { icon: Blender, color: "#f472b6" },
};

export function ModeIcon({ mode, className }: { mode: SnakeMode; className?: string }) {
  const { icon: Glyph, color } = MODE_LOOK[mode];
  return <Glyph aria-hidden className={className} style={{ color }} />;
}

/** A board-size glyph: more lines for bigger boards. */
function SizeIcon({ size, className }: { size: SnakeSize; className?: string }) {
  const n = { small: 2, medium: 3, large: 4 }[size];
  const lines = Array.from({ length: n - 1 }, (_, i) => 4 + ((i + 1) * 16) / n);
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden className={className}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      {lines.map((p) => (
        <g key={p} strokeWidth={1.4}>
          <path d={`M${p} 4v16`} />
          <path d={`M4 ${p}h16`} />
        </g>
      ))}
    </svg>
  );
}

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

/** "Portal", or a mix such as "Portal + Ghost". */
export function setupTitle(setup: SnakeSetup) {
  if (setup.mode !== "blender") return SNAKE_MODES[setup.mode].label;
  const modes = activeModes(setup);
  return modes.length ? modes.map((mode) => SNAKE_MODES[mode].label).join(" + ") : `${SNAKE_MODES.blender.label} (empty)`;
}

export function describeSetup(setup: SnakeSetup) {
  return `${setupTitle(setup)} · ${SNAKE_SIZES[setup.size].label} · ${setup.fruitCount} × ${SNAKE_FRUIT_LABELS[setup.fruit]}`;
}

const tile =
  "relative grid place-items-center rounded-xl border-2 border-border bg-surface/50 transition-[transform,background-color,border-color,box-shadow] duration-150 motion-safe:hover:-translate-y-0.5 hover:border-foreground/30 hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 motion-safe:aria-disabled:hover:translate-y-0";

/** Selected look: tinted with the option's color, plus a ring. */
const picked = (color: string) => ({ borderColor: color, backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`, boxShadow: `0 0 0 1px ${color}` });

function Tip({ label, tip, children }: { label: string; tip?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="flex-col items-start gap-0">
        <span className="font-semibold">{label}</span>
        {tip ? <span className="opacity-80">{tip}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function Group({ title, value, children }: { title: string; value: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 flex w-full items-baseline gap-1.5 text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
        <span aria-hidden>·</span>
        <span className="truncate font-medium tracking-normal text-foreground normal-case">{value}</span>
      </legend>
      {children}
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
  const blending = setup.mode === "blender";

  function pickMode(mode: SnakeMode) {
    if (!blending) return update({ mode });
    if (mode === "blender") return update({ mode: setup.blend[0] ?? "classic" });
    if (mode === "classic") return;
    const blendMode = mode as BlendMode;
    if (setup.blend.includes(blendMode)) return update({ blend: setup.blend.filter((m) => m !== blendMode) });
    if (blendClash(setup.blend, blendMode)) return;
    update({ blend: BLEND_MODE_IDS.filter((m) => m === blendMode || setup.blend.includes(m)) });
  }

  return (
    <section aria-labelledby="snake-setup-title" className="rounded-2xl border-2 border-border bg-surface/40 p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="snake-setup-title" className="text-base font-semibold">
          Setup
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/12 px-2 py-0.5 text-xs font-semibold text-amber-300 tabular-nums" aria-label={best ? `Best here ${best}` : "No best here yet"}>
          <Trophy aria-hidden className="size-3.5" />
          {best ?? "–"}
        </span>
      </div>
      {locked || waiting ? (
        <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-amethyst/10 px-2.5 py-1.5 text-xs text-foreground">
          {locked ? <Lock aria-hidden className="size-3.5" /> : <Hourglass aria-hidden className="size-3.5" />}
          {locked ? "Locked during a round" : "Applies next round"}
        </p>
      ) : null}
      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-4">
        <Group title={blending ? "Blender" : "Mode"} value={setupTitle(setup)}>
          <div className="grid grid-cols-5 gap-1.5" role={blending ? "group" : "radiogroup"} aria-label={blending ? "Modes to mix" : "Mode"}>
            {SNAKE_MODE_IDS.map((mode) => {
              const look = MODE_LOOK[mode];
              const info = SNAKE_MODES[mode];
              const inMix = blending && mode !== "classic" && mode !== "blender" && setup.blend.includes(mode as BlendMode);
              const selected = blending ? mode === "blender" || inMix : setup.mode === mode;
              const reason = !blending || inMix || mode === "blender" ? null : mode === "classic" ? "Pick the modes to mix" : blendClash(setup.blend, mode as BlendMode);
              const tip = reason ?? (mode === "blender" && blending ? "Click to stop mixing" : blending && mode !== "blender" ? (inMix ? "In the mix" : `Add: ${info.tip}`) : info.tip);
              return (
                <Tip key={mode} label={info.label} tip={tip}>
                  <button
                    type="button"
                    {...(blending ? (mode === "blender" ? { "aria-pressed": true } : { "aria-pressed": inMix }) : { role: "radio", "aria-checked": selected })}
                    aria-label={info.label}
                    aria-disabled={reason ? true : undefined}
                    className={cn(tile, "aspect-square")}
                    style={selected ? picked(look.color) : undefined}
                    onClick={() => pickMode(mode)}
                  >
                    <look.icon aria-hidden className="size-6" style={{ color: look.color }} />
                    {mode === "blender" && blending && setup.blend.length ? (
                      <span className="absolute -top-1.5 -right-1.5 grid size-4.5 place-items-center rounded-full bg-pink-400 text-[0.6rem] font-bold text-black tabular-nums">{setup.blend.length}</span>
                    ) : null}
                  </button>
                </Tip>
              );
            })}
          </div>
        </Group>

        <Group title="Fruit" value={SNAKE_FRUIT_LABELS[setup.fruit]}>
          <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Fruit">
            {SNAKE_FRUIT_IDS.map((fruit) => (
              <Tip key={fruit} label={SNAKE_FRUIT_LABELS[fruit]} tip={fruit === "salad" ? "A mix of every fruit" : undefined}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={setup.fruit === fruit}
                  aria-label={SNAKE_FRUIT_LABELS[fruit]}
                  className={cn(tile, "aspect-square")}
                  style={setup.fruit === fruit ? picked("#a57cff") : undefined}
                  onClick={() => update({ fruit })}
                >
                  <FruitIcon fruit={fruit} size={26} />
                </button>
              </Tip>
            ))}
          </div>
        </Group>

        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-4">
          <Group title="Board" value={SNAKE_SIZES[setup.size].label}>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Board size">
              {SNAKE_SIZE_IDS.map((size) => {
                const { label, grid } = SNAKE_SIZES[size];
                return (
                  <Tip key={size} label={label} tip={`${grid} × ${grid}`}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={setup.size === size}
                      aria-label={`${label}, ${grid} by ${grid}`}
                      className={cn(tile, "size-10")}
                      style={setup.size === size ? picked("#4fcf6a") : undefined}
                      onClick={() => update({ size })}
                    >
                      <SizeIcon size={size} className="size-6" />
                    </button>
                  </Tip>
                );
              })}
            </div>
          </Group>

          <Group title="Amount" value={`× ${count}`}>
            <div className="flex flex-col gap-1.5">
              <div className="flex h-10 items-center justify-between rounded-xl border-2 border-border bg-surface/50">
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-lg hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
                  aria-label="Less fruit"
                  disabled={count <= FRUIT_COUNT.min}
                  onClick={() => update({ fruitCount: count - 1 })}
                >
                  <Minus aria-hidden className="size-4" />
                </button>
                <span className="flex items-center gap-1">
                  <FruitIcon fruit={setup.fruit} size={20} />
                  <output aria-live="polite" aria-label="Fruit on the board" className="w-5 text-center text-sm font-bold tabular-nums">
                    {count}
                  </output>
                </span>
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-lg hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
                  aria-label="More fruit"
                  disabled={count >= FRUIT_COUNT.max}
                  onClick={() => update({ fruitCount: count + 1 })}
                >
                  <Plus aria-hidden className="size-4" />
                </button>
              </div>
              <div className="flex gap-1">
                {FRUIT_COUNT.presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={count === preset}
                    aria-label={`${preset} fruit`}
                    className={cn(tile, "h-6 flex-1 rounded-lg border text-[0.7rem] font-semibold tabular-nums")}
                    style={count === preset ? picked("#f5b700") : undefined}
                    onClick={() => update({ fruitCount: preset })}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </Group>
        </div>
      </fieldset>
    </section>
  );
}
