"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { CatalogEmpty, CatalogSearch } from "@/components/catalog/catalog-search";
import { useSettings } from "@/components/layout/settings-context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { catalogMatcher } from "@/lib/catalog-search";
import type { Tables } from "@/lib/supabase/database.types";
import { THEME_IDS, THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { errorMessage } from "./client-utils";
import { WorkspaceThemePreview } from "./workspace-theme-preview";

type Entry = Tables<"entries">;

export function WorkspaceThemeDialog({ open, onOpenChange, entry, onEntryChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: Entry;
  onEntryChange: (entry: Entry) => void;
}) {
  const { theme: appTheme } = useSettings();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const match = catalogMatcher(query);
  const shown = THEME_IDS.filter((id) => !match || match(THEMES[id].name, THEMES[id].description, THEMES[id].mode));

  async function selectTheme(theme: ThemeId | null) {
    if (pending || theme === entry.workspace_theme) return;
    setPending(true);
    setError(null);
    onEntryChange({ ...entry, workspace_theme: theme });
    try {
      const { entry: saved } = await apiFetch<{ entry: Entry }>(`/api/entries/${entry.id}`, {
        method: "PATCH",
        json: { workspace_theme: theme, expectedVersion: entry.version },
      });
      onEntryChange(saved);
    } catch (saveError) {
      onEntryChange(entry);
      setError(errorMessage(saveError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Workspace theme</DialogTitle>
          <DialogDescription>
            Dress {entry.title}&apos;s workspace in a theme: its header, explorer, file bar, panels and corners take on the theme. Only this entry changes.
          </DialogDescription>
        </DialogHeader>
        <CatalogSearch value={query} onChange={setQuery} label="Search workspace themes" placeholder="Search themes" className="sm:w-full" />
        <fieldset aria-busy={pending} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="sr-only">Workspace theme</legend>
          <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:col-span-2 lg:col-span-3", entry.workspace_theme === null ? "border-amethyst bg-amethyst/10" : "border-border")}>
            <input type="radio" name="workspace-theme" checked={entry.workspace_theme === null} aria-disabled={pending} onChange={() => void selectTheme(null)} className="accent-amethyst" />
            <span className="text-sm">
              <span className="font-medium">Use app theme</span> <span className="text-muted-foreground">({THEMES[appTheme].name}): the plain workspace in your app colors.</span>
            </span>
          </label>
          {shown.map((id) => (
            <label
              key={id}
              className={cn(
                "grid cursor-pointer content-start gap-2.5 rounded-xl border p-2.5 transition-[border-color,box-shadow] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                entry.workspace_theme === id ? "border-amethyst shadow-[0_0_0_1px_var(--amethyst)]" : "border-border hover:border-amethyst/50",
              )}
            >
              <WorkspaceThemePreview id={id} title={entry.title} coverUrl={entry.cover_url} />
              <span className="flex items-start gap-2 px-0.5">
                <input type="radio" name="workspace-theme" checked={entry.workspace_theme === id} aria-disabled={pending} onChange={() => void selectTheme(id)} className="mt-1 accent-amethyst" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{THEMES[id].name}</span>
                  <span className="line-clamp-2 block text-xs text-muted-foreground">{THEMES[id].description}</span>
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {shown.length === 0 ? <CatalogEmpty query={query} onReset={() => setQuery("")} /> : null}
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          {pending ? <><Loader2 aria-hidden className="size-4 animate-spin" /> Saving theme...</> : error ? null : "Saved"}
        </p>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}