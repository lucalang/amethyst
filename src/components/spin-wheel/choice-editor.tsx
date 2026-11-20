"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowDownAZ, Eraser, GripVertical, ListPlus, MoreHorizontal, Paintbrush, Pencil, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DropSlot, sortRowClass, useListDrag } from "@/components/ui/list-drag";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_CHOICE_LENGTH,
  MAX_CHOICES,
  newChoiceId,
  PALETTES,
  parseChoiceLines,
  randomIndex,
  type PaletteId,
  type WheelChoice,
} from "@/lib/spin-wheel";
import { cn } from "@/lib/utils";

type Props = {
  choices: WheelChoice[];
  colors: readonly string[];
  palette: PaletteId;
  disabled: boolean;
  onChange: (choices: WheelChoice[], message?: string) => void;
};

const EXTRA_COLORS = ["#ffffff", "#111827", "#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#ec4899"];

function relocate(list: WheelChoice[], id: string, target: number) {
  const from = list.findIndex((item) => item.id === id);
  const to = Math.max(0, Math.min(list.length - 1, target));
  if (from < 0 || from === to) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Edit a wheel's choices: add or paste lines, rename inline, recolor, reorder (drag or keys) and remove. */
export function ChoiceEditor({ choices, colors, palette, disabled, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [textOpen, setTextOpen] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const addId = useId();
  const room = MAX_CHOICES - choices.length;
  const pending = parseChoiceLines(draft);

  function change(next: WheelChoice[], message?: string) {
    onChange(next, message);
    if (message) setAnnouncement(message);
  }

  function add() {
    const { labels, shortened } = parseChoiceLines(draft);
    if (!labels.length) {
      setNote("Type a choice first. Paste several lines to add many at once.");
      return;
    }
    const added = labels.slice(0, room);
    const skipped = labels.length - added.length;
    change([...choices, ...added.map((label) => ({ id: newChoiceId(), label, color: null }))], `${added.length === 1 ? `“${added[0]}”` : `${added.length} choices`} added.`);
    setDraft("");
    const notes = [
      skipped > 0 ? `${skipped} line${skipped === 1 ? "" : "s"} not added: a wheel holds at most ${MAX_CHOICES} choices.` : null,
      shortened > 0 ? `${shortened} long line${shortened === 1 ? " was" : "s were"} shortened to ${MAX_CHOICE_LENGTH} characters.` : null,
    ].filter(Boolean);
    setNote(notes.length ? notes.join(" ") : null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }

  function move(id: string, delta: number) {
    const index = choices.findIndex((choice) => choice.id === id);
    const next = relocate(choices, id, index + delta);
    if (next === choices) return;
    change(next, `${choices[index].label}, position ${index + delta + 1} of ${choices.length}.`);
    requestAnimationFrame(() => document.getElementById(`choice-${id}-handle`)?.focus());
  }

  function remove(id: string) {
    const index = choices.findIndex((choice) => choice.id === id);
    const next = choices.filter((choice) => choice.id !== id);
    change(next, `“${choices[index].label}” removed.`);
    const neighbour = next[Math.min(index, next.length - 1)];
    requestAnimationFrame(() => document.getElementById(neighbour ? `choice-${neighbour.id}-remove` : addId)?.focus());
  }

  const { dragId, slot, startDrag, rowStyle } = useListDrag({
    ids: choices.map((choice) => choice.id),
    containerRef: listRef,
    scrollRef,
    label: (id) => choices.find((choice) => choice.id === id)?.label ?? "Choice",
    onAnnounce: setAnnouncement,
    onDrop: (id, to) => {
      const next = relocate(choices, id, to);
      if (next !== choices) onChange(next);
    },
  });

  function onHandleKey(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      move(id, event.key === "ArrowUp" ? -1 : 1);
    }
  }

  function shuffle() {
    const next = [...choices];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const swap = randomIndex(index + 1);
      [next[index], next[swap]] = [next[swap], next[index]];
    }
    change(next, "Choices shuffled.");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Choices <span className="ml-1 text-xs font-normal text-muted-foreground tabular-nums">{choices.length} / {MAX_CHOICES}</span>
        </h3>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" disabled={disabled} onClick={() => setTextOpen(true)}>
            <Pencil aria-hidden className="size-3.5" />
            Edit as text
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="More choice actions" disabled={disabled || choices.length === 0} className="text-muted-foreground">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem disabled={choices.length < 2} onSelect={shuffle}>
                <Shuffle aria-hidden /> Shuffle order
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={choices.length < 2}
                onSelect={() => change([...choices].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true })), "Choices sorted A to Z.")}
              >
                <ArrowDownAZ aria-hidden /> Sort A–Z
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!choices.some((choice) => choice.color)}
                onSelect={() => change(choices.map((choice) => ({ ...choice, color: null })), "Custom colors cleared.")}
              >
                <Paintbrush aria-hidden /> Use palette colors
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => change([], "All choices cleared. Discard changes to get them back.")}>
                <Eraser aria-hidden /> Clear all choices
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <p id="choice-reorder-help" className="sr-only">
        Drag the handle to reorder, or focus it and press the up and down arrow keys.
      </p>
      {choices.length ? (
        <div ref={scrollRef} className="-mx-1 max-h-[22rem] overflow-y-auto px-1 py-0.5">
          <ol ref={listRef} aria-label="Choices" className={cn("relative space-y-1", dragId && "cursor-grabbing select-none")}>
            <DropSlot slot={slot} className="rounded-lg" />
            {choices.map((choice, index) => {
              const dragging = dragId === choice.id;
              return (
                <li
                  key={choice.id}
                  data-sort-id={choice.id}
                  style={rowStyle(choice.id)}
                  className={cn("flex min-w-0 items-center gap-1 rounded-lg border p-0.5", sortRowClass(dragging), !dragging && "border-transparent hover:border-border")}
                >
                  <button
                    type="button"
                    id={`choice-${choice.id}-handle`}
                    aria-label={`Reorder ${choice.label}, position ${index + 1} of ${choices.length}`}
                    aria-describedby="choice-reorder-help"
                    title="Drag to reorder"
                    disabled={disabled}
                    className={cn(
                      "grid h-8 w-6 shrink-0 touch-none place-items-center rounded-md text-muted-foreground transition-colors outline-none select-none hover:bg-amethyst/[0.08] hover:text-amethyst focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 pointer-coarse:w-8",
                      dragging ? "cursor-grabbing bg-amethyst/15 text-amethyst" : "cursor-grab",
                    )}
                    onPointerDown={(event) => startDrag(event, choice.id)}
                    onContextMenu={(event) => event.preventDefault()}
                    onKeyDown={(event) => onHandleKey(event, choice.id)}
                  >
                    <GripVertical aria-hidden className="size-4" />
                  </button>
                  <ColorPicker
                    label={choice.label}
                    color={colors[index]}
                    custom={choice.color}
                    palette={palette}
                    disabled={disabled}
                    onPick={(color) => change(choices.map((item) => (item.id === choice.id ? { ...item, color } : item)))}
                  />
                  <LabelInput
                    choice={choice}
                    index={index}
                    disabled={disabled}
                    onCommit={(label) => onChange(choices.map((item) => (item.id === choice.id ? { ...item, label } : item)))}
                  />
                  <Button
                    id={`choice-${choice.id}-remove`}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${choice.label}`}
                    title="Remove"
                    disabled={disabled}
                    className="shrink-0 text-muted-foreground hover:text-rose pointer-coarse:size-9"
                    onClick={() => remove(choice.id)}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <p className="ui-empty px-4 py-5 text-center text-xs text-muted-foreground">No choices yet. Add at least two to spin.</p>
      )}

      <div className="space-y-1.5">
        <label htmlFor={addId} className="text-xs font-medium text-muted-foreground">
          Add choices
        </label>
        <div className="flex items-start gap-2">
          <Textarea
            id={addId}
            value={draft}
            disabled={disabled || room <= 0}
            rows={draft.includes("\n") ? Math.min(6, draft.split("\n").length) : 1}
            placeholder={room > 0 ? "One per line — paste a list to add many" : "This wheel is full"}
            aria-describedby={`${addId}-help`}
            className="min-h-9 resize-none py-2 text-sm"
            onChange={(event) => {
              setDraft(event.target.value);
              setNote(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="outline" className="h-9 shrink-0 gap-1.5 px-3" disabled={disabled || room <= 0 || !pending.labels.length} onClick={add}>
            <ListPlus aria-hidden className="size-4" />
            {pending.labels.length > 1 ? `Add ${Math.min(pending.labels.length, room)}` : "Add"}
          </Button>
        </div>
        <p id={`${addId}-help`} className="text-[11px] leading-4 text-muted-foreground">
          Enter adds, Shift+Enter starts a new line. Blank lines and extra spaces are ignored; duplicates are kept. Up to {MAX_CHOICES} choices of{" "}
          {MAX_CHOICE_LENGTH} characters.
        </p>
        {note ? (
          <p role="status" className="text-xs text-warning">
            {note}
          </p>
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <TextEditDialog open={textOpen} onOpenChange={setTextOpen} choices={choices} onApply={(next) => change(next, `List updated: ${next.length} choices.`)} />
    </div>
  );
}

/** Inline rename: typing updates the wheel live; clearing a label and leaving restores the previous one. */
function LabelInput({ choice, index, disabled, onCommit }: { choice: WheelChoice; index: number; disabled: boolean; onCommit: (label: string) => void }) {
  const [value, setValue] = useState(choice.label);
  const [editing, setEditing] = useState(false);
  const shown = editing ? value : choice.label;
  return (
    <input
      value={shown}
      maxLength={MAX_CHOICE_LENGTH}
      disabled={disabled}
      aria-label={`Choice ${index + 1}`}
      className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
      onFocus={() => {
        setValue(choice.label);
        setEditing(true);
      }}
      onChange={(event) => {
        setValue(event.target.value);
        const label = event.target.value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
        if (label) onCommit(label);
      }}
      onBlur={() => setEditing(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setValue(choice.label);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ColorPicker({
  label,
  color,
  custom,
  palette,
  disabled,
  onPick,
}: {
  label: string;
  color: string;
  custom: string | null;
  palette: PaletteId;
  disabled: boolean;
  onPick: (color: string | null) => void;
}) {
  const swatches = [...new Set<string>([...PALETTES[palette].colors, ...EXTRA_COLORS])];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Color for ${label}${custom ? " (custom)" : " (from palette)"}`}
          title="Slice color"
          className="grid size-8 shrink-0 place-items-center rounded-md outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <span aria-hidden className={cn("size-4 rounded-full ring-1 ring-white/30", custom && "ring-2 ring-offset-1 ring-offset-background")} style={{ backgroundColor: color }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 space-y-3 p-3">
        <p className="text-xs font-medium">Slice color</p>
        <div role="group" aria-label="Colors" className="grid grid-cols-7 gap-1.5">
          {swatches.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              aria-pressed={custom === swatch}
              className="size-6 rounded-full ring-1 ring-white/25 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-foreground"
              style={{ backgroundColor: swatch }}
              onClick={() => onPick(swatch)}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input type="color" value={custom ?? color} onChange={(event) => onPick(event.target.value.toLowerCase())} className="size-7 cursor-pointer rounded border-0 bg-transparent p-0" />
            Custom
          </label>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={!custom} onClick={() => onPick(null)}>
            Use palette
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Edit every choice at once as lines of text. Lines that still match a choice keep its color. */
function TextEditDialog({
  open,
  onOpenChange,
  choices,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choices: WheelChoice[];
  onApply: (choices: WheelChoice[]) => void;
}) {
  const [text, setText] = useState("");
  const parsed = parseChoiceLines(text);
  const over = parsed.labels.length > MAX_CHOICES;

  function apply() {
    const pool = [...choices];
    const next = parsed.labels.slice(0, MAX_CHOICES).map((label) => {
      const match = pool.findIndex((choice) => choice.label === label);
      if (match >= 0) return { ...pool.splice(match, 1)[0], label };
      return { id: newChoiceId(), label, color: null };
    });
    onApply(next);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setText(choices.map((choice) => choice.label).join("\n"));
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={() => setText(choices.map((choice) => choice.label).join("\n"))}
      >
        <DialogHeader>
          <DialogTitle>Edit choices as text</DialogTitle>
          <DialogDescription>One choice per line, in wheel order. Blank lines are ignored and duplicates are kept.</DialogDescription>
        </DialogHeader>
        <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={12} className="font-mono text-sm" aria-label="Choices, one per line" />
        <p className={cn("text-xs", over ? "text-warning" : "text-muted-foreground")}>
          {parsed.labels.length} choice{parsed.labels.length === 1 ? "" : "s"}
          {over ? ` — only the first ${MAX_CHOICES} will be kept.` : "."}
          {parsed.shortened ? ` ${parsed.shortened} long line${parsed.shortened === 1 ? "" : "s"} will be shortened to ${MAX_CHOICE_LENGTH} characters.` : ""}
        </p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={apply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
