"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { Copy, Disc3, Loader2, MoreHorizontal, Pencil, Plus, RotateCcw, Save, Trash2, Undo2, Volume2, VolumeX, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/components/workspace/client-utils";
import { apiFetch } from "@/lib/api-client";
import {
  DURATIONS,
  MAX_WHEEL_NAME,
  MAX_WHEELS,
  MIN_SPIN_CHOICES,
  PALETTE_IDS,
  PALETTES,
  randomIndex,
  sameContent,
  sliceColors,
  starterWheel,
  type DurationId,
  type SavedWheel,
  type WheelChoice,
  type WheelContent,
} from "@/lib/spin-wheel";
import { cn } from "@/lib/utils";
import { ChoiceEditor } from "./choice-editor";
import { useWheelSpin, Wheel } from "./wheel";
import "./spin-wheel.css";

type Result = { id: string; label: string; color: string; spin: number };
type Removed = { choice: WheelChoice; index: number };

const contentOf = (wheel: SavedWheel): WheelContent => ({
  name: wheel.name,
  choices: wheel.choices.map((choice) => ({ ...choice })),
  settings: { ...wheel.settings },
});

/** Fixed confetti layout for the winner popup (deterministic, so renders stay pure). */
const CONFETTI = Array.from({ length: 70 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return {
    left: r(1) * 100,
    delay: Math.round(r(2) * 500),
    duration: Math.round(2200 + r(3) * 1600),
    drift: Math.round((r(4) - 0.5) * 240),
    turn: Math.round(360 + r(5) * 720),
  };
});

const byRecent = (a: SavedWheel, b: SavedWheel) => b.updatedAt.localeCompare(a.updatedAt);

/**
 * The Spin Wheel page. The open wheel is edited as a draft; nothing is stored until Save, and Discard returns to
 * the saved version. Saved wheels live in the user's account (public.spin_wheels), so they follow them to every
 * device. Spins use the draft as shown, and the result is picked before the wheel moves.
 */
export function SpinWheelStudio({ initialWheels, initialId }: { initialWheels: SavedWheel[]; initialId: string | null }) {
  const [wheels, setWheels] = useState(() => [...initialWheels].sort(byRecent));
  const [currentId, setCurrentId] = useState<string | null>(initialId ?? initialWheels[0]?.id ?? null);
  const [draft, setDraft] = useState<WheelContent>(() => {
    const first = initialWheels.find((wheel) => wheel.id === (initialId ?? initialWheels[0]?.id));
    return first ? contentOf(first) : starterWheel(initialWheels.length ? "New wheel" : "What’s for dinner?");
  });
  /** What a new, never-saved wheel started as, so untouched starters don't nag about discarding. */
  const [fresh, setFresh] = useState<WheelContent | null>(() => (currentId ? null : draft));
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  /** The landed-result popup; it opens each time the wheel stops. */
  const [popupOpen, setPopupOpen] = useState(false);
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [status, setStatus] = useState("");
  const [renaming, setRenaming] = useState<SavedWheel | null>(null);
  const [deleting, setDeleting] = useState<SavedWheel | null>(null);
  const spinLock = useRef(false);
  const spinCount = useRef(0);
  const { rotorRef, pointerRef, spinning, spin } = useWheelSpin();
  const nameId = useId();

  const saved = currentId ? (wheels.find((wheel) => wheel.id === currentId) ?? null) : null;
  const dirty = saved ? !sameContent(draft, saved) : fresh ? !sameContent(draft, fresh) : true;
  const unsaved = !saved || dirty;
  const colors = useMemo(() => sliceColors(draft.choices, draft.settings.palette), [draft.choices, draft.settings.palette]);
  const canSpin = draft.choices.length >= MIN_SPIN_CHOICES;
  const winnerId = result && draft.choices.some((choice) => choice.id === result.id) ? result.id : null;
  const resultStillOnWheel = winnerId !== null;

  // Keep the open wheel in the address, so it can be bookmarked or reopened after a reload.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (currentId) url.searchParams.set("wheel", currentId);
    else url.searchParams.delete("wheel");
    window.history.replaceState(window.history.state, "", url);
  }, [currentId]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!(saved ? dirty : fresh ? dirty : false)) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saved, dirty, fresh]);

  function update(patch: Partial<WheelContent>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function confirmLeave() {
    if (!dirty) return true;
    return window.confirm(`Discard unsaved changes to “${draft.name || "this wheel"}”?`);
  }

  function resetSpin() {
    setResult(null);
    setPopupOpen(false);
    setRemoved(null);
    setHistory([]);
    setStatus("");
  }

  function open(wheel: SavedWheel) {
    if (spinning || wheel.id === currentId || !confirmLeave()) return;
    setCurrentId(wheel.id);
    setDraft(contentOf(wheel));
    setFresh(null);
    resetSpin();
  }

  function startNew() {
    if (spinning || !confirmLeave()) return;
    const next = starterWheel();
    setCurrentId(null);
    setDraft(next);
    setFresh(next);
    resetSpin();
    requestAnimationFrame(() => {
      const input = document.getElementById(nameId) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  function discard() {
    if (saved) setDraft(contentOf(saved));
    else if (fresh) setDraft(fresh);
    setRemoved(null);
    setStatus("Changes discarded.");
  }

  const store = useCallback((wheel: SavedWheel) => {
    setWheels((current) => [wheel, ...current.filter((item) => item.id !== wheel.id)].sort(byRecent));
  }, []);

  async function save() {
    if (saving || spinning) return;
    const name = draft.name.trim();
    if (!name) {
      toast.error("Give the wheel a name before saving.");
      document.getElementById(nameId)?.focus();
      return;
    }
    if (saved && !dirty) return;
    setSaving(true);
    try {
      const body = { name, choices: draft.choices, settings: draft.settings };
      const { wheel } = saved
        ? await apiFetch<{ wheel: SavedWheel }>(`/api/spin-wheels/${saved.id}`, { method: "PATCH", json: { ...body, expectedVersion: saved.version } })
        : await apiFetch<{ wheel: SavedWheel }>("/api/spin-wheels", { method: "POST", json: body });
      store(wheel);
      setCurrentId(wheel.id);
      setDraft(contentOf(wheel));
      setFresh(null);
      setRemoved(null);
      toast.success(saved ? `“${wheel.name}” saved` : `“${wheel.name}” saved to your wheels`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  // Ctrl/⌘+S saves the open wheel.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function duplicate(wheel: SavedWheel) {
    if (wheels.length >= MAX_WHEELS) {
      toast.error(`You can save up to ${MAX_WHEELS} wheels. Delete one to make room.`);
      return;
    }
    try {
      const name = `${wheel.name.slice(0, MAX_WHEEL_NAME - 5).trimEnd()} copy`;
      const { wheel: copy } = await apiFetch<{ wheel: SavedWheel }>("/api/spin-wheels", {
        method: "POST",
        json: { name, choices: wheel.choices, settings: wheel.settings },
      });
      store(copy);
      toast.success(`Saved a copy: “${copy.name}”`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function rename(wheel: SavedWheel, name: string) {
    const { wheel: next } = await apiFetch<{ wheel: SavedWheel }>(`/api/spin-wheels/${wheel.id}`, {
      method: "PATCH",
      json: { name, expectedVersion: wheel.version },
    });
    store(next);
    // The draft follows the new name unless it was being renamed there too.
    if (wheel.id === currentId) setDraft((current) => (current.name === wheel.name ? { ...current, name: next.name } : current));
    toast.success(`Renamed to “${next.name}”`);
  }

  async function remove(wheel: SavedWheel) {
    await apiFetch(`/api/spin-wheels/${wheel.id}`, { method: "DELETE" });
    const rest = wheels.filter((item) => item.id !== wheel.id);
    setWheels(rest);
    if (wheel.id === currentId) {
      const next = rest[0];
      setCurrentId(next?.id ?? null);
      const content = next ? contentOf(next) : starterWheel();
      setDraft(content);
      setFresh(next ? null : content);
      resetSpin();
    }
    toast.success(`Deleted “${wheel.name}”`);
  }

  function doSpin() {
    if (spinLock.current || spinning || !canSpin) return;
    spinLock.current = true;
    // The result is decided here, uniformly at random, before anything moves.
    const index = randomIndex(draft.choices.length);
    const choice = draft.choices[index];
    const landed: Result = { id: choice.id, label: choice.label, color: colors[index], spin: ++spinCount.current };
    setResult(null);
    setPopupOpen(false);
    setRemoved(null);
    setStatus("Spinning…");
    spin({
      index,
      count: draft.choices.length,
      duration: draft.settings.duration,
      sound: draft.settings.sound,
      onLand: () => {
        setResult(landed);
        setPopupOpen(true);
        setHistory((current) => [landed, ...current].slice(0, 12));
        setStatus(`Result: ${landed.label}`);
        // A short pause stops a double press from immediately spinning again.
        window.setTimeout(() => {
          spinLock.current = false;
        }, 450);
      },
    });
  }

  function removeResult() {
    if (!result || spinning) return;
    const index = draft.choices.findIndex((choice) => choice.id === result.id);
    if (index < 0) return;
    const choice = draft.choices[index];
    update({ choices: draft.choices.filter((item) => item.id !== result.id) });
    setRemoved({ choice, index });
    setStatus(`“${choice.label}” removed from the wheel. Undo is available.`);
    toast(`Removed “${choice.label}”`, {
      description: saved ? "Save to keep this change, or undo it." : undefined,
      action: { label: "Undo", onClick: () => restore({ choice, index }) },
    });
  }

  function restore(entry: Removed | null = removed) {
    if (!entry) return;
    setDraft((current) => {
      if (current.choices.some((choice) => choice.id === entry.choice.id)) return current;
      const choices = [...current.choices];
      choices.splice(Math.min(entry.index, choices.length), 0, entry.choice);
      return { ...current, choices };
    });
    setRemoved(null);
    setStatus(`“${entry.choice.label}” is back on the wheel.`);
  }

  const durationName = `${nameId}-duration`;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      {/* Stage */}
      <section aria-labelledby={`${nameId}-stage`} className="ui-panel overflow-hidden p-4 sm:p-6 lg:sticky lg:top-20" data-glow>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 id={`${nameId}-stage`} className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">
            {draft.name.trim() || "Untitled wheel"}
          </h2>
          {unsaved ? (
            <span className="ui-pill" data-tone style={{ "--tone": "var(--warning)" } as CSSProperties}>
              {saved ? "Unsaved changes" : "Not saved yet"}
            </span>
          ) : (
            <span className="ui-pill">Saved</span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={draft.settings.sound ? "Mute wheel sounds" : "Turn on wheel sounds"}
            aria-pressed={draft.settings.sound}
            title={draft.settings.sound ? "Sound on" : "Sound off"}
            onClick={() => update({ settings: { ...draft.settings, sound: !draft.settings.sound } })}
          >
            {draft.settings.sound ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
          </Button>
        </div>

        <Wheel
          choices={draft.choices}
          colors={colors}
          winnerId={winnerId}
          rotorRef={rotorRef}
          pointerRef={pointerRef}
          spinning={spinning}
          onSpin={doSpin}
        />
        <p className="sr-only">
          {draft.choices.length
            ? `The wheel has ${draft.choices.length} choices: ${draft.choices.map((choice) => choice.label).join(", ")}.`
            : "The wheel has no choices yet."}
        </p>

        <div className="mt-5 flex flex-col items-center gap-2">
          <Button
            type="button"
            size="lg"
            className="spin-wheel-button h-12 min-w-44 gap-2 rounded-full px-8 text-base font-bold"
            disabled={!canSpin}
            // Not `disabled` while spinning, so keyboard focus stays on the button for the next spin.
            aria-disabled={spinning || undefined}
            aria-describedby={canSpin ? undefined : `${nameId}-spin-help`}
            onClick={doSpin}
          >
            {spinning ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Disc3 aria-hidden className="size-5" />}
            {spinning ? "Spinning…" : result ? "Spin again" : "Spin"}
          </Button>
          {!canSpin ? (
            <p id={`${nameId}-spin-help`} className="text-xs text-muted-foreground">
              Add at least {MIN_SPIN_CHOICES} choices to spin.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Every choice has the same chance. You can also click the wheel.</p>
          )}
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>

        {result ? (
          <div key={result.spin} className="spin-result mt-5 rounded-2xl border p-4 text-center" style={{ "--slice": result.color } as CSSProperties}>
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground">The wheel picked</p>
            <p className="mt-1 flex items-center justify-center gap-2 text-2xl font-extrabold tracking-tight break-words">
              <span aria-hidden className="size-3 shrink-0 rounded-full ring-2 ring-white/40" style={{ backgroundColor: result.color }} />
              {result.label}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {resultStillOnWheel ? (
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={spinning} onClick={removeResult}>
                  <X aria-hidden className="size-3.5" />
                  Remove from wheel
                </Button>
              ) : null}
              {removed && removed.choice.id === result.id ? (
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => restore()}>
                  <Undo2 aria-hidden className="size-3.5" />
                  Undo remove
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {history.length > 1 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground">Earlier this visit</p>
            <ol aria-label="Earlier results, newest first" className="mt-2 flex flex-wrap gap-1.5">
              {history.slice(1).map((entry) => (
                <li key={entry.spin} className="ui-pill gap-1.5">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.label}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <div className="space-y-4">
        {/* Saved wheels */}
        <section aria-labelledby={`${nameId}-saved`} className="ui-panel p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id={`${nameId}-saved`} className="text-sm font-semibold">
              Your wheels <span className="ml-1 text-xs font-normal text-muted-foreground tabular-nums">{wheels.length}</span>
            </h2>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={spinning} onClick={startNew}>
              <Plus aria-hidden className="size-3.5" />
              New wheel
            </Button>
          </div>
          <ul className="-mx-1 max-h-64 space-y-0.5 overflow-y-auto px-1 py-0.5">
            {!saved ? (
              <li className="flex h-11 items-center gap-2.5 rounded-lg bg-amethyst/[0.12] px-2.5 shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.25)]">
                <Disc3 aria-hidden className="size-4 shrink-0 text-amethyst" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{draft.name.trim() || "Untitled wheel"}</span>
                <span className="text-[11px] text-warning">Not saved</span>
              </li>
            ) : null}
            {wheels.map((wheel) => {
              const active = wheel.id === currentId;
              const swatch = sliceColors(wheel.choices.slice(0, 4), wheel.settings.palette);
              return (
                <li key={wheel.id} className={cn("group/wheel flex items-center gap-1 rounded-lg pr-1", active ? "bg-amethyst/[0.12] shadow-[inset_0_0_0_1px_rgb(var(--accent-rgb)/0.25)]" : "hover:bg-foreground/[0.05]")}>
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    disabled={spinning}
                    className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
                    onClick={() => open(wheel)}
                  >
                    <span
                      aria-hidden
                      className="size-4 shrink-0 rounded-full ring-1 ring-white/20"
                      style={{ background: swatch.length ? `conic-gradient(${swatch.map((color, index) => `${color} ${(index / swatch.length) * 100}% ${((index + 1) / swatch.length) * 100}%`).join(", ")})` : "var(--muted)" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{wheel.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {wheel.choices.length} choice{wheel.choices.length === 1 ? "" : "s"}
                        {active && dirty ? " · editing" : ""}
                      </span>
                    </span>
                  </button>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Actions for ${wheel.name}`}
                        className="shrink-0 text-muted-foreground opacity-0 group-hover/wheel:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => setRenaming(wheel)}>
                        <Pencil aria-hidden /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void duplicate(wheel)}>
                        <Copy aria-hidden /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(wheel)}>
                        <Trash2 aria-hidden /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
          {wheels.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Saved wheels appear here, on every device you sign in on.</p> : null}
        </section>

        {/* Editor */}
        <section aria-labelledby={`${nameId}-edit`} className="ui-panel space-y-5 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id={`${nameId}-edit`} className="text-sm font-semibold">
              Edit wheel
            </h2>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" disabled={!dirty || saving || spinning} onClick={discard}>
                <RotateCcw aria-hidden className="size-3.5" />
                Discard
              </Button>
              <Button type="button" size="sm" className="h-8 gap-1.5" disabled={saving || spinning || (Boolean(saved) && !dirty)} onClick={() => void save()} title="Save (Ctrl+S)">
                {saving ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Save aria-hidden className="size-3.5" />}
                {saved ? "Save" : "Save wheel"}
              </Button>
            </div>
          </div>
          <p className="-mt-3 text-[11px] leading-4 text-muted-foreground">
            Edits apply to the wheel right away but are only kept once you save. Discard returns to the saved version.
          </p>

          <fieldset disabled={spinning} className="space-y-5 disabled:opacity-70">
            <div className="space-y-1.5">
              <label htmlFor={nameId} className="text-xs font-medium text-muted-foreground">
                Name
              </label>
              <Input id={nameId} value={draft.name} maxLength={MAX_WHEEL_NAME} placeholder="e.g. Who goes first?" onChange={(event) => update({ name: event.target.value })} />
            </div>

            <ChoiceEditor
              choices={draft.choices}
              colors={colors}
              palette={draft.settings.palette}
              disabled={spinning}
              onChange={(choices) => {
                update({ choices });
                if (removed && choices.some((choice) => choice.id === removed.choice.id)) setRemoved(null);
              }}
            />

            <div className="space-y-2">
              <p id={`${nameId}-palette`} className="text-sm font-semibold">
                Palette
              </p>
              <div role="radiogroup" aria-labelledby={`${nameId}-palette`} className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2">
                {PALETTE_IDS.map((id) => {
                  const active = draft.settings.palette === id;
                  return (
                    <label
                      key={id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        active ? "border-amethyst/60 bg-amethyst/[0.1] text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <input
                        type="radio"
                        name={`${nameId}-palette`}
                        value={id}
                        checked={active}
                        className="sr-only"
                        onChange={() => update({ settings: { ...draft.settings, palette: id } })}
                      />
                      <span aria-hidden className="flex h-3.5 flex-1 overflow-hidden rounded-full ring-1 ring-white/15">
                        {PALETTES[id].colors.map((color) => (
                          <span key={color} className="flex-1" style={{ backgroundColor: color }} />
                        ))}
                      </span>
                      {PALETTES[id].label}
                    </label>
                  );
                })}
              </div>
              {draft.choices.some((choice) => choice.color) ? (
                <p className="text-[11px] text-muted-foreground">Slices with a custom color keep it. Use the choice menu to return them all to the palette.</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <p id={durationName} className="text-sm font-semibold">
                Spin length
              </p>
              <div role="radiogroup" aria-labelledby={durationName} className="ui-segment">
                {(Object.keys(DURATIONS) as DurationId[]).map((id) => (
                  <label
                    key={id}
                    className={cn(
                      "cursor-pointer rounded-[calc(0.7rem*var(--control-round,1))] px-3 py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      draft.settings.duration === id ? "bg-amethyst/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <input
                      type="radio"
                      name={durationName}
                      value={id}
                      checked={draft.settings.duration === id}
                      className="sr-only"
                      onChange={() => update({ settings: { ...draft.settings, duration: id } })}
                    />
                    {DURATIONS[id].label}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">With reduced motion on, the wheel skips the animation and shows the result at once.</p>
            </div>
          </fieldset>
        </section>
      </div>

      <Dialog open={popupOpen && result !== null} onOpenChange={setPopupOpen}>
        {result ? (
          <DialogPortal>
            <DialogOverlay className="spin-winner-overlay bg-black/65 supports-backdrop-filter:backdrop-blur-sm" />
            <div aria-hidden className="spin-confetti pointer-events-none fixed inset-0 z-50 overflow-hidden">
              {CONFETTI.map((piece, i) => (
                <span
                  key={`${result.spin}-${i}`}
                  style={
                    {
                      left: `${piece.left}%`,
                      backgroundColor: i % 3 === 0 ? result.color : colors[i % colors.length],
                      animationDelay: `${piece.delay}ms`,
                      animationDuration: `${piece.duration}ms`,
                      "--drift": `${piece.drift}px`,
                      "--turn": `${piece.turn}deg`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <DialogPrimitive.Content
              key={result.spin}
              className="spin-winner fixed top-1/2 left-1/2 z-50 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-2xl outline-none"
              style={{ "--slice": result.color } as CSSProperties}
            >
              <div className="spin-winner-bar flex items-center justify-between gap-3 px-5 py-3.5">
                <DialogPrimitive.Description className="text-lg font-bold">We have a winner!</DialogPrimitive.Description>
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="ghost" size="icon-sm" className="spin-winner-x" aria-label="Close">
                    <X aria-hidden />
                  </Button>
                </DialogPrimitive.Close>
              </div>
              <DialogPrimitive.Title className="spin-winner-name px-6 py-10 text-center text-4xl font-extrabold tracking-tight break-words sm:py-12 sm:text-6xl">
                {result.label}
              </DialogPrimitive.Title>
              <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3.5">
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="outline">
                    Close
                  </Button>
                </DialogPrimitive.Close>
                {resultStillOnWheel ? (
                  <Button
                    type="button"
                    className="spin-winner-remove gap-1.5"
                    onClick={() => {
                      removeResult();
                      setPopupOpen(false);
                    }}
                  >
                    <X aria-hidden className="size-4" />
                    Remove
                  </Button>
                ) : null}
              </div>
            </DialogPrimitive.Content>
          </DialogPortal>
        ) : null}
      </Dialog>

      <RenameDialog wheel={renaming} onClose={() => setRenaming(null)} onRename={rename} />
      <AlertDialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>The wheel and its choices are removed from your account on every device. This can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                const target = deleting;
                if (!target) return;
                try {
                  await remove(target);
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
            >
              Delete wheel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RenameDialog({ wheel, onClose, onRename }: { wheel: SavedWheel | null; onClose: () => void; onRename: (wheel: SavedWheel, name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  return (
    <Dialog open={wheel !== null} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent
        className="sm:max-w-sm"
        onOpenAutoFocus={() => {
          setName(wheel?.name ?? "");
          setError(null);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!wheel || pending) return;
            const next = name.trim();
            if (!next) {
              setError("Give the wheel a name.");
              return;
            }
            if (next === wheel.name) {
              onClose();
              return;
            }
            setPending(true);
            try {
              await onRename(wheel, next);
              onClose();
            } catch (renameError) {
              setError(errorMessage(renameError));
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename wheel</DialogTitle>
            <DialogDescription>Only the saved name changes; unsaved edits to the wheel stay as they are.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <Input id={inputId} value={name} maxLength={MAX_WHEEL_NAME} aria-invalid={error ? true : undefined} onChange={(event) => setName(event.target.value)} />
            {error ? (
              <p role="alert" className="text-xs text-rose">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="gap-1.5">
              {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
