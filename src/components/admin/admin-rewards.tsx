"use client";

import { useDeferredValue, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { kindLabel, RewardArt, rewardInfo, rewardSummary, type VaultLooks } from "@/components/vault/vault-reveal";
import { achievementDefinition, type AchievementGroup } from "@/lib/achievements";
import { GAME_SHOPS, SHOP_GAMES } from "@/lib/game-cosmetics";
import { DAILY_EARNING_LIMIT, LIMITS, type CatalogAchievement, type CatalogItem, type CodeConfig } from "@/lib/vault-admin";
import type { TokenShape, TokenSpec } from "./admin-scene";
import { useStage } from "./admin-stage";
import { number, plural, wholeNumber } from "./admin-ui";

export type Rewards = Pick<CodeConfig, "coins" | "items" | "achievements">;
export type RewardContext = { catalog: { items: CatalogItem[]; achievements: CatalogAchievement[] }; looks: VaultLooks };
type EditorProps = { value: Rewards; onChange: (patch: Partial<Rewards>) => void; context: RewardContext; idPrefix: string };
type RewardToken = { key: string; shape: TokenShape; label: string; face: ReactNode | null; remove: Partial<Rewards> | ((value: Rewards) => Partial<Rewards>) };

/**
 * Reward kinds a code can grant. Each kind brings its label, editor, summary and the 3D token it becomes in the Forge.
 * A new kind is one more entry here (plus its column in the code config).
 */
export type RewardKind = {
  id: string;
  label: string;
  count: (value: Rewards) => number;
  tokens: (value: Rewards, context: RewardContext) => RewardToken[];
  Editor: ComponentType<EditorProps>;
};

export const REWARD_KINDS: RewardKind[] = [
  {
    id: "coins",
    label: "Coins",
    count: (value) => (value.coins > 0 ? 1 : 0),
    tokens: (value) => (value.coins > 0 ? [{ key: "coins", shape: "coins", label: plural(value.coins, "coin"), face: null, remove: { coins: 0 } }] : []),
    Editor: CoinEditor,
  },
  {
    id: "cosmetics",
    label: "Cosmetics",
    count: (value) => value.items.length,
    tokens: (value, context) =>
      value.items.map((id) => ({
        key: `item:${id}`,
        shape: "card",
        label: rewardInfo(id).name,
        face: <RewardArt id={id} size="card" looks={context.looks} />,
        remove: (current: Rewards) => ({ items: current.items.filter((item) => item !== id) }),
      })),
    Editor: CosmeticPicker,
  },
  {
    id: "achievements",
    label: "Achievements",
    count: (value) => value.achievements.length,
    tokens: (value) =>
      value.achievements.map((id) => {
        const definition = achievementDefinition(id);
        return {
          key: `achievement:${id}`,
          shape: "medallion",
          label: definition?.name ?? id,
          face: definition ? <AchievementBadge achievement={definition} earned size={72} /> : null,
          remove: (current: Rewards) => ({ achievements: current.achievements.filter((item) => item !== id) }),
        };
      }),
    Editor: AchievementPicker,
  },
];

export const hasRewards = (value: Rewards) => REWARD_KINDS.some((kind) => kind.count(value) > 0);

/** "500 coins · Vault sigil · Achievement: Night owl" */
export function describeRewards(value: Rewards) {
  const achievements = value.achievements.map((id) => `Achievement: ${achievementDefinition(id)?.name ?? id}`);
  return [rewardSummary(value.coins, value.items), ...achievements].filter(Boolean).join(" · ") || "No rewards";
}

/** The rewards editor: kind tabs with counts, the chosen rewards as removable chips, then the kind's picker. */
export function RewardsEditor({ value, onChange, context, error, idPrefix }: EditorProps & { error?: string | null }) {
  const [active, setActive] = useState(REWARD_KINDS[0].id);
  const kind = REWARD_KINDS.find((item) => item.id === active) ?? REWARD_KINDS[0];
  const chosen = REWARD_KINDS.flatMap((item) => item.tokens(value, context));
  return (
    <div className="cs-rewards">
      <div role="tablist" aria-label="Reward kinds" className="cs-tabs">
        {REWARD_KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={item.id === kind.id}
            aria-controls={`${idPrefix}-panel`}
            className="cs-tab"
            onClick={() => setActive(item.id)}
          >
            {item.label}
            <span className="cs-tab-count">{item.count(value) || ""}</span>
          </button>
        ))}
      </div>
      {chosen.length ? (
        <ul className="cs-chosen" aria-label="Chosen rewards">
          {chosen.map((token) => (
            <li key={token.key}>
              <button
                type="button"
                className="cs-chip cs-chip-remove"
                onClick={() => onChange(typeof token.remove === "function" ? token.remove(value) : token.remove)}
                aria-label={`Remove ${token.label}`}
              >
                {token.label}
                <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cs-hint">Nothing chosen yet. Pick coins, cosmetics or achievements; each becomes a token in the core.</p>
      )}
      {error ? (
        <p className="cs-error" role="alert">
          {error}
        </p>
      ) : null}
      <div role="tabpanel" id={`${idPrefix}-panel`} aria-labelledby={`${idPrefix}-tab-${kind.id}`} className="cs-tabpanel">
        <kind.Editor value={value} onChange={onChange} context={context} idPrefix={idPrefix} />
      </div>
    </div>
  );
}

const QUICK_COINS = [50, 100, 250, 500, 1000, 5000];

function CoinEditor({ value, onChange, idPrefix }: EditorProps) {
  const id = `${idPrefix}-coins`;
  return (
    <div className="cs-field">
      <label htmlFor={id} className="cs-label">
        Coins per redemption
      </label>
      <div className="cs-row">
        <input
          id={id}
          className="cs-input cs-input-number"
          inputMode="numeric"
          autoComplete="off"
          value={value.coins ? String(value.coins) : ""}
          placeholder="0"
          onChange={(event) => onChange({ coins: Math.min(LIMITS.coins, wholeNumber(event.target.value) ?? 0) })}
          aria-describedby={`${id}-hint`}
        />
        <div className="cs-quick" aria-label="Quick amounts" role="group">
          {QUICK_COINS.map((amount) => (
            <button key={amount} type="button" className="cs-chip" aria-pressed={value.coins === amount} onClick={() => onChange({ coins: amount })}>
              {number(amount)}
            </button>
          ))}
        </div>
      </div>
      <p id={`${id}-hint`} className="cs-hint">
        Up to {number(LIMITS.coins)}. Code coins are recorded as their own kind and don’t count toward the daily earning limit of {DAILY_EARNING_LIMIT}.
      </p>
    </div>
  );
}

const KINDS: [CatalogItem["kind"] | "all", string][] = [
  ["all", "All"],
  ["frame", "Frames"],
  ["avatar_decoration", "Avatar decorations"],
  ["badge", "Badges"],
  ["title", "Titles"],
  ["game", "Game looks"],
];
const SOURCES: [CatalogItem["source"] | "all", string][] = [
  ["all", "Any source"],
  ["shop", "Shop"],
  ["vault", "Vault"],
  ["achievement", "Achievement"],
];
const PAGE = 30;

function CosmeticPicker({ value, onChange, context, idPrefix }: EditorProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("all");
  const [source, setSource] = useState<(typeof SOURCES)[number][0]>("all");
  const [game, setGame] = useState("all");
  const [onlySelected, setOnlySelected] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const deferred = useDeferredValue(query);
  const entries = useMemo(
    () =>
      context.catalog.items.map((item) => {
        const info = rewardInfo(item.id);
        return { item, info, haystack: `${info.name} ${item.id} ${kindLabel(info)} ${item.category ?? ""}`.toLowerCase() };
      }),
    [context.catalog.items],
  );
  const selected = new Set(value.items);
  const terms = deferred.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = entries.filter(
    ({ item, haystack }) =>
      (kind === "all" || item.kind === kind) &&
      (source === "all" || item.source === source) &&
      (game === "all" || item.game === game) &&
      (!onlySelected || selected.has(item.id)) &&
      terms.every((term) => haystack.includes(term)),
  );
  const full = value.items.length >= LIMITS.items;
  const filter = (apply: () => void) => {
    apply();
    setLimit(PAGE);
  };
  const toggle = (id: string) =>
    onChange({ items: selected.has(id) ? value.items.filter((item) => item !== id) : full ? value.items : [...value.items, id] });

  return (
    <div className="cs-picker">
      <div className="cs-picker-filters">
        <label className="sr-only" htmlFor={`${idPrefix}-cosmetic-search`}>
          Search cosmetics
        </label>
        <input
          id={`${idPrefix}-cosmetic-search`}
          type="search"
          className="cs-input"
          placeholder="Search cosmetics, including secret ones"
          value={query}
          onChange={(event) => filter(() => setQuery(event.target.value))}
        />
        <div className="cs-chips" role="group" aria-label="Kind">
          {KINDS.map(([id, label]) => (
            <button key={id} type="button" className="cs-chip" aria-pressed={kind === id} onClick={() => filter(() => setKind(id))}>
              {label}
            </button>
          ))}
        </div>
        <div className="cs-row">
          <label className="sr-only" htmlFor={`${idPrefix}-cosmetic-source`}>
            Source
          </label>
          <select id={`${idPrefix}-cosmetic-source`} className="cs-input cs-select" value={source} onChange={(event) => filter(() => setSource(event.target.value as typeof source))}>
            {SOURCES.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          {kind === "game" || kind === "all" ? (
            <>
              <label className="sr-only" htmlFor={`${idPrefix}-cosmetic-game`}>
                Game
              </label>
              <select id={`${idPrefix}-cosmetic-game`} className="cs-input cs-select" value={game} onChange={(event) => filter(() => setGame(event.target.value))}>
                <option value="all">Any game</option>
                {SHOP_GAMES.map((id) => (
                  <option key={id} value={id}>
                    {GAME_SHOPS[id].title}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <button type="button" className="cs-chip" aria-pressed={onlySelected} onClick={() => filter(() => setOnlySelected(!onlySelected))}>
            Only selected ({value.items.length})
          </button>
        </div>
      </div>
      <p className="cs-hint" aria-live="polite">
        {plural(matches.length, "cosmetic")}
        {full ? ` · The limit of ${LIMITS.items} is reached.` : ""}
      </p>
      <ul className="cs-options">
        {matches.slice(0, limit).map(({ item, info }) => {
          const on = selected.has(item.id);
          return (
            <li key={item.id}>
              <button type="button" className="cs-option" data-card aria-pressed={on} disabled={!on && full} onClick={() => toggle(item.id)}>
                <span className="cs-option-art" aria-hidden>
                  <RewardArt id={item.id} size="slot" looks={context.looks} />
                </span>
                <span className="cs-option-text">
                  <span className="cs-option-name">{info.name}</span>
                  <span className="cs-option-meta">
                    {kindLabel(info)}
                    {item.source === "shop" && item.price ? ` · ${number(item.price)} coins in the shop` : ""}
                  </span>
                  <span className="cs-flags">
                    {item.secret ? <span className="cs-flag">Hidden</span> : null}
                    {item.source === "vault" ? <span className="cs-flag">Vault exclusive</span> : null}
                    {item.source === "achievement" ? <span className="cs-flag">Achievement</span> : null}
                    {item.source === "shop" && !item.available ? <span className="cs-flag">Not in shop</span> : null}
                  </span>
                </span>
                <span className="cs-option-check" aria-hidden>
                  {on ? "✓" : "+"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {matches.length > limit ? (
        <button type="button" className="cs-button" onClick={() => setLimit(limit + PAGE)}>
          Show more ({number(matches.length - limit)} left)
        </button>
      ) : null}
    </div>
  );
}

const GROUPS: (AchievementGroup | "all")[] = ["all", "Arcade", "Archive", "Discovery"];

function AchievementPicker({ value, onChange, context, idPrefix }: EditorProps) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("all");
  const deferred = useDeferredValue(query);
  const entries = useMemo(
    () =>
      context.catalog.achievements.flatMap((row) => {
        const definition = achievementDefinition(row.id);
        return definition ? [{ row, definition, haystack: `${definition.name} ${definition.description} ${row.id}`.toLowerCase() }] : [];
      }),
    [context.catalog.achievements],
  );
  const selected = new Set(value.achievements);
  const terms = deferred.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = entries.filter(({ definition, haystack }) => (group === "all" || definition.group === group) && terms.every((term) => haystack.includes(term)));
  const full = value.achievements.length >= LIMITS.achievements;
  const toggle = (id: string) =>
    onChange({
      achievements: selected.has(id) ? value.achievements.filter((item) => item !== id) : full ? value.achievements : [...value.achievements, id],
    });

  return (
    <div className="cs-picker">
      <div className="cs-picker-filters">
        <label className="sr-only" htmlFor={`${idPrefix}-achievement-search`}>
          Search achievements
        </label>
        <input
          id={`${idPrefix}-achievement-search`}
          type="search"
          className="cs-input"
          placeholder="Search achievements"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="cs-chips" role="group" aria-label="Group">
          {GROUPS.map((id) => (
            <button key={id} type="button" className="cs-chip" aria-pressed={group === id} onClick={() => setGroup(id)}>
              {id === "all" ? "All" : id}
            </button>
          ))}
        </div>
      </div>
      <p className="cs-hint">Unlocking grants the achievement’s own reward too. Accounts that already have it get nothing extra from it.</p>
      <ul className="cs-options">
        {matches.map(({ row, definition }) => {
          const on = selected.has(row.id);
          const own = rewardSummary(row.coins, row.items);
          return (
            <li key={row.id}>
              <button type="button" className="cs-option" data-card aria-pressed={on} disabled={!on && full} onClick={() => toggle(row.id)}>
                <span className="cs-option-art" aria-hidden>
                  <AchievementBadge achievement={definition} earned={on} size={40} />
                </span>
                <span className="cs-option-text">
                  <span className="cs-option-name">{definition.name}</span>
                  <span className="cs-option-meta">{definition.description}</span>
                  <span className="cs-flags">
                    {row.hidden ? <span className="cs-flag">Hidden</span> : null}
                    {own ? <span className="cs-flag cs-flag-plain">Its own reward: {own}</span> : null}
                  </span>
                </span>
                <span className="cs-option-check" aria-hidden>
                  {on ? "✓" : "+"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* 3D tokens: each reward becomes a token flying into the core; faces are real DOM (the art), owned here. */

const MAX_TOKENS = 12;
const holders = new Map<string, HTMLElement>();
function holderFor(key: string) {
  let holder = holders.get(key);
  if (!holder) {
    holder = document.createElement("div");
    holder.className = "cs-token-holder";
    holders.set(key, holder);
  }
  return holder;
}

/** Hands the rewards to the scene as tokens (nothing in 2D). `hidden` sends them all away (after publishing). */
export function RewardTokens({ value, context, hidden }: { value: Rewards; context: RewardContext; hidden: boolean }) {
  const { engine } = useStage();
  const list = useMemo(() => (engine && !hidden ? REWARD_KINDS.flatMap((kind) => kind.tokens(value, context)).slice(0, MAX_TOKENS) : []), [engine, hidden, value, context]);
  const specs = useMemo<TokenSpec[]>(() => list.map((token) => ({ key: token.key, shape: token.shape, face: token.face ? holderFor(token.key) : null })), [list]);
  useEffect(() => {
    engine?.setTokens(specs);
  }, [engine, specs]);
  return list.map((token) =>
    token.face
      ? createPortal(
          <div className={`cs-token-face cs-token-${token.shape}`} aria-hidden>
            {token.face}
          </div>,
          holderFor(token.key),
          token.key,
        )
      : null,
  );
}
