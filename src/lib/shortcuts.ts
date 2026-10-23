import type { ShortcutAction } from "@/lib/preferences";

export const SHORTCUT_LABELS: Record<ShortcutAction, { title: string; description: string }> = {
  search: { title: "Search", description: "Jump to the search box of the current (or first) collection." },
  newEntry: { title: "New entry", description: "Add an entry to the current (or first) collection." },
  newFile: { title: "New note", description: "Create a note in the open entry's workspace." },
  toggleExplorer: { title: "Show or hide explorer", description: "Open or close the file explorer in an entry." },
};

/** Dispatched on window for actions handled by the open workspace; it calls preventDefault when handled. */
export const WORKSPACE_SHORTCUT_EVENT = "archive:shortcut";
/** Set before navigating to a collection so its search box takes focus once it mounts. */
export const FOCUS_SEARCH_KEY = "archive:focus-search";

const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "AltGraph", "Shift", "CapsLock", "Fn", "OS", "Hyper", "Super"]);
const NAMED_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Backspace", "Delete", "Tab", "Escape", "Home", "End", "PageUp", "PageDown", "Insert",
]);
/** Kept free so editing, navigation and closing dialogs always work. */
const BARE_RESERVED = new Set(["Tab", "Escape", "Enter", "Space", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);
const MOD_RESERVED = new Set(["A", "C", "V", "X", "Z", "Y"]);

export function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

function eventKey(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  // Physical letters and digits, so Alt/Option and keyboard layouts do not change what was pressed.
  const code = /^Key([A-Z])$/.exec(event.code) ?? /^Digit([0-9])$/.exec(event.code);
  if (code) return code[1];
  if (/^F([1-9]|1[0-2])$/.test(event.key) || NAMED_KEYS.has(event.key)) return event.key;
  if (event.key === " ") return "Space";
  if (event.key === "+") return "Plus";
  if ([...event.key].length === 1 && !/\s/.test(event.key)) return event.key.toUpperCase();
  return null;
}

/** The normalized shortcut for a key press, or null for modifier-only presses and unsupported combinations. */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const key = eventKey(event);
  if (!key) return null;
  const mac = isMac();
  // Only one "primary" modifier exists per platform: Cmd on macOS, Ctrl elsewhere.
  if (mac ? event.ctrlKey : event.metaKey) return null;
  const mod = mac ? event.metaKey : event.ctrlKey;
  return [mod && "Mod", event.altKey && "Alt", event.shiftKey && "Shift", key].filter(Boolean).join("+");
}

/** Why a recorded shortcut cannot be used, or null when it is fine. */
export function shortcutProblem(shortcut: string): string | null {
  const parts = shortcut.split("+");
  const key = parts[parts.length - 1];
  const hasMod = parts.includes("Mod");
  const hasAlt = parts.includes("Alt");
  if (!hasMod && !hasAlt && BARE_RESERVED.has(key)) return `${key} on its own is needed for typing and navigation. Add a modifier such as Alt.`;
  if (hasMod && !hasAlt && MOD_RESERVED.has(key) && (parts.length === 2 || key === "Z")) return "That combination is reserved for copy, paste and undo.";
  return null;
}

/** Shortcuts without Ctrl/Cmd or Alt are plain typing inside text fields, so they only work elsewhere. */
export function worksWhileTyping(shortcut: string) {
  return shortcut.includes("Mod+") || shortcut.includes("Alt+");
}

/** Display parts for one shortcut, e.g. ["Ctrl", "Shift", "N"] or ["⌘", "⇧", "N"]. */
export function shortcutParts(shortcut: string, mac = isMac()): string[] {
  if (!shortcut) return [];
  return shortcut.split("+").map((part) => {
    if (part === "Mod") return mac ? "⌘" : "Ctrl";
    if (part === "Alt") return mac ? "⌥" : "Alt";
    if (part === "Shift") return mac ? "⇧" : "Shift";
    if (part === "Plus") return "+";
    if (part === "Space") return "Space";
    if (part.startsWith("Arrow")) return { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" }[part] ?? part;
    return part;
  });
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']") !== null;
}
