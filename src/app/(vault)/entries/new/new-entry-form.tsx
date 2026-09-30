"use client";

import { useActionState, useState, useTransition } from "react";
import { Gamepad2, Loader2, SquarePen, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { starterFilesFor, type EntryKind } from "@/lib/validation/entries";
import { createEntry, type NewEntryState } from "./actions";

const initial: NewEntryState = { status: "idle" };

const KINDS: { value: EntryKind; label: string; icon: typeof Tv }[] = [
  { value: "anime", label: "Anime", icon: Tv },
  { value: "game", label: "Game", icon: Gamepad2 },
  { value: "custom", label: "Custom", icon: SquarePen },
];

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function NewEntryForm({ defaultKind, imageHosts }: { defaultKind: EntryKind; imageHosts: string[] }) {
  const [state, action, pending] = useActionState(createEntry, initial);
  const [, startTransition] = useTransition();
  const [kind, setKind] = useState(defaultKind);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  const hostHint = `HTTPS URL from an allowed host: ${imageHosts.join(", ")}.`;
  const starters = starterFilesFor(kind).map((file) => file.name);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        // Keep typed values on validation errors (form actions reset fields).
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="max-w-2xl space-y-5"
      noValidate
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Type</legend>
        <div className="flex gap-2">
          {KINDS.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                "flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-border px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                kind === value && "border-jade bg-jade/10 text-foreground",
              )}
            >
              <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
              <Icon aria-hidden className="size-4" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field id="title" label="Title" error={errors.title}>
        <Input
          id="title"
          name="title"
          defaultValue={values.title}
          required
          maxLength={300}
          placeholder={kind === "anime" ? "e.g. One Piece" : kind === "game" ? "e.g. Hollow Knight" : undefined}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "title-error" : undefined}
        />
      </Field>

      {kind === "game" ? (
        <Field id="platform" label="Platform" hint="Optional, e.g. PC, Switch, PS5." error={errors.platform}>
          <Input id="platform" name="platform" defaultValue={values.platform} maxLength={80} />
        </Field>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Field id="coverUrl" label="Cover image URL" hint={hostHint} error={errors.coverUrl}>
          <Input id="coverUrl" name="coverUrl" type="url" inputMode="url" placeholder="https://…" defaultValue={values.coverUrl} aria-invalid={Boolean(errors.coverUrl)} aria-describedby={errors.coverUrl ? "coverUrl-error" : "coverUrl-hint"} />
        </Field>
        <Field id="bannerUrl" label="Banner image URL" hint="Optional wide artwork, same host rules." error={errors.bannerUrl}>
          <Input id="bannerUrl" name="bannerUrl" type="url" inputMode="url" placeholder="https://…" defaultValue={values.bannerUrl} aria-invalid={Boolean(errors.bannerUrl)} aria-describedby={errors.bannerUrl ? "bannerUrl-error" : "bannerUrl-hint"} />
        </Field>
      </div>

      <p className="text-xs text-muted-foreground">
        Opens as a workspace with {starters.map((name) => `“${name}”`).join(", ")}. Add folders, notes and checklists, or rename and delete these any time.
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
          Create
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-destructive">
          {state.status === "error" ? state.message : null}
        </p>
      </div>
    </form>
  );
}
