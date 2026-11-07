"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, LogOut, RotateCcw, ShieldCheck } from "lucide-react";
import { LAB_COMPONENTS, type LabPoint } from "@/components/lab/experiments";
import { labNumber } from "@/components/lab/lab-gallery";
import { LAB_EXPERIMENTS, type LabExperimentId } from "@/lib/lab";

const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  a: `${(i * 360) / 14 + ((i * 37) % 11)}deg`,
  r: `${46 + (i % 3) * 18}px`,
  c: ["var(--lab-accent)", "var(--lab-accent-text)", "var(--lab-ink)"][i % 3],
}));

/** Workbench around every experiment: index, easy mode, reset and exit are always within reach. */
export function LabShell({ id, title, blurb }: { id: LabExperimentId; title: string; blurb: string }) {
  const [run, setRun] = useState(0);
  const [assist, setAssist] = useState(false);
  const [wipe, setWipe] = useState(0);
  const [burst, setBurst] = useState<{ n: number; x: number; y: number } | null>(null);
  const [announce, setAnnounce] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const Experiment = LAB_COMPONENTS[id];
  const index = LAB_EXPERIMENTS.findIndex((item) => item.id === id);
  const prev = LAB_EXPERIMENTS[index - 1];
  const next = LAB_EXPERIMENTS[index + 1];

  const celebrate = useCallback((at?: LabPoint) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    setBurst((last) => ({ n: (last?.n ?? 0) + 1, x: at ? at.x - box.left : box.width / 2, y: at ? at.y - box.top : box.height / 2 }));
  }, []);

  function reset() {
    setRun((value) => value + 1);
    setBurst(null);
    setWipe((value) => value + 1);
    setAnnounce(`${title} reset.`);
  }
  function toggleAssist() {
    setAssist(!assist);
    setWipe((value) => value + 1);
    setAnnounce(assist ? "Easy mode off." : "Easy mode on: a plain, keyboard-friendly version.");
  }

  return (
    <div className="lab-bench">
      <nav aria-label="Experiments" className="lab-index">
        <p className="lab-index-title max-lg:sr-only">Experiments</p>
        <ol>
          {LAB_EXPERIMENTS.map((item) => (
            <li key={item.id}>
              <Link href={`/lab/${item.id}`} aria-current={item.id === id ? "page" : undefined}>
                <span aria-hidden>{labNumber(item.id)}</span>
                <span>{item.title}</span>
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0">
        <section aria-labelledby="lab-title" className="lab-panel">
          <header className="lab-toolbar">
            <div className="min-w-0 max-w-xl">
              <p className="lab-eyebrow">
                Experiment {labNumber(id)} / {String(LAB_EXPERIMENTS.length).padStart(2, "0")}
              </p>
              <h1 id="lab-title" className="lab-h1">
                {title}
              </h1>
              <p className="lab-muted mt-1 text-sm text-pretty">{blurb}</p>
            </div>
            <div className="lab-actions">
              <button type="button" role="switch" aria-checked={assist} onClick={toggleAssist} className="lab-switch" title="Swap the joke for a plain, keyboard-friendly version">
                <span aria-hidden className="lab-switch-track" />
                Easy mode
              </button>
              <button type="button" onClick={reset} className="lab-btn">
                <RotateCcw aria-hidden className="size-4" />
                Reset
              </button>
              <Link href="/lab" className="lab-btn lab-btn-ghost">
                <LogOut aria-hidden className="size-4" />
                Exit
              </Link>
            </div>
          </header>
          <div ref={stage} className="lab-stage">
            <div key={run} className="lab-stage-body">
              <Experiment assist={assist} celebrate={celebrate} />
            </div>
            {wipe ? <span key={`w${wipe}`} aria-hidden className="lab-wipe" /> : null}
            {burst ? (
              <span key={`b${burst.n}`} aria-hidden className="lab-burst" style={{ left: burst.x, top: burst.y }}>
                {SPARKS.map((spark, i) => (
                  <i key={i} style={{ "--a": spark.a, "--r": spark.r, "--c": spark.c } as CSSProperties} />
                ))}
              </span>
            ) : null}
          </div>
          <p className="lab-foot">
            <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
            This is a pretend demo. It never changes your settings, purchases, sign-in or subscriptions, and nothing you enter is saved or sent.
          </p>
        </section>
        <p aria-live="polite" className="sr-only">
          {announce}
        </p>

        <nav aria-label="More experiments" className="lab-pager">
          {prev ? (
            <Link href={`/lab/${prev.id}`} data-dir="prev">
              <small className="inline-flex items-center gap-1">
                <ArrowLeft aria-hidden className="size-3" />
                Previous
              </small>
              <span className="text-sm font-semibold">{prev.title}</span>
            </Link>
          ) : null}
          {next ? (
            <Link href={`/lab/${next.id}`} data-dir="next">
              <small className="inline-flex items-center justify-end gap-1">
                Next
                <ArrowRight aria-hidden className="size-3" />
              </small>
              <span className="text-sm font-semibold">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      </div>
    </div>
  );
}
