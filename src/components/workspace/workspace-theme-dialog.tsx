"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ThemePreview } from "@/app/(vault)/settings/theme-settings";
import { CatalogEmpty, CatalogSearch } from "@/components/catalog/catalog-search";
import { useSettings } from "@/components/layout/settings-context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { catalogMatcher } from "@/lib/catalog-search";
import type { Tables } from "@/lib/supabase/database.types";
import { THEME_IDS, THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { errorMessage } from "./client-utils";

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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Workspace theme</DialogTitle>
          <DialogDescription>{entry.title}</DialogDescription>
        </DialogHeader>
        <CatalogSearch value={query} onChange={setQuery} label="Search workspace themes" placeholder="Search themes" className="sm:w-full" />
        <fieldset aria-busy={pending} className="grid gap-3 sm:grid-cols-2">
          <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 sm:col-span-2", entry.workspace_theme === null ? "border-amethyst bg-amethyst/10" : "border-border")}>
            <input type="radio" name="workspace-theme" checked={entry.workspace_theme === null} aria-disabled={pending} onChange={() => void selectTheme(null)} className="accent-amethyst" />
            <span className="text-sm font-medium">Use app theme <span className="font-normal text-muted-foreground">({THEMES[appTheme].name})</span></span>
          </label>
          {shown.map((id) => (
            <label key={id} className={cn("grid cursor-pointer gap-2 rounded-lg border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", entry.workspace_theme === id ? "border-amethyst bg-amethyst/10" : "border-border")}>
              <ThemePreview id={id} />
              <span className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="workspace-theme" checked={entry.workspace_theme === id} aria-disabled={pending} onChange={() => void selectTheme(id)} className="accent-amethyst" />
                {THEMES[id].name}
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