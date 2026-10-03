"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { CategorySelect } from "@/components/categories/category-picker";
import { ImageUrlField } from "@/components/media/image-url-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Collection } from "@/lib/collections";
import type { Category } from "@/lib/categories";
import { createEntry, type NewEntryState } from "./actions";

const initial: NewEntryState = { status: "idle" };

const PLACEHOLDERS: Record<Collection["slug"], string> = { anime: "e.g. One Piece", games: "e.g. Hollow Knight", other: "e.g. Reading list" };

export function NewEntryForm({ collection, categories }: { collection: Collection; categories: Category[] }) {
  const [state, action, pending] = useActionState(createEntry, initial);
  const [, startTransition] = useTransition();
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  const [bannerOpen, setBannerOpen] = useState(false);
  const showBanner = bannerOpen || Boolean(values.bannerUrl) || Boolean(errors.bannerUrl);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        // Keep typed values on validation errors (form actions reset fields).
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="enter max-w-2xl rounded-lg border border-white/[0.08] bg-surface/70 shadow-[0_24px_60px_-40px_rgb(165_124_255/0.5)]"
      style={{ "--enter-index": 1 } as React.CSSProperties}
      noValidate
    >
      <input type="hidden" name="collection" value={collection.slug} />
      <div className="space-y-6 p-5 md:p-7">
        <div className="space-y-2">
          <Label htmlFor="title" className="text-sm">
            Title
          </Label>
          <Input
            id="title"
            name="title"
            defaultValue={values.title}
            required
            autoFocus
            maxLength={300}
            placeholder={PLACEHOLDERS[collection.slug]}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "title-error" : undefined}
            className="h-11 bg-black/40 px-3.5 text-base md:text-base"
          />
          {errors.title ? (
            <p id="title-error" className="text-xs text-rose">
              {errors.title}
            </p>
          ) : null}
        </div>

        <CategorySelect categories={categories} />

        <ImageUrlField
          id="coverUrl"
          name="coverUrl"
          label="Cover image URL"
          hint="Optional. A direct link to an image on any public website."
          defaultValue={values.coverUrl}
          error={errors.coverUrl}
          shape={collection.kind === "game" ? "square" : "poster"}
        />

        {showBanner ? (
          <div className="enter enter-drop">
            <ImageUrlField
              id="bannerUrl"
              name="bannerUrl"
              label="Banner image URL"
              hint="Optional wide artwork for the top of the workspace."
              defaultValue={values.bannerUrl}
              error={errors.bannerUrl}
              shape="banner"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setBannerOpen(true)}
            className="group/banner -mt-2 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-amethyst focus-visible:text-amethyst focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Plus aria-hidden className="size-4 transition-transform duration-200 group-hover/banner:rotate-90" />
            Add a banner image
            <span className="text-xs font-normal text-muted-foreground/70">optional</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-3 border-t border-white/[0.06] px-5 py-4 md:px-7">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="h-10 px-3.5">
            <Link href={`/${collection.slug}`}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={pending} className="h-10 px-4">
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Plus aria-hidden />}
            Create {collection.singular}
          </Button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="px-5 pb-4 text-sm text-rose empty:hidden md:px-7">
        {state.status === "error" ? state.message : null}
      </p>
    </form>
  );
}
