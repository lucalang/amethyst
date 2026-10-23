"use client";

import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_SETTINGS, SHORTCUT_ACTIONS, SHORTCUT_PATTERN, type ShortcutAction, type Settings } from "@/lib/preferences";
import { SHORTCUT_LABELS, isMac, shortcutFromEvent, shortcutParts, shortcutProblem, worksWhileTyping } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { ChangedBadge, ResetIconButton } from "./reset-button";
import { useSetting } from "./setting-controls";

const noop = () => () => {};

function Keys({ shortcut, mac }: { shortcut: string; mac: boolean }) {
  if (!shortcut) return <span className="text-sm text-muted-foreground">Not set</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shortcutParts(shortcut, mac).map((part, index) => (
        <kbd key={index} className="min-w-6 rounded-md border border-white/15 border-b-white/25 bg-white/[0.06] px-1.5 py-0.5 text-center font-sans text-xs font-medium text-foreground">
          {part}
        </kbd>
      ))}
    </span>
  );
}

/** Rebind the app-wide keyboard shortcuts. */
export function ShortcutSettings({ value }: { value: Settings["shortcuts"] }) {
  const [shortcuts, setShortcuts] = useSetting("shortcuts", value);
  const mac = useSyncExternalStore(noop, isMac, () => false);
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [problem, setProblem] = useState<{ action: ShortcutAction; message: string } | null>(null);
  const isDefault = SHORTCUT_ACTIONS.every((action) => shortcuts[action] === DEFAULT_SETTINGS.shortcuts[action]);

  function assign(action: ShortcutAction, shortcut: string) {
    setProblem(null);
    setRecording(null);
    if (shortcuts[action] !== shortcut) setShortcuts({ ...shortcuts, [action]: shortcut });
  }

  function resetOne(action: ShortcutAction) {
    const fallback = DEFAULT_SETTINGS.shortcuts[action];
    const takenBy = fallback ? SHORTCUT_ACTIONS.find((other) => other !== action && shortcuts[other] === fallback) : undefined;
    if (takenBy) {
      setRecording(null);
      setProblem({ action, message: `The default is used by “${SHORTCUT_LABELS[takenBy].title}”. Change that one first.` });
    } else assign(action, fallback);
  }

  function record(action: ShortcutAction, event: KeyboardEvent) {
    if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      setRecording(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      setRecording(null);
      setProblem(null);
      return;
    }
    const shortcut = shortcutFromEvent(event.nativeEvent);
    if (!shortcut) return;
    const reason = !SHORTCUT_PATTERN.test(shortcut) ? "That key can’t be used for a shortcut." : shortcutProblem(shortcut);
    const takenBy = SHORTCUT_ACTIONS.find((other) => other !== action && shortcuts[other] === shortcut);
    if (reason) setProblem({ action, message: reason });
    else if (takenBy) setProblem({ action, message: `Already used by “${SHORTCUT_LABELS[takenBy].title}”. Change that one first.` });
    else assign(action, shortcut);
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.015]">
        {SHORTCUT_ACTIONS.map((action) => {
          const shortcut = shortcuts[action];
          const active = recording === action;
          const error = problem?.action === action ? problem.message : null;
          const changed = shortcut !== DEFAULT_SETTINGS.shortcuts[action];
          return (
            <li key={action} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-medium">{SHORTCUT_LABELS[action].title}</p>
                  {changed ? (
                    <span className="inline-flex items-center gap-1">
                      <ChangedBadge />
                      <ResetIconButton
                        label={`the ${SHORTCUT_LABELS[action].title} shortcut`}
                        defaultLabel={shortcutParts(DEFAULT_SETTINGS.shortcuts[action], mac).join(mac ? "" : "+") || "not set"}
                        onReset={() => resetOne(action)}
                      />
                    </span>
                  ) : null}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{SHORTCUT_LABELS[action].description}</p>
                {error ? (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {error}
                  </p>
                ) : shortcut && !worksWhileTyping(shortcut) ? (
                  <p className="mt-1 text-xs text-muted-foreground/70">Doesn’t work while typing in a text field. Add Alt or {mac ? "⌘" : "Ctrl"} to change that.</p>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-shortcut-recorder
                  aria-label={active ? `Recording shortcut for ${SHORTCUT_LABELS[action].title}. Press keys, or Escape to cancel.` : `Change shortcut for ${SHORTCUT_LABELS[action].title}`}
                  onClick={() => {
                    setProblem(null);
                    setRecording(active ? null : action);
                  }}
                  onKeyDown={active ? (event) => record(action, event) : undefined}
                  onBlur={() => active && setRecording(null)}
                  className={cn(
                    "flex min-h-9 min-w-36 items-center justify-center rounded-md border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "animate-pulse border-amethyst bg-amethyst/10 text-amethyst" : "border-white/[0.1] bg-black/30 hover:border-amethyst/40",
                  )}
                >
                  {active ? "Press keys…" : <Keys shortcut={shortcut} mac={mac} />}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove shortcut for ${SHORTCUT_LABELS[action].title}`}
                  title="Remove"
                  disabled={!shortcut}
                  onClick={() => assign(action, "")}
                >
                  <X aria-hidden />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Click a shortcut, then press the new key combination.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isDefault}
          onClick={() => {
            setProblem(null);
            setShortcuts({ ...DEFAULT_SETTINGS.shortcuts });
          }}
        >
          <RotateCcw aria-hidden /> Reset all shortcuts
        </Button>
      </div>
    </div>
  );
}
