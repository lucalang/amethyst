import { cn } from "@/lib/utils";

type Props = {
  done: number;
  total: number | null;
  label?: string;
  className?: string;
  /** Visually compact variant for cards. */
  compact?: boolean;
};

/** Progress bar that keeps unknown totals visibly unknown. */
export function ProgressMeter({ done, total, label, className, compact }: Props) {
  const known = typeof total === "number" && total > 0;
  const percent = known ? Math.min(100, Math.round((done / total) * 100)) : null;
  const text = `${done}/${known ? total : "?"}${label ? ` ${label}` : ""}`;
  return (
    <div className={cn("space-y-1", className)}>
      <div
        role="progressbar"
        aria-label={label ? `${label} progress` : "Progress"}
        aria-valuemin={0}
        aria-valuemax={known ? total : undefined}
        aria-valuenow={known ? done : undefined}
        aria-valuetext={known ? `${done} of ${total}${label ? ` ${label}` : ""}` : `${done} ${label ?? ""}, total unknown`}
        className={cn("relative overflow-hidden rounded-sm bg-secondary", compact ? "h-1" : "h-1.5")}
      >
        {known ? (
          <div className="h-full rounded-sm bg-jade transition-[width]" style={{ width: `${percent}%` }} />
        ) : (
          <div className="h-full w-full bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.08)_6px_12px)]" />
        )}
      </div>
      {!compact ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          {text}
          {!known ? <span className="sr-only"> (total unknown)</span> : null}
        </p>
      ) : null}
    </div>
  );
}
