"use client";

import { useRef, useState, type PointerEvent } from "react";
import { PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LabProps } from ".";

const LINES = [
  "Nope.",
  "Not today.",
  "I have a meeting.",
  "Too slow!",
  "Is that a cursor? Eek.",
  "I bruise easily.",
  "Try the other side.",
  "Catch me if you… actually don’t.",
  "Getting tired…",
  "Okay, puffed out.",
  "One more lap. Maybe.",
  "Fine. I give up.",
];
const STAMINA = LINES.length - 1;
const DODGE_RADIUS = 80;

export function RunawayButton({ assist }: LabProps) {
  const [spot, setSpot] = useState({ x: 50, y: 50 });
  const [dodges, setDodges] = useState(0);
  const [caught, setCaught] = useState(false);
  const arena = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const swallowClick = useRef(false);
  const fleeing = !assist && !caught && dodges < STAMINA;

  function dodge(px: number, py: number) {
    const box = arena.current!.getBoundingClientRect();
    // Pick the farthest of a few random spots from the pointer.
    let best = spot;
    let bestDistance = -1;
    for (let i = 0; i < 6; i += 1) {
      const candidate = { x: 12 + Math.random() * 76, y: 15 + Math.random() * 70 };
      const distance = Math.hypot((candidate.x / 100) * box.width - px, (candidate.y / 100) * box.height - py);
      if (distance > bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    setSpot(best);
    setDodges((value) => value + 1);
  }

  function onPointerMove(event: PointerEvent) {
    if (!fleeing || event.pointerType !== "mouse") return;
    const box = arena.current!.getBoundingClientRect();
    const b = button.current!.getBoundingClientRect();
    const near = Math.hypot(event.clientX - (b.left + b.width / 2), event.clientY - (b.top + b.height / 2)) < DODGE_RADIUS;
    if (near) dodge(event.clientX - box.left, event.clientY - box.top);
  }

  const line = caught ? "You got me. Fair and square." : assist ? "Easy mode: I’ll stay put." : dodges === 0 ? "Hi! Please don’t click me." : LINES[Math.min(dodges, LINES.length) - 1];

  return (
    <div className="space-y-4">
      <div
        ref={arena}
        onPointerMove={onPointerMove}
        className="relative h-72 overflow-hidden rounded-xl border border-dashed border-border bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:18px_18px]"
      >
        {caught ? (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <PartyPopper aria-hidden className="mx-auto size-10 text-amethyst" />
              <p className="mt-2 text-lg font-semibold">Caught!</p>
              <p className="text-sm text-muted-foreground">
                {dodges === 0 ? "First try. The button is embarrassed." : `It dodged ${dodges} ${dodges === 1 ? "time" : "times"} before giving in.`}
              </p>
            </div>
          </div>
        ) : (
          <button
            ref={button}
            type="button"
            onPointerDown={(event) => {
              // Touch has no hover, so the button flinches on the tap itself.
              if (fleeing && event.pointerType !== "mouse") {
                swallowClick.current = true;
                const box = arena.current!.getBoundingClientRect();
                dodge(event.clientX - box.left, event.clientY - box.top);
              }
            }}
            onClick={() => {
              if (swallowClick.current) {
                swallowClick.current = false;
                return;
              }
              setCaught(true);
            }}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-amethyst px-5 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-lg outline-none transition-[left,top] duration-300 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none",
              dodges >= STAMINA - 3 && "opacity-90",
            )}
          >
            {dodges >= STAMINA ? "Fine. Click me." : "Click me"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm font-medium">
          {line}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          Dodges: {dodges} / {STAMINA}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Keyboard users get a head start: the button can’t see focus coming, so Tab to it and press Enter. Easy mode keeps it still.
      </p>
    </div>
  );
}
