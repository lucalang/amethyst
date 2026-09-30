import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AuthState } from "./actions";

export function FormStatus({ state }: { state: AuthState }) {
  return (
    <p role="status" aria-live="polite" className="min-h-5 text-sm">
      {state.status === "error" || state.status === "unconfirmed" ? (
        <span className="flex items-start gap-1.5 text-rose">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </span>
      ) : state.status === "success" ? (
        <span className="flex items-start gap-1.5 text-amethyst">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          {state.message}
        </span>
      ) : null}
    </p>
  );
}
