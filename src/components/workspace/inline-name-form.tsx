"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage } from "./client-utils";

function focusInput(input: HTMLInputElement | null) {
  if (input) {
    input.focus();
    input.select();
  }
}

export function InlineNameForm({
  initial,
  label,
  inputId,
  maxLength,
  placeholder,
  compact = false,
  children,
  onSave,
  onCancel,
}: {
  initial: string;
  label: string;
  inputId: string;
  maxLength: number;
  placeholder?: string;
  compact?: boolean;
  children?: ReactNode;
  onSave: (name: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const errorId = useId();
  const controlClass = cn("grid shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none disabled:opacity-50 [&_svg]:size-3.5", compact ? "size-6 pointer-coarse:size-9" : "size-9");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const name = value.trim();
    if (name === initial) {
      onCancel();
      return;
    }
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const message = await onSave(name);
      if (message) setError(message);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={save}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          if (!saving.current) onCancel();
        }
      }}
      className="flex min-w-0 flex-1 flex-col gap-1"
    >
      <div className="flex min-w-0 items-center gap-1">
        <input
          ref={focusInput}
          id={inputId}
          data-name-input
          value={value}
          readOnly={busy}
          aria-busy={busy}
          maxLength={maxLength}
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          placeholder={placeholder}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          className={cn("min-w-0 flex-1 rounded-sm border border-ring bg-background outline-none aria-invalid:border-destructive", compact ? "h-6 px-1.5 text-[13px] pointer-coarse:h-9" : "h-9 px-2.5 text-sm")}
        />
        <button type="submit" disabled={busy} aria-label="Save name" className={controlClass}>
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
        </button>
        <button type="button" disabled={busy} aria-label="Cancel rename" onClick={onCancel} className={controlClass}>
          <X aria-hidden />
        </button>
      </div>
      {children ? <fieldset disabled={busy}>{children}</fieldset> : null}
      {error ? <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}