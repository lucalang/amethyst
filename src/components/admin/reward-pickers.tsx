"use client";

import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Loader2, UserPlus, X } from "lucide-react";
import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { CatalogSearch } from "@/components/catalog/catalog-search";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { kindLabel, RewardArt, rewardInfo, rewardSummary, type VaultLooks } from "@/components/vault/vault-reveal";
import { achievementDefinition, ACHIEVEMENTS, type AchievementGroup } from "@/lib/achievements";
import { ApiError, apiFetch } from "@/lib/api-client";
import { GAME_SHOPS, SHOP_GAMES, type ShopGame } from "@/lib/game-cosmetics";
import { LIMITS, type AdminAccount, type CatalogAchievement, type CatalogItem } from "@/lib/vault-admin";

const PAGE = 30;

function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: readonly { id: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div role="group" aria-label={label} className="ax-chips">
      {options.map((option) => (
        <button key={option.id} type="button" className="ax-chip" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** What's picked so far, each with its own remove button. */
function SelectedTray({ label, count, onClear, children }: { label: string; count: number; onClear: () => void; children: ReactNode }) {
  return (
    <div className="ax-tray" role="group" aria-label={label}>
      <div className="ax-tray-head">
        <span>
          {label} <span className="ax-chip-count">{count}</span>
        </span>
        {count ? (
          <button type="button" className="ax-link" onClick={onClear}>
            Clear all
          </button>
        ) : null}
      </div>
      {count ? <ul className="ax-tray-list">{children}</ul> : <p className="ax-hint">Nothing selected yet. Pick from the list below.</p>}
    </div>
  );
}

function TrayItem({ name, art, onRemove }: { name: string; art: ReactNode; onRemove: () => void }) {
  return (
    <li className="ax-tray-item">
      <span aria-hidden className="ax-tray-art">
        {art}
      </span>
      <span className="ax-tray-name">{name}</span>
      <button type="button" className="ax-tray-remove" aria-label={`Remove ${name}`} onClick={onRemove}>
        <X aria-hidden className="size-3.5" />
      </button>
    </li>
  );
}

const KINDS = [
  { id: "all", label: "All types" },
  { id: "frame", label: "Frames" },
  { id: "avatar_decoration", label: "Decorations" },
  { id: "badge", label: "Badges" },
  { id: "title", label: "Titles" },
  { id: "game", label: "Game looks" },
] as const;

const SOURCES = [
  { id: "all", label: "Any source" },
  { id: "shop", label: "Shop" },
  { id: "vault", label: "Vault exclusive" },
  { id: "achievement", label: "Achievement reward" },
] as const;

type KindFilter = (typeof KINDS)[number]["id"];
type SourceFilter = (typeof SOURCES)[number]["id"];

/** Every registered cosmetic, including hidden and exclusive ones, with its real preview. */
export function CosmeticPicker({ items, selected, onChange, looks }: { items: CatalogItem[]; selected: string[]; onChange: (ids: string[]) => void; looks: VaultLooks }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [game, setGame] = useState<ShopGame | "all">("all");
  const [onlySelected, setOnlySelected] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const needle = useDeferredValue(query).trim().toLowerCase();

  const entries = useMemo(
    () =>
      items.map((item) => {
        const info = rewardInfo(item.id);
        return { item, info, haystack: `${info.name} ${item.id} ${kindLabel(info)} ${item.category ?? ""}`.toLowerCase() };
      }),
    [items],
  );
  const chosen = new Set(selected);
  const filtered = entries.filter(
    ({ item, haystack }) =>
      (kind === "all" || item.kind === kind) &&
      (source === "all" || item.source === source) &&
      (game === "all" || item.game === game) &&
      (!onlySelected || chosen.has(item.id)) &&
      (!needle || haystack.includes(needle)),
  );
  const full = selected.length >= LIMITS.items;
  const filter = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setLimit(PAGE);
  };

  return (
    <div className="ax-picker">
      <SelectedTray label="Selected cosmetics" count={selected.length} onClear={() => onChange([])}>
        {selected.map((id) => (
          <TrayItem key={id} name={rewardInfo(id).name} art={<RewardArt id={id} size="slot" looks={looks} />} onRemove={() => onChange(selected.filter((entry) => entry !== id))} />
        ))}
      </SelectedTray>
      <div className="ax-picker-tools">
        <CatalogSearch value={query} onChange={filter(setQuery)} label="Search cosmetics" placeholder="Name, type or id" className="ax-search" />
        <Chips label="Type" options={KINDS} value={kind} onChange={filter(setKind)} />
        <div className="ax-picker-row">
          <Chips label="Source" options={SOURCES} value={source} onChange={filter(setSource)} />
          <label className="ax-select">
            <span className="sr-only">Game</span>
            <select value={game} onChange={(event) => filter(setGame)(event.target.value as ShopGame | "all")} className="ax-input">
              <option value="all">Any game</option>
              {SHOP_GAMES.map((id) => (
                <option key={id} value={id}>
                  {GAME_SHOPS[id].title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="ax-chip" aria-pressed={onlySelected} onClick={() => filter(setOnlySelected)(!onlySelected)}>
            Selected <span className="ax-chip-count">{selected.length}</span>
          </button>
        </div>
      </div>
      <p className="ax-hint" aria-live="polite">
        {selected.length} selected · {filtered.length} of {items.length} shown{full ? ` · limit of ${LIMITS.items} reached` : ""}
      </p>
      {filtered.length ? (
        <ul className="ax-grid">
          {filtered.slice(0, limit).map(({ item, info }) => {
            const on = chosen.has(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="ax-item"
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() => onChange(on ? selected.filter((id) => id !== item.id) : [...selected, item.id])}
                >
                  <span className="ax-item-art" aria-hidden>
                    <RewardArt id={item.id} size="card" looks={looks} />
                  </span>
                  <span className="ax-item-name">{info.name}</span>
                  <span className="ax-item-kind">
                    {kindLabel(info)}
                    {item.game && item.game in GAME_SHOPS ? ` · ${GAME_SHOPS[item.game as ShopGame].title}` : ""}
                  </span>
                  <span className="ax-flags">
                    {item.secret ? <span className="ax-flag" data-tone="hidden">Hidden</span> : null}
                    {item.source === "vault" ? <span className="ax-flag">Vault exclusive</span> : null}
                    {item.source === "achievement" ? <span className="ax-flag">Achievement</span> : null}
                    {item.source === "shop" && !item.available ? <span className="ax-flag">Not in shop</span> : null}
                  </span>
                  <span className="ax-item-check" aria-hidden>
                    {on ? <Check className="size-3.5" /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ax-empty">No cosmetics match these filters.</p>
      )}
      {filtered.length > limit ? (
        <button type="button" className="ax-btn ax-more" onClick={() => setLimit(limit + PAGE)}>
          Show more ({filtered.length - limit} left)
        </button>
      ) : null}
    </div>
  );
}

const GROUPS = [
  { id: "all", label: "All" },
  { id: "Arcade", label: "Arcade" },
  { id: "Archive", label: "Archive" },
  { id: "Discovery", label: "Discovery" },
] as const satisfies readonly { id: AchievementGroup | "all"; label: string }[];

/** Registered achievements that exist in the database, with their own once-per-account reward. */
export function AchievementPicker({ catalog, selected, onChange }: { catalog: CatalogAchievement[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<(typeof GROUPS)[number]["id"]>("all");
  const needle = useDeferredValue(query).trim().toLowerCase();
  const known = useMemo(() => new Map(catalog.map((entry) => [entry.id, entry])), [catalog]);
  const chosen = new Set(selected);
  const full = selected.length >= LIMITS.achievements;
  const rows = ACHIEVEMENTS.filter(
    (definition) =>
      known.has(definition.id) &&
      (group === "all" || definition.group === group) &&
      (!needle || `${definition.name} ${definition.description} ${definition.id}`.toLowerCase().includes(needle)),
  );

  return (
    <div className="ax-picker">
      <SelectedTray label="Selected achievements" count={selected.length} onClear={() => onChange([])}>
        {selected.map((id) => {
          const definition = achievementDefinition(id);
          return (
            <TrayItem
              key={id}
              name={definition?.name ?? id}
              art={definition ? <AchievementBadge achievement={definition} earned size={36} /> : null}
              onRemove={() => onChange(selected.filter((entry) => entry !== id))}
            />
          );
        })}
      </SelectedTray>
      <div className="ax-picker-tools">
        <CatalogSearch value={query} onChange={setQuery} label="Search achievements" placeholder="Name or description" className="ax-search" />
        <Chips label="Group" options={GROUPS} value={group} onChange={setGroup} />
      </div>
      <p className="ax-hint" aria-live="polite">
        {selected.length} selected · {rows.length} shown{full ? ` · limit of ${LIMITS.achievements} reached` : ""}
      </p>
      {rows.length ? (
        <ul className="ax-list">
          {rows.map((definition) => {
            const entry = known.get(definition.id)!;
            const on = chosen.has(definition.id);
            const own = rewardSummary(entry.coins, entry.items);
            return (
              <li key={definition.id}>
                <button
                  type="button"
                  className="ax-ach"
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() => onChange(on ? selected.filter((id) => id !== definition.id) : [...selected, definition.id])}
                >
                  <AchievementBadge achievement={definition} earned size={44} />
                  <span className="min-w-0">
                    <span className="ax-item-name">
                      {definition.name}
                      {entry.hidden ? (
                        <span className="ax-flag" data-tone="hidden">
                          Hidden
                        </span>
                      ) : null}
                    </span>
                    <span className="ax-item-kind">{definition.description}</span>
                    <span className="ax-ach-reward">Its own reward: {own || "none"}</span>
                  </span>
                  <span className="ax-item-check" aria-hidden>
                    {on ? <Check className="size-3.5" /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ax-empty">No achievements match.</p>
      )}
    </div>
  );
}

export const accountLabel = (account: AdminAccount | undefined) => account?.name || account?.email || "Unknown account";

/** Admin-only account search; codes store account ids, never the typed email. */
export function AccountPicker({
  selected,
  accounts,
  onChange,
}: {
  selected: string[];
  accounts: Record<string, AdminAccount>;
  onChange: (ids: string[], found?: AdminAccount) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; accounts: AdminAccount[]; error: string | null } | null>(null);
  const term = query.trim();
  const active = term.length >= 2;
  const loading = active && result?.query !== term;
  const chosen = new Set(selected);

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const data = await apiFetch<{ accounts: AdminAccount[] }>(`/api/admin/vault/accounts?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        setResult({ query: term, accounts: data.accounts, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        setResult({ query: term, accounts: [], error: error instanceof ApiError ? error.message : "Search failed. Try again." });
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [term]);

  const found = active && result?.query === term ? result : null;

  return (
    <div className="ax-picker">
      <CatalogSearch value={query} onChange={setQuery} label="Find accounts" placeholder="Name or email (at least 2 characters)" className="ax-search" />
      <div aria-live="polite" className="ax-results">
        {loading ? (
          <p className="ax-hint">
            <Loader2 aria-hidden className="inline size-3.5 animate-spin motion-reduce:animate-none" /> Searching…
          </p>
        ) : found?.error ? (
          <p className="ax-error">{found.error}</p>
        ) : found && !found.accounts.length ? (
          <p className="ax-hint">No accounts match “{term}”.</p>
        ) : found ? (
          <ul className="ax-accounts">
            {found.accounts.map((account) => (
              <li key={account.id}>
                <ProfileAvatar name={account.name} src={account.avatarUrl} decoration={null} className="size-7" />
                <span className="min-w-0 flex-1">
                  <span className="ax-account-name">{accountLabel(account)}</span>
                  {account.email ? <span className="ax-muted block truncate text-xs">{account.email}</span> : null}
                </span>
                <button
                  type="button"
                  className="ax-btn"
                  data-size="sm"
                  disabled={chosen.has(account.id) || selected.length >= LIMITS.allowlist}
                  onClick={() => onChange([...selected, account.id], account)}
                >
                  {chosen.has(account.id) ? <Check aria-hidden className="size-3.5" /> : <UserPlus aria-hidden className="size-3.5" />}
                  {chosen.has(account.id) ? "Added" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <h4 className="ax-label">
        Allowed accounts <span className="ax-muted">· {selected.length}</span>
      </h4>
      {selected.length ? (
        <ul className="ax-accounts" data-variant="chosen">
          {selected.map((id) => {
            const account = accounts[id];
            return (
              <li key={id}>
                <ProfileAvatar name={account?.name} src={account?.avatarUrl} decoration={null} className="size-7" />
                <span className="min-w-0 flex-1">
                  <span className="ax-account-name">{accountLabel(account)}</span>
                  {account?.email ? <span className="ax-muted block truncate text-xs">{account.email}</span> : null}
                </span>
                <button type="button" className="ax-icon-btn" aria-label={`Remove ${accountLabel(account)}`} onClick={() => onChange(selected.filter((entry) => entry !== id))}>
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ax-hint">Nobody yet. Search above and add the accounts that may redeem this code.</p>
      )}
    </div>
  );
}
