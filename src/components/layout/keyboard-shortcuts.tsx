"use client";

import { useEffect, useEffectEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LibraryCategory } from "@/lib/collections";
import { SHORTCUT_ACTIONS, type ShortcutAction } from "@/lib/preferences";
import { FOCUS_SEARCH_KEY, WORKSPACE_ACTIONS, WORKSPACE_SHORTCUT_EVENT, isTypingTarget, shortcutFromEvent, worksWhileTyping } from "@/lib/shortcuts";
import { useSettings } from "./settings-context";

/** Global keyboard shortcuts, as configured in Settings → Shortcuts. */
export function KeyboardShortcuts({ collections }: { collections: LibraryCategory[] }) {
  const { shortcuts } = useSettings();
  const router = useRouter();
  const pathname = usePathname();

  /** The collection being viewed (or the entry's collection), else the first one. */
  function currentCollection() {
    const segment = pathname.split("/")[1] ?? "";
    return collections.find((collection) => collection.id === segment) ?? collections[0];
  }

  function run(action: ShortcutAction) {
    if (WORKSPACE_ACTIONS.includes(action)) {
      const event = new CustomEvent(WORKSPACE_SHORTCUT_EVENT, { detail: action, cancelable: true });
      if (window.dispatchEvent(event)) toast.info("Open an entry to use this shortcut.");
      return;
    }
    if (action === "search") {
      const input = document.getElementById("library-search");
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
        return;
      }
    }
    const collection = currentCollection();
    if (!collection) {
      toast.info("Create a collection first.");
      return;
    }
    if (action === "search") {
      try {
        sessionStorage.setItem(FOCUS_SEARCH_KEY, "1");
      } catch {}
      router.push(`/${collection.id}`);
    } else {
      router.push(`/${collection.id}/new`);
    }
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.repeat) return;
    if (event.target instanceof Element && event.target.closest("[data-shortcut-recorder]")) return;
    // Showcase and the artwork viewer own the keyboard while they are open.
    if (document.querySelector("[data-immersive]")) return;
    const pressed = shortcutFromEvent(event);
    if (!pressed) return;
    const action = SHORTCUT_ACTIONS.find((candidate) => shortcuts[candidate] === pressed);
    if (!action) return;
    if (isTypingTarget(event.target) && !worksWhileTyping(pressed)) return;
    event.preventDefault();
    event.stopPropagation();
    run(action);
  });

  useEffect(() => {
    // Capture, so a chosen shortcut wins over the editor's own key bindings.
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  return null;
}
