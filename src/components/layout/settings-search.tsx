"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SETTINGS_SEARCH_ITEMS, searchSettings, type SettingsArea, type SettingsSearchItem } from "@/lib/settings-search";
import { cn } from "@/lib/utils";

function revealSetting(href: string) {
  const item = SETTINGS_SEARCH_ITEMS.find((entry) => entry.href === href);
  if (!item) return () => {};
  const targetId = item.target;
  let highlighted: HTMLElement | null = null;
  let addedTabIndex = false;
  let highlightTimer: ReturnType<typeof setTimeout>;
  const clearHighlight = () => {
    highlighted?.removeAttribute("data-setting-match");
    if (addedTabIndex) highlighted?.removeAttribute("tabindex");
  };
  const observer = new MutationObserver(reveal);
  function reveal() {
    const target = document.getElementById(targetId);
    if (!target) return;
    observer.disconnect();
    highlighted = target;
    target.setAttribute("data-setting-match", "");
    addedTabIndex = !target.hasAttribute("tabindex") && !target.matches("input, button, select, textarea, a[href]");
    if (addedTabIndex) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "center", behavior: "instant" });
    highlightTimer = setTimeout(clearHighlight, 2400);
  }
  observer.observe(document.body, { childList: true, subtree: true });
  reveal();
  const observerTimer = setTimeout(() => observer.disconnect(), 5000);
  return () => {
    observer.disconnect();
    clearTimeout(observerTimer);
    clearTimeout(highlightTimer);
    clearHighlight();
  };
}

export function SettingsSearch({ area }: { area: SettingsArea }) {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cleanupHighlight = useRef<() => void>(() => {});
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = searchSettings(query);
  const expanded = open && query.trim().length > 0;

  useEffect(() => {
    const reveal = () => {
      cleanupHighlight.current();
      cleanupHighlight.current = revealSetting(`${pathname}${window.location.hash}`);
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => {
      window.removeEventListener("hashchange", reveal);
      cleanupHighlight.current();
    };
  }, [pathname]);

  useEffect(() => {
    if (expanded) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, expanded, listId]);

  function select(item: SettingsSearchItem) {
    setOpen(false);
    router.push(item.href, { scroll: false });
    if (item.href.split("#")[0] === pathname) {
      cleanupHighlight.current();
      cleanupHighlight.current = revealSetting(item.href);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      setOpen(false);
      event.preventDefault();
      event.stopPropagation();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (results.length) setActive((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    } else if (event.key === "Enter" && expanded && results[active]) {
      event.preventDefault();
      select(results[active]);
    }
  }

  return (
    <div className="relative z-30 mb-6 flex min-w-0 flex-wrap items-center justify-between gap-3">
      <nav aria-label="Account preferences" className="flex shrink-0 gap-1">
        {(["Settings", "Customization"] as const).map((destination) => (
          <Link
            key={destination}
            href={destination === "Settings" ? "/settings" : "/customization"}
            aria-current={area === destination ? "true" : undefined}
            className={cn("rounded-md px-3 py-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", area === destination ? "bg-amethyst/10 text-amethyst" : "text-muted-foreground")}
          >
            {destination}
          </Link>
        ))}
      </nav>
      <div
        className="relative w-full min-w-0 sm:max-w-sm"
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      >
        <Search aria-hidden className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          role="combobox"
          aria-label="Search Settings and Customization"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && results[active] ? `${listId}-${active}` : undefined}
          placeholder="Search Settings & Customization"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-10 pr-10 pl-9 text-sm"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            title="Clear search"
            className="absolute top-1 right-1 grid size-8 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => { setQuery(""); setActive(0); setOpen(false); inputRef.current?.focus(); }}
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
        <div className="sr-only" role="status" aria-live="polite">
          {expanded ? `${results.length} ${results.length === 1 ? "result" : "results"}` : ""}
        </div>
        <div hidden={!expanded} className="absolute top-full right-0 left-0 mt-2 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl">
          <ul id={listId} role="listbox" aria-label="Matching settings" className="max-h-[min(24rem,50dvh)] overflow-y-auto p-1">
            {results.map((item, index) => (
              <li
                key={`${item.href}-${item.label}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={active === index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => select(item)}
                className={cn("cursor-pointer rounded px-3 py-2 text-sm break-words", active === index && "bg-amethyst/10 text-amethyst")}
              >
                <span className="block font-medium">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.area} / {item.section}</span>
              </li>
            ))}
          </ul>
          {!results.length ? <p className="px-4 py-5 text-sm text-muted-foreground">No matching settings.</p> : null}
        </div>
      </div>
    </div>
  );
}