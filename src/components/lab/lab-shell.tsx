"use client";

import Link from "next/link";
import { useState } from "react";
import { Accessibility, ArrowLeft, FlaskConical, LogOut, RotateCcw } from "lucide-react";
import { LAB_COMPONENTS } from "@/components/lab/experiments";
import { LAB_ICONS } from "@/components/lab/lab-gallery";
import type { LabExperimentId } from "@/lib/lab";
import { cn } from "@/lib/utils";

/** Frame around every experiment: demo label, easy mode, reset and exit are always within reach. */
export function LabShell({ id, title, blurb }: { id: LabExperimentId; title: string; blurb: string }) {
  const [run, setRun] = useState(0);
  const [assist, setAssist] = useState(false);
  const Experiment = LAB_COMPONENTS[id];
  const Icon = LAB_ICONS[id];

  return (
    <div className="space-y-4">
      <Link href="/lab" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft aria-hidden className="size-4" />
        All experiments
      </Link>
      <section aria-labelledby="lab-title" className="overflow-hidden rounded-2xl border border-border bg-surface/50">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 md:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amethyst/[0.12] text-amethyst">
              <Icon aria-hidden className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 id="lab-title" className="text-xl font-semibold tracking-tight">
                  {title}
                </h1>
                <span className="lab-demo-tag">
                  <FlaskConical aria-hidden className="size-3" />
                  Demo
                </span>
              </div>
              <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{blurb}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={assist}
              onClick={() => setAssist((value) => !value)}
              className={cn("lab-control", assist && "lab-control-on")}
              title="Swap the joke for a plain, keyboard-friendly version"
            >
              <Accessibility aria-hidden className="size-4" />
              Easy mode
            </button>
            <button type="button" onClick={() => setRun((value) => value + 1)} className="lab-control">
              <RotateCcw aria-hidden className="size-4" />
              Reset
            </button>
            <Link href="/lab" className="lab-control">
              <LogOut aria-hidden className="size-4" />
              Exit
            </Link>
          </div>
        </header>
        <div className="p-4 md:p-6">
          <Experiment key={run} assist={assist} />
        </div>
        <p className="border-t border-border bg-foreground/[0.02] px-4 py-2.5 text-xs text-muted-foreground md:px-5">
          This is a pretend demo. It never changes your settings, purchases, sign-in or subscriptions, and nothing you enter is saved or sent.
        </p>
      </section>
    </div>
  );
}
