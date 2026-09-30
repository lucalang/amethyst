"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FileText,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProgressProvider, useProgressStore } from "@/components/franchise/progress-store";
import { apiFetch } from "@/lib/api-client";
import type { ChecklistItem, CustomEntryData } from "@/lib/data/custom-entry";
import { groupState, rowFor } from "@/lib/progress/derive";
import type { CustomTab } from "@/lib/validation/entries";
import { CheckRow } from "./check-row";
import { EmptyState } from "./empty-state";
import { MarkdownEditor } from "./markdown-editor";
import { MediaImage } from "./media-image";
import { ProgressMeter } from "./progress-meter";

const EMPTY: never[] = [];

export function CustomEntryView({ data, imageHosts }: { data: CustomEntryData; imageHosts: string[] }) {
  return (
    <ProgressProvider
      queryKey={["progress", data.entry.id]}
      refreshUrl={`/api/entries/${data.entry.id}/progress`}
      initialRows={data.progress}
      works={EMPTY}
      episodes={EMPTY}
    >
      <EntryLayout data={data} imageHosts={imageHosts} />
    </ProgressProvider>
  );
}

function EntryLayout({ data, imageHosts }: { data: CustomEntryData; imageHosts: string[] }) {
  const router = useRouter();
  const { progress } = useProgressStore();
  const [entry, setEntry] = useState(data.entry);
  const [platform, setPlatform] = useState(data.platform);
  const [tabs, setTabs] = useState<CustomTab[]>(data.tabs);
  const [items, setItems] = useState<ChecklistItem[]>(data.items);
  const [activeTab, setActiveTab] = useState(data.tabs[0]?.id ?? "");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tabDialog, setTabDialog] = useState<{ mode: "add"; type: CustomTab["type"] } | { mode: "rename"; id: string } | null>(null);
  const overall = groupState(
    items.map((item) => item.id),
    progress,
  );

  async function saveTabs(next: CustomTab[]) {
    const previous = tabs;
    setTabs(next);
    try {
      await apiFetch(`/api/entries/${entry.id}/tabs`, { method: "PUT", json: { tabs: next } });
      setItems((current) => current.filter((item) => next.some((tab) => tab.id === item.tabId && tab.type === "checklist")));
    } catch (error) {
      setTabs(previous);
      toast.error(`Tabs not saved: ${error instanceof Error ? error.message : "unknown error"}. Reverted.`);
      throw error;
    }
  }

  async function patchEntry(patch: Record<string, unknown>) {
    const { entry: updated } = await apiFetch<{ entry: typeof entry }>(`/api/entries/${entry.id}`, {
      method: "PATCH",
      json: { ...patch, expectedVersion: entry.version },
    });
    setEntry(updated);
    return updated;
  }

  function moveTab(id: string, delta: number) {
    const index = tabs.findIndex((tab) => tab.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= tabs.length) return;
    const next = [...tabs];
    [next[index], next[target]] = [next[target], next[index]];
    void saveTabs(next).catch(() => undefined);
  }

  async function deleteTab(id: string) {
    const tab = tabs.find((candidate) => candidate.id === id);
    if (!tab) return;
    const itemCount = items.filter((item) => item.tabId === id).length;
    if (!window.confirm(`Delete the “${tab.title}” tab${itemCount ? ` and its ${itemCount} checklist items` : ""}?`)) return;
    const next = tabs.filter((candidate) => candidate.id !== id);
    try {
      await saveTabs(next);
      if (activeTab === id) setActiveTab(next[0]?.id ?? "");
    } catch {
      // saveTabs already reported and reverted
    }
  }

  const banner = entry.banner_url ?? entry.cover_url;

  return (
    <div>
      <div aria-hidden className="relative h-44 overflow-hidden md:h-64">
        {banner ? (
          <MediaImage src={banner} alt="" sizes="100vw" className={entry.banner_url ? "opacity-50" : "scale-110 opacity-40 blur-2xl"} />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/60 to-background" />
      </div>
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="relative -mt-20 flex flex-col gap-5 md:-mt-28 md:flex-row md:items-end">
          <div className="relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary shadow-2xl md:w-40">
            <MediaImage src={entry.cover_url} alt={`${entry.title} cover`} sizes="160px" priority fallbackLabel={entry.title} />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-xs font-medium tracking-wide text-jade uppercase">{entry.kind === "game" ? "Game" : "Custom entry"}</p>
            <h1 className="mt-1 text-2xl leading-tight font-semibold md:text-3xl">{entry.title}</h1>
            {platform ? <p className="mt-1 text-sm text-muted-foreground">{platform}</p> : null}
            {overall.total > 0 ? (
              <div className="mt-3 max-w-sm">
                <ProgressMeter done={overall.checked} total={overall.total} label="checklist items done" />
              </div>
            ) : null}
          </div>
          <div className="flex gap-2 pb-1">
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil aria-hidden /> Edit details
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="More entry actions">
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden /> Delete entry
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="tabs-heading" className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="tabs-heading" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Content
              </h2>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={tabs.length >= 20}>
                    <Plus aria-hidden /> Add tab
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setTabDialog({ mode: "add", type: "markdown" })}>
                    <FileText aria-hidden /> Markdown page
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTabDialog({ mode: "add", type: "checklist" })}>
                    <ListChecks aria-hidden /> Checklist
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {tabs.length === 0 ? (
              <EmptyState icon={FileText} title="No tabs" description="Add a Markdown page (tier lists, codes, guides) or a checklist." />
            ) : (
              <Tabs value={activeTab || tabs[0].id} onValueChange={setActiveTab}>
                <TabsList className="w-full justify-start overflow-x-auto">
                  {tabs.map((tab) => (
                    <TabsTrigger key={tab.id} value={tab.id}>
                      {tab.type === "checklist" ? <ListChecks aria-hidden /> : <FileText aria-hidden />}
                      {tab.title}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tabs.map((tab, index) => (
                  <TabsContent key={tab.id} value={tab.id} className="mt-4 rounded-lg border border-border bg-card p-4">
                    <div className="mb-4 flex flex-wrap items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Move ${tab.title} tab left`} disabled={index === 0} onClick={() => moveTab(tab.id, -1)}>
                        <ArrowLeft aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Move ${tab.title} tab right`} disabled={index === tabs.length - 1} onClick={() => moveTab(tab.id, 1)}>
                        <ArrowRight aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Rename ${tab.title} tab`} onClick={() => setTabDialog({ mode: "rename", id: tab.id })}>
                        <Pencil aria-hidden />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${tab.title} tab`} onClick={() => deleteTab(tab.id)}>
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                    {tab.type === "markdown" ? (
                      <MarkdownEditor
                        label={tab.title}
                        value={tab.content}
                        imageHosts={imageHosts}
                        maxLength={100_000}
                        onSave={async (content) => {
                          await saveTabs(tabs.map((candidate) => (candidate.id === tab.id ? { ...tab, content } : candidate)));
                          toast.success(`${tab.title} saved.`);
                        }}
                      />
                    ) : (
                      <ChecklistTab entryId={entry.id} tab={tab} items={items} setItems={setItems} />
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </section>

          <aside aria-labelledby="entry-notes-heading" className="rounded-lg border border-border bg-card p-4">
            <h2 id="entry-notes-heading" className="mb-3 text-sm font-semibold">
              Notes
            </h2>
            <MarkdownEditor
              label="Notes"
              value={entry.notes}
              imageHosts={imageHosts}
              emptyText="No notes yet."
              onSave={async (notes) => {
                await patchEntry({ notes });
                toast.success("Notes saved.");
              }}
            />
          </aside>
        </div>
      </div>

      <EditDetailsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        entry={entry}
        platform={platform}
        isGame={entry.kind === "game"}
        onSave={async (values) => {
          await patchEntry(values);
          if (values.platform !== undefined) setPlatform(values.platform || null);
          toast.success("Details saved.");
          router.refresh();
        }}
      />

      <TabNameDialog
        state={tabDialog}
        tabs={tabs}
        onClose={() => setTabDialog(null)}
        onSubmit={async (title) => {
          if (!tabDialog) return;
          if (tabDialog.mode === "add") {
            const id = crypto.randomUUID();
            const tab: CustomTab = tabDialog.type === "markdown" ? { id, title, type: "markdown", content: "" } : { id, title, type: "checklist" };
            await saveTabs([...tabs, tab]);
            setActiveTab(id);
          } else {
            await saveTabs(tabs.map((tab) => (tab.id === tabDialog.id ? { ...tab, title } : tab)));
          }
          setTabDialog(null);
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entry.title}?</AlertDialogTitle>
            <AlertDialogDescription>All tabs, checklist items and notes for this entry are permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await apiFetch(`/api/entries/${entry.id}`, { method: "DELETE" });
                  router.push("/");
                  router.refresh();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not delete.");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ChecklistTab({
  entryId,
  tab,
  items,
  setItems,
}: {
  entryId: string;
  tab: CustomTab;
  items: ChecklistItem[];
  setItems: React.Dispatch<React.SetStateAction<ChecklistItem[]>>;
}) {
  const { progress, setChecked } = useProgressStore();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const tabItems = items.filter((item) => item.tabId === tab.id).sort((a, b) => a.position - b.position);
  const state = groupState(
    tabItems.map((item) => item.id),
    progress,
  );

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setAdding(true);
    try {
      const { item } = await apiFetch<{ item: { id: string; title: string } }>(`/api/entries/${entryId}/checklist`, {
        method: "POST",
        json: { tabId: tab.id, title },
      });
      setItems((current) => [...current, { id: item.id, title: item.title, tabId: tab.id, position: (tabItems.at(-1)?.position ?? -1) + 1 }]);
      setDraft((current) => (current.trim() === title ? "" : current));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add item.");
    } finally {
      setAdding(false);
    }
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= tabItems.length) return;
    const ordered = [...tabItems];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const previous = items;
    const positions = new Map(ordered.map((item, position) => [item.id, position]));
    setItems((current) => current.map((item) => (positions.has(item.id) ? { ...item, position: positions.get(item.id)! } : item)));
    try {
      await apiFetch(`/api/entries/${entryId}/checklist`, { method: "PATCH", json: { itemIds: ordered.map((item) => item.id) } });
    } catch (error) {
      setItems(previous);
      toast.error(`Order not saved: ${error instanceof Error ? error.message : "error"}. Reverted.`);
    }
  }

  async function rename() {
    if (!editing) return;
    const title = editing.title.trim();
    if (!title) return;
    try {
      await apiFetch(`/api/items/${editing.id}`, { method: "PATCH", json: { title } });
      setItems((current) => current.map((item) => (item.id === editing.id ? { ...item, title } : item)));
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename.");
    }
  }

  async function remove(item: ChecklistItem) {
    const previous = items;
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    try {
      await apiFetch(`/api/items/${item.id}`, { method: "DELETE" });
    } catch (error) {
      setItems(previous);
      toast.error(`Not deleted: ${error instanceof Error ? error.message : "error"}. Restored.`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium tabular-nums" aria-live="polite">
          {state.checked}/{state.total} done
        </p>
        {tabItems.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => setChecked(tabItems.map((item) => item.id), state.state !== "checked")}>
            {state.state === "checked" ? "Uncheck all" : "Check all"}
          </Button>
        ) : null}
      </div>
      {tabItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">No items yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {tabItems.map((item, index) => (
            <li key={item.id} className="flex items-center gap-1">
              {editing?.id === item.id ? (
                <form
                  className="flex flex-1 items-center gap-2 px-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void rename();
                  }}
                >
                  <label htmlFor={`rename-${item.id}`} className="sr-only">
                    Item title
                  </label>
                  <Input
                    id={`rename-${item.id}`}
                    autoFocus
                    value={editing.title}
                    maxLength={500}
                    onChange={(event) => setEditing({ id: item.id, title: event.target.value })}
                    onKeyDown={(event) => event.key === "Escape" && setEditing(null)}
                  />
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <CheckRow
                    id={`item-${item.id}`}
                    className="flex-1"
                    checked={rowFor(progress, item.id).is_checked}
                    onChange={(checked) => setChecked([item.id], checked)}
                    label={item.title}
                  />
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${item.title} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${item.title} down`} disabled={index === tabItems.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Rename ${item.title}`} onClick={() => setEditing({ id: item.id, title: item.title })}>
                    <Pencil aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.title}`} onClick={() => remove(item)}>
                    <Trash2 aria-hidden />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor={`add-${tab.id}`} className="sr-only">
          New item in {tab.title}
        </label>
        <Input id={`add-${tab.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add an item" maxLength={500} />
        <Button type="submit" disabled={adding || !draft.trim()}>
          {adding ? <Loader2 aria-hidden className="animate-spin" /> : <Plus aria-hidden />} Add
        </Button>
      </form>
    </div>
  );
}

function TabNameDialog({
  state,
  tabs,
  onClose,
  onSubmit,
}: {
  state: { mode: "add"; type: CustomTab["type"] } | { mode: "rename"; id: string } | null;
  tabs: CustomTab[];
  onClose: () => void;
  onSubmit: (title: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const current = state?.mode === "rename" ? tabs.find((tab) => tab.id === state.id)?.title : "";
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.mode === "rename" ? "Rename tab" : state?.type === "checklist" ? "New checklist tab" : "New Markdown tab"}</DialogTitle>
          <DialogDescription>Tabs appear in the order shown and can be reordered later.</DialogDescription>
        </DialogHeader>
        <form
          key={state ? JSON.stringify(state) : "closed"}
          action={async (formData) => {
            setPending(true);
            try {
              await onSubmit(String(formData.get("title") ?? "").trim());
            } catch {
              // error already reported
            } finally {
              setPending(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="tab-title">Tab title</Label>
            <Input id="tab-title" name="title" defaultValue={current ?? ""} required maxLength={60} autoFocus />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDetailsDialog({
  open,
  onOpenChange,
  entry,
  platform,
  isGame,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: CustomEntryData["entry"];
  platform: string | null;
  isGame: boolean;
  onSave: (values: { title: string; coverUrl: string; bannerUrl: string; platform?: string }) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>Artwork must be an https URL on an allowed image host.</DialogDescription>
        </DialogHeader>
        <form
          action={async (formData) => {
            setPending(true);
            setError(null);
            try {
              await onSave({
                title: String(formData.get("title") ?? ""),
                coverUrl: String(formData.get("coverUrl") ?? ""),
                bannerUrl: String(formData.get("bannerUrl") ?? ""),
                ...(isGame ? { platform: String(formData.get("platform") ?? "") } : {}),
              });
              onOpenChange(false);
            } catch (saveError) {
              setError(saveError instanceof Error ? saveError.message : "Could not save.");
            } finally {
              setPending(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" name="title" defaultValue={entry.title} required maxLength={300} />
          </div>
          {isGame ? (
            <div className="space-y-1.5">
              <Label htmlFor="edit-platform">Platform</Label>
              <Input id="edit-platform" name="platform" defaultValue={platform ?? ""} maxLength={80} />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="edit-cover">Cover image URL</Label>
            <Input id="edit-cover" name="coverUrl" type="url" defaultValue={entry.cover_url ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-banner">Banner image URL</Label>
            <Input id="edit-banner" name="bannerUrl" type="url" defaultValue={entry.banner_url ?? ""} />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
