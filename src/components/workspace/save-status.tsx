"use client";

import { AlertTriangle, Check, CircleDot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveState =
  | { kind: "saved" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

/** Compact, screen-reader friendly save indicator for the editor header. */
export function SaveStatus({ state, onRetry, className }: { state: SaveState; onRetry?: () => void; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex min-w-0 items-center gap-1.5 text-xs", className)}>
      {state.kind === "saving" ? (
        <>
          <Loader2 aria-hidden className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" />
          <span className="text-muted-foreground">Saving…</span>
        </>
      ) : state.kind === "dirty" ? (
        <>
          <CircleDot aria-hidden className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Unsaved changes</span>
        </>
      ) : state.kind === "error" ? (
        <>
          <AlertTriangle aria-hidden className="size-3.5 shrink-0 text-destructive" />
          <span className="truncate text-destructive" title={state.message}>
            Not saved: {state.message}
          </span>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="shrink-0 font-medium text-foreground underline underline-offset-2">
              Retry
            </button>
          ) : null}
        </>
      ) : state.kind === "conflict" ? (
        <>
          <AlertTriangle aria-hidden className="size-3.5 text-coral" />
          <span className="text-coral">Changed elsewhere</span>
        </>
      ) : (
        <>
          <Check aria-hidden className="size-3.5 text-jade" />
          <span className="text-muted-foreground">Saved</span>
        </>
      )}
    </div>
  );
}
