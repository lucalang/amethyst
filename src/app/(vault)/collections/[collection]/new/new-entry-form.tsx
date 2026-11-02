"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { CategorySelect } from "@/components/categories/category-picker";
import { CoverArtworkField } from "@/components/media/cover-artwork-field";
import { ImageUrlField } from "@/components/media/image-url-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { collectionPath, type LibraryCategory } from "@/lib/collections";
import type { Category } from "@/lib/categories";
import type { CoverShape } from "@/lib/cover-shape";
import { DEFAULT_PROGRESS_LABEL, MAX_PROGRESS_LABEL_LENGTH } from "@/lib/progress/label";
import { NO_TEMPLATE, type TemplateSummary } from "@/lib/templates";
import { createEntry, type NewEntryState } from "./actions";

const initial: NewEntryState = { status: "idle" };

export function NewEntryForm({
  collection,
  categories,
  templates,
  defaultCoverShape,
}: {
  collection: LibraryCategory;
  categories: Category[];
  templates: TemplateSummary[];
  defaultCoverShape: CoverShape;
}) {
  const [state, action, pending] = useActionState(createEntry, initial);
  const [, startTransition] = useTransition();
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  const [bannerOpen, setBannerOpen] = useState(false);
  const [shapeBusy, setShapeBusy] = useState(true);
  const showBanner = bannerOpen || Boolean(values.bannerUrl) || Boolean(errors.bannerUrl);
  const collectionDefault = templates.find((template) => template.id === collection.default_template_id);
  const [template, setTemplate] = useState(collectionDefault?.id ?? NO_TEMPLATE);
  const chosen = templates.find((item) => item.id === template);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        // Keep typed values on validation errors (form actions reset fields).
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => action(formData));
      }}
      className="enter max-w-2xl rounded-lg border border-white/[0.08] bg-surface/70 shadow-[0_24px_60px_-40px_rgb(var(--accent-rgb)/0.5)]"
      style={{ "--enter-index": 1 } as React.CSSProperties}
      noValidate
    >
      <input type="hidden" name="collection" value={collection.id} />
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
            placeholder="Entry name"
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

        <CategorySelect key={collection.id} collectionId={collection.id} categories={categories} />

        <CoverArtworkField
          id="coverUrl"
          defaultShape={defaultCoverShape}
          defaultValue={values.coverUrl}
          error={errors.coverUrl}
          useRememberedDefault
          onBusyChange={setShapeBusy}
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

        <div className="grid gap-5 border-t border-white/[0.06] pt-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="templateId" className="text-sm">Workspace template</Label>
            <Select name="templateId" value={template} onValueChange={setTemplate}>
              <SelectTrigger
                id="templateId"
                className="h-11 w-full bg-black/40"
                aria-invalid={Boolean(errors.templateId)}
                aria-describedby="templateId-hint"
              >
                <SelectValue placeholder="No template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE}>No template</SelectItem>
                {templates.map((item) => (
                  <SelectItem key={item.id} value={item.id} className="break-all">
                    {item.name}{item.id === collectionDefault?.id ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="templateId-hint" className={errors.templateId ? "text-xs text-rose" : "text-xs text-muted-foreground"}>
              {errors.templateId
                ? errors.templateId
                : chosen
                  ? `Starts with ${chosen.folders + chosen.files === 0 ? "nothing (the template is empty)" : [chosen.folders ? `${chosen.folders} ${chosen.folders === 1 ? "folder" : "folders"}` : "", chosen.files ? `${chosen.files} ${chosen.files === 1 ? "file" : "files"}` : ""].filter(Boolean).join(" and ")}. Starter tasks begin unchecked.`
                  : templates.length
                    ? "The workspace starts empty."
                    : <>The workspace starts empty. <Link href="/settings/templates" className="text-amethyst underline-offset-4 hover:underline">Create templates in Settings</Link>.</>}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="progressLabel" className="text-sm">
              Progress name <span className="text-xs font-normal text-muted-foreground/70">optional</span>
            </Label>
            <Input
              id="progressLabel"
              name="progressLabel"
              defaultValue={values.progressLabel ?? collection.progress_label ?? ""}
              maxLength={MAX_PROGRESS_LABEL_LENGTH}
              placeholder={DEFAULT_PROGRESS_LABEL}
              autoComplete="off"
              aria-invalid={Boolean(errors.progressLabel)}
              aria-describedby="progressLabel-hint"
              className="h-11 bg-black/40 px-3.5"
            />
            <p id="progressLabel-hint" className={errors.progressLabel ? "text-xs text-rose" : "text-xs text-muted-foreground"}>
              {errors.progressLabel ?? "What this entry’s checklist progress is called, like “quests” or “chapters”."}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-3 border-t border-white/[0.06] px-5 py-4 md:px-7">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="h-10 px-3.5">
            <Link href={collectionPath(collection)}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={pending || shapeBusy} className="h-10 px-4">
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Plus aria-hidden />}
            Create entry
          </Button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="px-5 pb-4 text-sm text-rose empty:hidden md:px-7">
        {state.status === "error" ? state.message : null}
      </p>
    </form>
  );
}
