"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { ImageUrlField } from "@/components/media/image-url-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Collection } from "@/lib/collections";
import { starterFilesFor } from "@/lib/validation/entries";
import { createEntry, type NewEntryState } from "./actions";

const initial: NewEntryState = { status: "idle" };

const PLACEHOLDERS: Record<Collection["slug"], string> = { anime: "e.g. One Piece", games: "e.g. Hollow Knight", other: "e.g. Reading list" };

export function NewEntryForm({ collection }: { collection: Collection }) {
  const [state, action, pending] = useActionState(createEntry, initial);
  const [, startTransition] = useTransition();
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  const starters = starterFilesFor(collection.kind).map((file) => file.name);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        // Keep typed values on validation errors (form actions reset fields).
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="max-w-2xl space-y-6"
      noValidate
    >
      <input type="hidden" name="collection" value={collection.slug} />
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={values.title}
          required
          maxLength={300}
          placeholder={PLACEHOLDERS[collection.slug]}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "title-error" : undefined}
          className="h-10 text-base"
        />
        {errors.title ? (
          <p id="title-error" className="text-xs text-rose">
            {errors.title}
          </p>
        ) : null}
      </div>

      {collection.kind === "game" ? (
        <div className="space-y-1.5">
          <Label htmlFor="platform">Platform</Label>
          <Input id="platform" name="platform" defaultValue={values.platform} maxLength={80} placeholder="Optional, e.g. PC, Switch, PS5" />
        </div>
      ) : null}

      <ImageUrlField
        id="coverUrl"
        name="coverUrl"
        label="Cover image URL"
        hint="Optional. A direct link to an image on any public website."
        defaultValue={values.coverUrl}
        error={errors.coverUrl}
        shape="poster"
      />
      <ImageUrlField
        id="bannerUrl"
        name="bannerUrl"
        label="Banner image URL"
        hint="Optional wide artwork for the top of the workspace."
        defaultValue={values.bannerUrl}
        error={errors.bannerUrl}
        shape="banner"
      />

      <p className="text-xs text-muted-foreground">
        Opens as a workspace with {starters.map((name) => `“${name}”`).join(", ")}. Add folders, notes and checklists, or rename and delete these any time.
      </p>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="h-10 px-4">
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
          Create {collection.singular}
        </Button>
        <Button asChild variant="ghost" className="h-10">
          <Link href={`/${collection.slug}`}>Cancel</Link>
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-rose">
          {state.status === "error" ? state.message : null}
        </p>
      </div>
    </form>
  );
}
