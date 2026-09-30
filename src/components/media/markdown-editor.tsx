"use client";

import { useState } from "react";
import { Eye, Loader2, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "./markdown";

/** Markdown text with view/edit toggle; saving is delegated to the caller. */
export function MarkdownEditor({
  label,
  value,
  imageHosts,
  onSave,
  emptyText = "Nothing here yet.",
  maxLength = 50_000,
}: {
  label: string;
  value: string;
  imageHosts: readonly string[];
  onSave: (value: string) => Promise<void>;
  emptyText?: string;
  maxLength?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const id = `md-${label.replace(/\W+/g, "-").toLowerCase()}`;

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      setPreview(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        {value.trim() ? (
          <Markdown content={value} imageHosts={imageHosts} />
        ) : (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          <Pencil aria-hidden /> Edit {label.toLowerCase()}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label} <span className="font-normal text-muted-foreground">(Markdown)</span>
        </label>
        <Button variant="ghost" size="sm" onClick={() => setPreview(!preview)} aria-pressed={preview}>
          <Eye aria-hidden /> {preview ? "Edit" : "Preview"}
        </Button>
      </div>
      {preview ? (
        <div className="min-h-40 rounded-md border border-border p-3">
          <Markdown content={draft} imageHosts={imageHosts} />
        </div>
      ) : (
        <Textarea
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={maxLength}
          className="min-h-56 font-mono text-sm"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />} Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {draft.length.toLocaleString()}/{maxLength.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
