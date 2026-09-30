"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CheckRow } from "@/components/media/check-row";
import { ProgressMeter } from "@/components/media/progress-meter";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { MAX_ITEMS_PER_REQUEST, itemLabelSchema, splitLines } from "@/lib/validation/workspace";
import type { ChecklistItem, NodeDetail } from "@/lib/workspace/tree";
import { errorMessage } from "./client-utils";
import { SaveStatus, type SaveState } from "./save-status";

/**
 * Editable checklist. Changes apply optimistically and are sent one at a time
 * in order, so rapid toggles can never arrive out of order; failures roll the
 * affected item back and are reported.
 */
export function ChecklistEditor({
  detail,
  autoFocus,
  onItemsChange,
}: {
  detail: NodeDetail;
  autoFocus?: boolean;
  onItemsChange: (fileId: string, items: ChecklistItem[]) => void;
}) {
  const fileId = detail.node.id;
  const name = detail.node.name;
  const [items, setItems] = useState(() => [...detail.items].sort((a, b) => a.position - b.position));
  const [pending, setPending] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const renamingRef = useRef(false);

  const checked = items.filter((item) => item.checked).length;
  const state: SaveState = pending > 0 ? { kind: "saving" } : lastError ? { kind: "error", message: lastError } : { kind: "saved" };

  const report = useEffectEvent((next: ChecklistItem[]) => onItemsChange(fileId, next));
  useEffect(() => report(items), [items]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  /** Run a server change after the previous one; `undo` restores local state on failure. */
  function run<T>(failure: string, op: () => Promise<T>, undo?: () => void): Promise<T | undefined> {
    setPending((count) => count + 1);
    const task = chainRef.current.then(op);
    chainRef.current = task.catch(() => undefined);
    return task
      .then(
        (value) => {
          setLastError(null);
          return value;
        },
        (error: unknown) => {
          undo?.();
          const message = errorMessage(error);
          setLastError(message);
          toast.error(`${failure}: ${message}`);
          return undefined;
        },
      )
      .finally(() => setPending((count) => count - 1));
  }

  async function resync() {
    try {
      const latest = await apiFetch<NodeDetail>(`/api/nodes/${fileId}`);
      setItems([...latest.items].sort((a, b) => a.position - b.position));
    } catch {
      // The failure itself was already reported.
    }
  }

  function toggle(item: ChecklistItem, value: boolean) {
    const patch = (to: boolean) => setItems((current) => current.map((candidate) => (candidate.id === item.id ? { ...candidate, checked: to } : candidate)));
    patch(value);
    void run(`“${item.label}” not saved`, () => apiFetch(`/api/items/${item.id}`, { method: "PATCH", json: { checked: value } }), () => patch(!value));
  }

  function setAll(value: boolean) {
    const count = items.filter((item) => item.checked !== value).length;
    if (count === 0) return;
    if (!value && checked > 3 && !window.confirm(`Uncheck all ${checked} items in “${name}”?`)) return;
    setItems((current) => current.map((item) => ({ ...item, checked: value })));
    void run("Checklist not saved", () => apiFetch(`/api/nodes/${fileId}/items`, { method: "PATCH", json: { checked: value } }), () => void resync());
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const labels = splitLines(draft);
    if (labels.length === 0) return;
    for (const label of labels) {
      const parsed = itemLabelSchema.safeParse(label);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Invalid label.");
        return;
      }
    }
    if (labels.length > MAX_ITEMS_PER_REQUEST) {
      toast.error(`Add at most ${MAX_ITEMS_PER_REQUEST} items at once.`);
      return;
    }
    setAdding(true);
    const result = await run("Items not added", () =>
      apiFetch<{ items: ChecklistItem[] }>(`/api/nodes/${fileId}/items`, { method: "POST", json: { labels } }),
    );
    setAdding(false);
    if (result) {
      setItems((current) => [...current, ...result.items].sort((a, b) => a.position - b.position));
      setDraft((current) => (current === draft ? "" : current));
      inputRef.current?.focus();
    }
  }

  function rename() {
    if (!editing) return;
    const parsed = itemLabelSchema.safeParse(editing.label);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid label.");
      return;
    }
    const item = items.find((candidate) => candidate.id === editing.id);
    setEditing(null);
    if (!item || item.label === parsed.data) return;
    const patch = (label: string) => setItems((current) => current.map((candidate) => (candidate.id === item.id ? { ...candidate, label } : candidate)));
    patch(parsed.data);
    void run("Rename not saved", () => apiFetch(`/api/items/${item.id}`, { method: "PATCH", json: { label: parsed.data } }), () => patch(item.label));
  }

  function remove(item: ChecklistItem) {
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    void run(
      `“${item.label}” not deleted`,
      () => apiFetch(`/api/items/${item.id}`, { method: "DELETE" }),
      () => setItems((current) => [...current, item].sort((a, b) => a.position - b.position)),
    );
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ordered = [...items];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const next = ordered.map((item, position) => ({ ...item, position }));
    setItems(next);
    void run("Order not saved", () => apiFetch(`/api/nodes/${fileId}/items`, { method: "PUT", json: { itemIds: next.map((item) => item.id) } }), () => void resync());
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-[6.25rem] z-10 flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-card px-4 py-1.5 md:px-8">
        <SaveStatus state={state} />
        {items.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => setAll(checked !== items.length)}>
            {checked === items.length ? "Uncheck all" : "Check all"}
          </Button>
        ) : null}
      </div>

      <div className="px-2 py-4 md:px-6">
        {items.length > 0 ? (
          <ProgressMeter done={checked} total={items.length} label="done" className="mb-4 max-w-sm px-2" />
        ) : (
          <p className="px-2 pb-3 text-sm text-muted-foreground">No items yet. Add your first one below.</p>
        )}

        <ul aria-label={`${name} items`} className="space-y-0.5">
          {items.map((item, index) => (
            <li key={item.id} className="group/item flex items-center gap-1">
              {editing?.id === item.id ? (
                <form
                  className="flex flex-1 items-center gap-2 px-2 py-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    rename();
                  }}
                >
                  <Input
                    autoFocus
                    aria-label="Item label"
                    value={editing.label}
                    maxLength={500}
                    onChange={(event) => setEditing({ id: item.id, label: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setEditing(null);
                    }}
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
                    className="min-w-0 flex-1"
                    checked={item.checked}
                    onChange={(value) => toggle(item, value)}
                    label={item.label}
                  />
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${item.label}`}
                        className="text-muted-foreground opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onCloseAutoFocus={(event) => {
                        // Leave focus on the rename input instead of the menu button.
                        if (renamingRef.current) event.preventDefault();
                        renamingRef.current = false;
                      }}
                    >
                      <DropdownMenuItem
                        onSelect={() => {
                          renamingRef.current = true;
                          setEditing({ id: item.id, label: item.label });
                        }}
                      >
                        <Pencil aria-hidden /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={index === 0} onSelect={() => move(index, -1)}>
                        <ArrowUp aria-hidden /> Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={index === items.length - 1} onSelect={() => move(index, 1)}>
                        <ArrowDown aria-hidden /> Move down
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => remove(item)}>
                        <Trash2 aria-hidden /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={add} className="mt-4 flex items-start gap-2 px-2">
          <Textarea
            ref={inputRef}
            rows={1}
            aria-label={`New item in ${name}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Add an item"
            maxLength={100_000}
            className="max-h-48 min-h-9 resize-none py-1.5"
          />
          <Button type="submit" className="h-9" disabled={adding || !draft.trim()}>
            {adding ? <Loader2 aria-hidden className="animate-spin" /> : <Plus aria-hidden />} Add
          </Button>
        </form>
        <p className="mt-1.5 px-2 text-xs text-muted-foreground" aria-live="polite">
          {splitLines(draft).length > 1
            ? `${splitLines(draft).length} items will be added, one per line.`
            : "Enter adds the item. Paste a list to add one item per line."}
        </p>
      </div>
    </div>
  );
}
