"use client";

import { useEffect, useRef, useState } from "react";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { apiFetch } from "@/lib/api-client";
import { CODE_RULES, compactCode, normalizePhrase } from "@/lib/code-format";
import { LIMITS, maxPayout, needsRepeatConfirmation, type AdminAccount, type AdminCodeDetail, type CodeConfig, type CodeUpdate, draftConfigSchema } from "@/lib/vault-admin";
import { hasRewards } from "./admin-rewards";
import { describedBy, Field, fromLocalInput, number, plural, toLocalInput, wholeNumber } from "./admin-ui";

export type ConfigErrors = Partial<Record<"rewards" | "label" | "code" | "allowlist" | "startsAt" | "expiresAt" | "maxRedemptions" | "perAccountLimit" | "confirm", string>>;

export const PHRASE_ERROR = `${CODE_RULES} For example: OPEN THE VAULT.`;
export const CUSTOM_ERROR = `${CODE_RULES} Dashes and dots are allowed between them.`;

/** Checks a configuration the way the server will, with messages that say what to do. */
export function validateConfig(
  config: CodeConfig,
  { now, code, confirmRepeat, original }: { now: number; code?: string; confirmRepeat: boolean; original?: CodeConfig },
): ConfigErrors {
  const errors: ConfigErrors = {};
  if (!hasRewards(config)) errors.rewards = "Choose at least one kind of reward.";
  if (!config.label.trim()) errors.label = "Give the code a label so you can find it later.";
  if (code !== undefined) {
    if (config.codeMode === "phrase" && !normalizePhrase(code)) errors.code = PHRASE_ERROR;
    if (config.codeMode === "custom" && !compactCode(code)) errors.code = CUSTOM_ERROR;
  }
  if (config.audience === "allowlist" && !config.allowlist.length) errors.allowlist = "Add at least one account, or let everyone redeem it.";
  const expires = config.expiresAt ? Date.parse(config.expiresAt) : null;
  if (expires !== null && expires <= now && config.expiresAt !== original?.expiresAt) errors.expiresAt = "The expiry has to be in the future.";
  else if (expires !== null && config.startsAt && expires <= Date.parse(config.startsAt)) errors.expiresAt = "The expiry has to be after the start.";
  if (config.maxRedemptions !== null && (config.maxRedemptions < 1 || config.maxRedemptions > LIMITS.maxRedemptions))
    errors.maxRedemptions = `Enter a number from 1 to ${number(LIMITS.maxRedemptions)}, or leave it empty for no limit.`;
  if (config.perAccountLimit < 1 || config.perAccountLimit > LIMITS.perAccount) errors.perAccountLimit = `Enter a number from 1 to ${LIMITS.perAccount}.`;
  if (needsRepeatConfirmation(config) && !confirmRepeat && raisesPayout(config, original)) errors.confirm = "Confirm the repeatable coin payout before publishing.";
  return errors;
}

/** Like the server: an edit needs the repeat confirmation only when it raises the coins or the per-account limit. */
export const raisesPayout = (config: CodeConfig, original?: CodeConfig) =>
  !original || config.coins > original.coins || config.perAccountLimit > original.perAccountLimit;

/** The parts of a configuration a draft can keep (incomplete or invalid values are left out). */
export function draftable(config: CodeConfig) {
  const shape = draftConfigSchema.shape;
  return Object.fromEntries(
    Object.entries(config).filter(([key, value]) => key in shape && shape[key as keyof typeof shape].safeParse(value).success),
  ) as Partial<CodeConfig>;
}

/** What gets saved: the allowlist only matters for "only listed accounts". */
export const effectiveConfig = (config: CodeConfig): CodeConfig => ({ ...config, allowlist: config.audience === "allowlist" ? config.allowlist : [] });

/** A published code's settings as an editable configuration. */
export const configOf = (code: AdminCodeDetail): CodeConfig => ({
  label: code.label,
  coins: code.coins,
  items: code.items,
  achievements: code.achievements,
  audience: code.audience,
  allowlist: code.allowlist.map((account) => account.id),
  startsAt: code.startsAt,
  expiresAt: code.expiresAt,
  maxRedemptions: code.maxRedemptions,
  perAccountLimit: code.perAccountLimit,
  codeMode: code.format === "phrase" ? "phrase" : "random",
});

/** A clone keeps everything except past dates; the code text is never copied. */
export function cloneConfig(code: AdminCodeDetail, now: number): CodeConfig {
  const future = (iso: string | null) => (iso && Date.parse(iso) > now ? iso : null);
  return { ...configOf(code), label: `${code.label} (copy)`.slice(0, LIMITS.label), startsAt: future(code.startsAt), expiresAt: future(code.expiresAt) };
}

/** An edit as the update API takes it (the code text and its type never change). */
export function updateOf(config: CodeConfig): CodeUpdate {
  const { label, coins, items, achievements, audience, allowlist, startsAt, expiresAt, maxRedemptions, perAccountLimit } = effectiveConfig(config);
  return { label: label.trim(), coins, items, achievements, audience, allowlist, startsAt, expiresAt, maxRedemptions, perAccountLimit };
}

const DAY = 86_400_000;
const EXPIRY_PRESETS = [
  { label: "1 day", ms: DAY },
  { label: "3 days", ms: 3 * DAY },
  { label: "1 week", ms: 7 * DAY },
  { label: "2 weeks", ms: 14 * DAY },
  { label: "30 days", ms: 30 * DAY },
];

const CODE_MODES: { id: CodeConfig["codeMode"]; label: string }[] = [
  { id: "phrase", label: "Phrase" },
  { id: "random", label: "Random" },
  { id: "custom", label: "Custom text" },
];

/** Expiry presets count from the start time, or from now once the code is live. */
function presetExpiry(startsAt: string | null, ms: number) {
  return new Date(Math.max(Date.now(), startsAt ? Date.parse(startsAt) : 0) + ms).toISOString();
}

/** Label, code type (Forge only), audience, schedule and limits. */
export function RulesFields({
  idPrefix,
  config,
  onChange,
  errors,
  code,
  onCode,
  accounts = [],
}: {
  idPrefix: string;
  config: CodeConfig;
  onChange: (patch: Partial<CodeConfig>) => void;
  errors: ConfigErrors;
  /** The code text (phrase or custom); undefined when editing a published code. */
  code?: string;
  onCode?: (code: string) => void;
  accounts?: AdminAccount[];
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const phrase = code !== undefined && config.codeMode === "phrase" ? normalizePhrase(code) : null;
  return (
    <div className="cs-rules">
      <Field id={id("label")} label="Admin label (never shown to players)" error={errors.label}>
        <input
          id={id("label")}
          className="cs-input"
          maxLength={LIMITS.label}
          value={config.label}
          placeholder="Spring stream giveaway"
          onChange={(event) => onChange({ label: event.target.value })}
          aria-invalid={Boolean(errors.label)}
          aria-describedby={describedBy(id("label"), false, errors.label)}
        />
      </Field>

      {code !== undefined && onCode ? (
        <fieldset className="cs-fieldset">
          <legend className="cs-label">Code type</legend>
          <div className="cs-segment" role="radiogroup" aria-label="Code type">
            {CODE_MODES.map((mode) => (
              <label key={mode.id} className="cs-segment-option">
                <input type="radio" name={id("mode")} value={mode.id} checked={config.codeMode === mode.id} onChange={() => onChange({ codeMode: mode.id })} />
                <span>{mode.label}</span>
              </label>
            ))}
          </div>
          {config.codeMode === "random" ? (
            <p className="cs-hint">A random 16-character code (like K7QM-3XRP-W9TD-HN4C) is drawn when you publish and shown to you once.</p>
          ) : (
            <Field
              id={id("code")}
              label={config.codeMode === "phrase" ? "Phrase" : "Code text"}
              error={errors.code}
              hint={
                config.codeMode === "phrase"
                  ? phrase
                    ? `Players type it as: ${phrase}. Case and extra spaces don’t matter. The phrase is never saved with drafts.`
                    : "Words of letters and numbers. Case and extra spaces don’t matter. The phrase is never saved with drafts."
                  : "Letters and numbers; dashes and dots may separate them. Players can type it without them, in any case. Never saved with drafts."
              }
            >
              <input
                id={id("code")}
                className="cs-input cs-input-code"
                value={code}
                autoComplete="off"
                spellCheck={false}
                placeholder={config.codeMode === "phrase" ? "OPEN THE VAULT" : "SPRING-2027"}
                onChange={(event) => onCode(event.target.value)}
                aria-invalid={Boolean(errors.code)}
                aria-describedby={describedBy(id("code"), true, errors.code)}
              />
            </Field>
          )}
        </fieldset>
      ) : null}

      <fieldset className="cs-fieldset">
        <legend className="cs-label">Who can redeem it</legend>
        <div className="cs-segment" role="radiogroup" aria-label="Audience">
          <label className="cs-segment-option">
            <input type="radio" name={id("audience")} checked={config.audience === "everyone"} onChange={() => onChange({ audience: "everyone" })} />
            <span>Every signed-in account</span>
          </label>
          <label className="cs-segment-option">
            <input type="radio" name={id("audience")} checked={config.audience === "allowlist"} onChange={() => onChange({ audience: "allowlist" })} />
            <span>Only listed accounts</span>
          </label>
        </div>
        {config.audience === "allowlist" ? (
          <AccountPicker idPrefix={idPrefix} value={config.allowlist} initial={accounts} onChange={(allowlist) => onChange({ allowlist })} error={errors.allowlist} />
        ) : null}
      </fieldset>

      <div className="cs-grid-2">
        <Field id={id("start")} label="Start" hint="Empty: redeemable as soon as it’s published." error={errors.startsAt}>
          <div className="cs-row">
            <input
              id={id("start")}
              type="datetime-local"
              className="cs-input"
              value={toLocalInput(config.startsAt)}
              onChange={(event) => onChange({ startsAt: fromLocalInput(event.target.value) })}
              aria-describedby={describedBy(id("start"), true, errors.startsAt)}
            />
            {config.startsAt ? (
              <button type="button" className="cs-button cs-button-small" onClick={() => onChange({ startsAt: null })}>
                Clear
              </button>
            ) : null}
          </div>
        </Field>
        <Field id={id("expiry")} label="Expiry" hint="Empty: never expires." error={errors.expiresAt}>
          <div className="cs-row">
            <input
              id={id("expiry")}
              type="datetime-local"
              className="cs-input"
              value={toLocalInput(config.expiresAt)}
              onChange={(event) => onChange({ expiresAt: fromLocalInput(event.target.value) })}
              aria-invalid={Boolean(errors.expiresAt)}
              aria-describedby={describedBy(id("expiry"), true, errors.expiresAt)}
            />
            {config.expiresAt ? (
              <button type="button" className="cs-button cs-button-small" onClick={() => onChange({ expiresAt: null })}>
                Remove
              </button>
            ) : null}
          </div>
          <div className="cs-chips" role="group" aria-label="Expiry presets">
            {EXPIRY_PRESETS.map((preset) => (
              <button key={preset.label} type="button" className="cs-chip" onClick={() => onChange({ expiresAt: presetExpiry(config.startsAt, preset.ms) })}>
                {preset.label}
              </button>
            ))}
            <button type="button" className="cs-chip" aria-pressed={!config.expiresAt} onClick={() => onChange({ expiresAt: null })}>
              Never
            </button>
          </div>
        </Field>
      </div>
      <p className="cs-hint">Times are in your time zone ({timeZone}).</p>

      <div className="cs-grid-2">
        <Field id={id("max")} label="Total redemptions" hint="Empty: no limit." error={errors.maxRedemptions}>
          <input
            id={id("max")}
            className="cs-input cs-input-number"
            inputMode="numeric"
            autoComplete="off"
            placeholder="No limit"
            value={config.maxRedemptions === null ? "" : String(config.maxRedemptions)}
            onChange={(event) => onChange({ maxRedemptions: event.target.value.trim() ? (wholeNumber(event.target.value) ?? 0) : null })}
            aria-invalid={Boolean(errors.maxRedemptions)}
            aria-describedby={describedBy(id("max"), true, errors.maxRedemptions)}
          />
        </Field>
        <Field id={id("per")} label="Per account" hint={`How often one account may redeem it (1 to ${LIMITS.perAccount}).`} error={errors.perAccountLimit}>
          <input
            id={id("per")}
            className="cs-input cs-input-number"
            inputMode="numeric"
            autoComplete="off"
            value={config.perAccountLimit ? String(config.perAccountLimit) : ""}
            onChange={(event) => onChange({ perAccountLimit: wholeNumber(event.target.value) ?? 0 })}
            aria-invalid={Boolean(errors.perAccountLimit)}
            aria-describedby={describedBy(id("per"), true, errors.perAccountLimit)}
          />
        </Field>
      </div>
    </div>
  );
}

const label = (account: AdminAccount | undefined) => account?.name || account?.email || "Unknown account";

/** The most coins the code can pay out. */
export function PayoutFacts({ config }: { config: CodeConfig }) {
  const payout = maxPayout(effectiveConfig(config));
  return (
    <dl className="cs-facts">
      <div>
        <dt>Most one account gets</dt>
        <dd>{plural(payout.perAccount, "coin")}</dd>
      </div>
      <div>
        <dt>Most everyone together gets</dt>
        <dd>{payout.total === null ? "No upper bound" : plural(payout.total, "coin")}</dd>
      </div>
    </dl>
  );
}

/** Repeatable coin codes are confirmed explicitly, with the payout spelled out. */
export function RepeatConfirm({ id, config, checked, onChange, error }: { id: string; config: CodeConfig; checked: boolean; onChange: (checked: boolean) => void; error?: string }) {
  const payout = maxPayout(effectiveConfig(config));
  return (
    <div className="cs-confirm" data-invalid={error ? "" : undefined}>
      <label className="cs-check">
        <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-describedby={describedBy(id, false, error)} />
        <span>
          One account can redeem this {config.perAccountLimit} times, for up to {plural(payout.perAccount, "coin")}
          {payout.total === null ? ", with no upper bound overall" : ` (${plural(payout.total, "coin")} overall)`}. I confirm this payout.
        </span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="cs-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Allowlist editing: search accounts by name, email or id; selected accounts as removable rows. */
function AccountPicker({ idPrefix, value, initial, onChange, error }: { idPrefix: string; value: string[]; initial: AdminAccount[]; onChange: (ids: string[]) => void; error?: string }) {
  const [known, setKnown] = useState(() => new Map(initial.map((account) => [account.id, account])));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminAccount[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const requested = useRef(new Set(initial.map((account) => account.id)));
  const remember = (accounts: AdminAccount[]) =>
    setKnown((previous) => {
      const next = new Map(previous);
      for (const account of accounts) next.set(account.id, account);
      return next;
    });

  // Names for accounts that came from a draft or a clone.
  useEffect(() => {
    const missing = value.filter((id) => !requested.current.has(id));
    if (!missing.length) return;
    for (const id of missing) requested.current.add(id);
    const controller = new AbortController();
    apiFetch<{ accounts: AdminAccount[] }>(`/api/admin/vault/accounts?ids=${missing.join(",")}`, { signal: controller.signal })
      .then(({ accounts }) => remember(accounts))
      .catch(() => {});
    return () => controller.abort();
  }, [value]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("loading");
      apiFetch<{ accounts: AdminAccount[] }>(`/api/admin/vault/accounts?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then(({ accounts }) => {
          setResults(accounts);
          remember(accounts);
          setStatus("idle");
        })
        .catch(() => {
          if (!controller.signal.aborted) setStatus("error");
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const selected = new Set(value);
  const full = value.length >= LIMITS.allowlist;
  const searchId = `${idPrefix}-accounts`;
  return (
    <div className="cs-accounts">
      <label htmlFor={searchId} className="sr-only">
        Search accounts
      </label>
      <input
        id={searchId}
        type="search"
        className="cs-input"
        placeholder="Search by name, email or account id"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-describedby={describedBy(searchId, false, error)}
      />
      {error ? (
        <p id={`${searchId}-error`} className="cs-error" role="alert">
          {error}
        </p>
      ) : null}
      {query.trim().length >= 2 ? (
        <ul className="cs-account-results" aria-live="polite" aria-busy={status === "loading"}>
          {status === "error" ? <li className="cs-hint">Accounts couldn’t be searched. Try again.</li> : null}
          {status !== "error" && !results.length && status === "idle" ? <li className="cs-hint">No accounts match.</li> : null}
          {results.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                className="cs-account"
                aria-pressed={selected.has(account.id)}
                disabled={!selected.has(account.id) && full}
                onClick={() => onChange(selected.has(account.id) ? value.filter((id) => id !== account.id) : [...value, account.id])}
              >
                <ProfileAvatar name={account.name} src={account.avatarUrl} decoration={null} className="size-7 text-[0.6rem]" />
                <span className="cs-account-text">
                  <span>{label(account)}</span>
                  {account.email && account.name ? <span className="cs-option-meta">{account.email}</span> : null}
                </span>
                <span aria-hidden>{selected.has(account.id) ? "✓" : "+"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="cs-hint">{value.length ? `${number(value.length)} of at most ${LIMITS.allowlist} accounts listed.` : "No accounts listed yet."}</p>
      {value.length ? (
        <ul className="cs-account-list">
          {value.map((id) => {
            const account = known.get(id);
            return (
              <li key={id} className="cs-account cs-account-static">
                <ProfileAvatar name={account?.name} src={account?.avatarUrl} decoration={null} className="size-7 text-[0.6rem]" />
                <span className="cs-account-text">{label(account)}</span>
                <button type="button" className="cs-link" onClick={() => onChange(value.filter((item) => item !== id))} aria-label={`Remove ${label(account)}`}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
