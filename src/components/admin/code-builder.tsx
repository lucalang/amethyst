"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Coins, FilePenLine, Loader2, Shapes, Trophy } from "lucide-react";
import { useArcade } from "@/components/arcade/game-shell";
import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { playAdminSound, type AdminSound } from "@/components/vault/vault-audio";
import { ACHIEVEMENT_PREFIX, rewardInfo, rewardSummary, type VaultLooks } from "@/components/vault/vault-reveal";
import { achievementDefinition } from "@/lib/achievements";
import { ApiError, apiFetch } from "@/lib/api-client";
import { CODE_RULES, normalizePhrase } from "@/lib/code-format";
import {
  DAILY_EARNING_LIMIT,
  draftConfigSchema,
  EMPTY_CONFIG,
  LIMITS,
  maxPayout,
  needsRepeatConfirmation,
  type AdminAccount,
  type CatalogAchievement,
  type CatalogItem,
  type CodeConfig,
} from "@/lib/vault-admin";
import { useConsole, useConsoleLayers, useConsoleRewards, useConsoleStep } from "./admin-console";
import { ConsoleView, formatWhen, RewardTiles, SystemWindow, useTimeZone } from "./admin-ui";
import { AccountPicker, accountLabel, AchievementPicker, CosmeticPicker } from "./reward-pickers";

const PublishSeal = dynamic(() => import("./publish-seal"), { ssr: false, loading: () => <div className="ax-forge" aria-hidden /> });

const STEPS = ["Rewards", "Values & selection", "Eligibility & limits", "Review"] as const;
const LAST = STEPS.length - 1;

type RewardTypes = { coins: boolean; cosmetics: boolean; achievements: boolean };
type ErrorKey = "types" | "coins" | "items" | "achievements" | "label" | "code" | "allowlist" | "startsAt" | "expiresAt" | "maxRedemptions" | "perAccountLimit" | "confirmRepeat";
type Errors = Partial<Record<ErrorKey, string>>;
type Done = { kind: "published"; id: string; code: string; startsAt: string | null; scheduled: boolean } | { kind: "draft"; id: string };

/** The configuration that would be published: unticked reward types and an unused allowlist dropped. */
const effectiveConfig = (config: CodeConfig, types: RewardTypes): CodeConfig => ({
  ...config,
  label: config.label.trim(),
  coins: types.coins ? config.coins : 0,
  items: types.cosmetics ? config.items : [],
  achievements: types.achievements ? config.achievements : [],
  allowlist: config.audience === "allowlist" ? config.allowlist : [],
});

/** Drafts may be incomplete: anything not yet valid is left out rather than blocking the save. */
const draftable = (config: CodeConfig) => {
  const shape = draftConfigSchema.shape as Record<string, { safeParse: (value: unknown) => { success: boolean } }>;
  return Object.fromEntries(Object.entries(config).filter(([key, value]) => shape[key]?.safeParse(value).success));
};

const wholeIn = (value: number | null, min: number, max: number) => value !== null && Number.isInteger(value) && value >= min && value <= max;

function validate(step: number, config: CodeConfig, types: RewardTypes, phrase: string, confirmed: boolean): Errors {
  const errors: Errors = {};
  if (step === 0 && !types.coins && !types.cosmetics && !types.achievements) errors.types = "Choose at least one kind of reward.";
  if (step === 1) {
    if (types.coins && !wholeIn(config.coins, 1, LIMITS.coins)) errors.coins = `Enter a whole number from 1 to ${LIMITS.coins.toLocaleString("en")}.`;
    if (types.cosmetics && !config.items.length) errors.items = "Pick at least one cosmetic, or untick cosmetics in the first step.";
    if (types.achievements && !config.achievements.length) errors.achievements = "Pick at least one achievement, or untick achievements in the first step.";
  }
  if (step === 2) {
    if (!config.label.trim()) errors.label = "Give the code a label so you can find it later.";
    if (config.codeMode === "phrase" && !normalizePhrase(phrase)) errors.code = `${CODE_RULES} For example: OPEN THE VAULT.`;
    if (config.audience === "allowlist" && !config.allowlist.length) errors.allowlist = "Add at least one account, or let everyone redeem it.";
    const start = config.startsAt ? Date.parse(config.startsAt) : null;
    const end = config.expiresAt ? Date.parse(config.expiresAt) : null;
    if (end !== null && end <= Date.now()) errors.expiresAt = "The expiry has to be in the future.";
    else if (end !== null && start !== null && end <= start) errors.expiresAt = "The expiry has to be after the start.";
    if (config.maxRedemptions !== null && !wholeIn(config.maxRedemptions, 1, LIMITS.maxRedemptions))
      errors.maxRedemptions = `Enter a whole number from 1 to ${LIMITS.maxRedemptions.toLocaleString("en")}, or leave it empty.`;
    if (!wholeIn(config.perAccountLimit, 1, LIMITS.perAccount)) errors.perAccountLimit = `Enter a whole number from 1 to ${LIMITS.perAccount}.`;
  }
  if (step === LAST && needsRepeatConfirmation(config) && !confirmed) errors.confirmRepeat = "Confirm the repeatable coin payout before publishing.";
  return errors;
}

const pad = (value: number) => String(value).padStart(2, "0");
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fromLocalInput = (value: string) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};
const numberInput = (value: string) => (value.trim() === "" ? null : Number(value));
const isFuture = (iso: string | null) => iso !== null && Date.parse(iso) > Date.now();
const plural = (count: number, word: string) => `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;

type BuilderProps = {
  catalog: { items: CatalogItem[]; achievements: CatalogAchievement[] };
  looks: VaultLooks;
  initial: CodeConfig;
  accounts: AdminAccount[];
  draftId: string | null;
  cloneOf: string | null;
};

export function CodeBuilder({ catalog, looks, initial, accounts: initialAccounts, draftId: initialDraft, cloneOf }: BuilderProps) {
  const { sound, effects } = useArcade();
  const { signal } = useConsole();
  const timeZone = useTimeZone();
  const [config, setConfig] = useState(initial);
  const [types, setTypes] = useState<RewardTypes>(() => ({ coins: initial.coins > 0, cosmetics: initial.items.length > 0, achievements: initial.achievements.length > 0 }));
  const [phrase, setPhrase] = useState("");
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmRepeat, setConfirmRepeat] = useState(false);
  const [busy, setBusy] = useState<"publish" | "draft" | null>(null);
  const [draftId, setDraftId] = useState(initialDraft);
  const [accounts, setAccounts] = useState<Record<string, AdminAccount>>(() => Object.fromEntries(initialAccounts.map((account) => [account.id, account])));
  const [done, setDone] = useState<Done | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moveFocus = useRef(false);
  useConsoleLayers(done ? 0 : STEPS.length - step);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    headingRef.current?.focus();
  }, [step, done]);

  const effective = effectiveConfig(config, types);
  // The window's step mechanism sits on Publish while the request runs and after it lands; the
  // selection stays in the scene through the seal so it can be drawn into it.
  useConsoleStep(done?.kind === "draft" ? -1 : done || busy === "publish" ? STEPS.length : step);
  useConsoleRewards(
    done?.kind === "draft" ? null : { coins: effective.coins, ids: [...effective.items, ...effective.achievements.map((id) => ACHIEVEMENT_PREFIX + id)], looks },
  );
  const achievementData = new Map(catalog.achievements.map((entry) => [entry.id, entry]));
  const chosenAchievements = effective.achievements.map((id) => ({ id, definition: achievementDefinition(id), data: achievementData.get(id) }));
  const achievementCoins = chosenAchievements.reduce((sum, entry) => sum + (entry.data?.coins ?? 0), 0);
  const payout = maxPayout(effective);
  const repeatable = needsRepeatConfirmation(effective);
  const normalized = normalizePhrase(phrase);
  const sfx = (name: AdminSound) => {
    if (sound) playAdminSound(name);
  };

  const clear = (...keys: ErrorKey[]) =>
    setErrors((current) => {
      if (!keys.some((key) => key in current)) return current;
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });

  function update(patch: Partial<CodeConfig>, ...keys: ErrorKey[]) {
    setConfig((current) => ({ ...current, ...patch }));
    if ("coins" in patch || "perAccountLimit" in patch) setConfirmRepeat(false);
    clear(...keys);
  }

  function show(target: number) {
    moveFocus.current = true;
    setStep(target);
    setReached((current) => Math.max(current, target));
  }

  function firstInvalid(from: number, to: number) {
    for (let index = from; index <= to; index++) {
      const found = validate(index, effective, types, phrase, confirmRepeat);
      if (Object.keys(found).length) return { index, found };
    }
    return null;
  }

  function goTo(target: number) {
    setFailure(null);
    if (target > step) {
      const invalid = firstInvalid(step, target - 1);
      if (invalid) {
        setErrors(invalid.found);
        if (invalid.index !== step) show(invalid.index);
        sfx("error");
        signal("error");
        return;
      }
    }
    setErrors({});
    show(target);
    sfx("step");
    if (target !== step) signal(target > step ? "forward" : "back");
  }

  async function publish() {
    setFailure(null);
    const invalid = firstInvalid(0, LAST);
    if (invalid) {
      setErrors(invalid.found);
      if (invalid.index !== step) show(invalid.index);
      sfx("error");
      signal("error");
      return;
    }
    setBusy("publish");
    signal("pending");
    try {
      const result = await apiFetch<{ id: string; code: string }>("/api/admin/vault/codes", {
        method: "POST",
        json: { config: effective, code: effective.codeMode === "phrase" ? phrase : undefined, confirmRepeat: repeatable && confirmRepeat, draftId },
      });
      setPhrase("");
      setDraftId(null);
      moveFocus.current = true;
      setDone({
        kind: "published",
        id: result.id,
        code: result.code,
        startsAt: effective.startsAt,
        scheduled: isFuture(effective.startsAt),
      });
      sfx("publish");
      signal("publish");
    } catch (error) {
      sfx("error");
      signal("error");
      if (error instanceof ApiError && (error.code === "duplicate_code" || error.code === "invalid_code")) {
        setErrors({ code: error.message });
        show(2);
      } else if (error instanceof ApiError && error.code === "confirm_repeat") {
        setErrors({ confirmRepeat: error.message });
      } else {
        setFailure(error instanceof ApiError ? error.message : "No answer from the server. Check the code list before publishing again.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    setFailure(null);
    setBusy("draft");
    try {
      const { id } = await apiFetch<{ id: string }>("/api/admin/vault/drafts", { method: "POST", json: { id: draftId, config: draftable(effective) } });
      setDraftId(id);
      window.history.replaceState(null, "", `/admin/new?draft=${id}`);
      moveFocus.current = true;
      setDone({ kind: "draft", id });
      sfx("draft");
      signal("draft");
    } catch (error) {
      sfx("error");
      signal("error");
      setFailure(error instanceof ApiError ? error.message : "The draft couldn’t be saved. Your choices are still here; try again.");
    } finally {
      setBusy(null);
    }
  }

  const back = (
    <Link href="/admin" className="ax-back">
      <ArrowLeft aria-hidden className="size-4" /> All codes
    </Link>
  );
  const title = config.label.trim() || "New Vault code";

  function startOver() {
    setConfig({ ...EMPTY_CONFIG });
    setTypes({ coins: false, cosmetics: false, achievements: false });
    setConfirmRepeat(false);
    setErrors({});
    setReached(0);
    setDraftId(null);
    window.history.replaceState(null, "", "/admin/new");
    moveFocus.current = true;
    setStep(0);
    setDone(null);
  }

  if (done?.kind === "published") {
    const { scheduled } = done;
    return (
      <ConsoleView back={back} eyebrow="Admin · Published" title={title}>
        <SystemWindow id="ax-done-title" headingRef={headingRef} title="Code published" className="ax-done" motion={effects}>
          <PublishSeal code={done.code} status={scheduled ? "scheduled" : "active"} animate={effects !== "off"} />
          <p className="ax-lede">
            {scheduled && done.startsAt ? `Redeemable from ${formatWhen(done.startsAt)}. ` : "Anyone it’s meant for can redeem it in the Vault right away. "}
            Rewards and rules are now fixed; you can disable or clone it from its page.
          </p>
          <div className="ax-done-actions">
            <Link href={`/admin/codes/${done.id}`} className="ax-btn" data-variant="primary">
              View code
            </Link>
            <button type="button" className="ax-btn" onClick={startOver}>
              Build another
            </button>
            <Link href="/admin" className="ax-btn">
              All codes
            </Link>
          </div>
        </SystemWindow>
      </ConsoleView>
    );
  }

  if (done?.kind === "draft") {
    return (
      <ConsoleView back={back} eyebrow="Admin · Draft" title={title}>
        <SystemWindow id="ax-done-title" headingRef={headingRef} title="Draft saved" tone="draft" className="ax-done" motion={effects}>
          <FilePenLine aria-hidden className="ax-done-icon" />
          <p className="ax-lede">
            Not redeemable. No code exists until you publish it{config.codeMode === "phrase" ? ", and the phrase isn’t stored with drafts" : ""}. It waits under Drafts in the admin panel.
          </p>
          <div className="ax-done-actions">
            <button
              type="button"
              className="ax-btn"
              data-variant="primary"
              onClick={() => {
                moveFocus.current = true;
                setDone(null);
              }}
            >
              Keep editing
            </button>
            <Link href="/admin" className="ax-btn">
              All codes
            </Link>
          </div>
        </SystemWindow>
      </ConsoleView>
    );
  }

  const fieldError = (key: ErrorKey) =>
    errors[key] ? (
      <p id={`ax-err-${key}`} className="ax-error">
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: ErrorKey) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `ax-err-${key}` } : {});
  const errorCount = Object.keys(errors).length;

  return (
    <ConsoleView
      back={back}
      eyebrow={draftId ? "Admin · Draft" : cloneOf ? "Admin · Clone" : "Admin · New code"}
      title={title}
      lede={cloneOf ? "A copy of an existing code’s rewards and rules. It gets a new code of its own when you publish it." : undefined}
      asideLabel="Builder progress"
      aside={
        <SystemWindow id="ax-sequence-title" title="Sequence" count={`${pad(Math.min(step, STEPS.length) + 1)} / ${pad(STEPS.length + 1)}`}>
          <nav aria-label="Builder steps">
            <ol className="ax-steps">
              {STEPS.map((label, index) => {
                const complete = index < step || (index <= reached && index !== step);
                return (
                  <li key={label}>
                    <button
                      type="button"
                      className="ax-step"
                      aria-current={index === step ? "step" : undefined}
                      data-done={complete ? "" : undefined}
                      disabled={index > reached || busy !== null}
                      onClick={() => goTo(index)}
                    >
                      <span className="ax-step-index">{complete ? <Check aria-hidden className="size-3.5" /> : pad(index + 1)}</span>
                      <span className="ax-step-label">{label}</span>
                    </button>
                  </li>
                );
              })}
              <li>
                <span className="ax-step" data-final="" data-busy={busy === "publish" ? "" : undefined} aria-busy={busy === "publish" || undefined}>
                  <span className="ax-step-index">{busy === "publish" ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : pad(STEPS.length + 1)}</span>
                  <span className="ax-step-label">{busy === "publish" ? "Publishing…" : "Publish"}</span>
                </span>
              </li>
            </ol>
          </nav>
        </SystemWindow>
      }
      mainKey={step}
      footer={
        <div className="ax-actions">
          {step > 0 ? (
            <button type="button" className="ax-btn" disabled={busy !== null} onClick={() => goTo(step - 1)}>
              <ArrowLeft aria-hidden className="size-4" /> Back
            </button>
          ) : (
            <span />
          )}
          <div className="ax-actions-end">
            <button type="button" className="ax-btn" disabled={busy !== null} onClick={saveDraft}>
              {busy === "draft" ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <FilePenLine aria-hidden className="size-4" />}
              Save draft
            </button>
            {step < LAST ? (
              <button type="button" className="ax-btn" data-variant="primary" disabled={busy !== null} onClick={() => goTo(step + 1)}>
                Next<span className="ax-next-target">: {STEPS[step + 1]}</span> <ArrowRight aria-hidden className="size-4" />
              </button>
            ) : (
              <button type="button" className="ax-btn" data-variant="primary" disabled={busy !== null} onClick={publish}>
                {busy === "publish" ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : null}
                Publish code
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="ax-builder" data-motion={effects}>
        <SystemWindow
          key={step}
          id="ax-step-title"
          headingRef={headingRef}
          className="ax-step-window"
          title={
            <>
              <span aria-hidden className="ax-window-index">
                {pad(step + 1)}/{pad(STEPS.length)}
              </span>
              <span className="sr-only">
                Step {step + 1} of {STEPS.length}:{" "}
              </span>
              {STEPS[step]}
            </>
          }
        >
          {errorCount > 1 ? (
            <p role="alert" className="ax-error">
              {errorCount} things need attention below.
            </p>
          ) : null}

          {step === 0 ? (
            <fieldset className="ax-fieldset">
              <legend className="ax-hint">What should this code grant? Pick any combination; you’ll choose the details next.</legend>
              <div className="ax-choices">
                {(
                  [
                    { key: "coins", icon: Coins, title: "Coins", body: "A fixed number of coins per redemption." },
                    { key: "cosmetics", icon: Shapes, title: "Cosmetics", body: "Frames, decorations, badges, titles and game looks, owned permanently." },
                    { key: "achievements", icon: Trophy, title: "Achievements", body: "Unlocks achievements, including their own rewards, through the achievement system." },
                  ] as const
                ).map(({ key, icon: Icon, title, body }) => (
                  <label key={key} className="ax-choice" data-checked={types[key] ? "" : undefined}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={types[key]}
                      onChange={(event) => {
                        setTypes((current) => ({ ...current, [key]: event.target.checked }));
                        if (key === "coins") setConfirmRepeat(false);
                        clear("types");
                      }}
                    />
                    <span aria-hidden className="ax-choice-mark">
                      <Icon />
                    </span>
                    <span className="ax-choice-title">{title}</span>
                    <span className="ax-choice-body">{body}</span>
                    <span className="ax-item-check" aria-hidden>
                      {types[key] ? <Check className="size-3.5" /> : null}
                    </span>
                  </label>
                ))}
              </div>
              {fieldError("types")}
            </fieldset>
          ) : null}

          {step === 1 ? (
            <div className="ax-stack">
              {types.coins ? (
                <Block title="Coins">
                  <label className="ax-field">
                    <span className="ax-label">Coins per redemption</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={LIMITS.coins}
                      step={1}
                      className="ax-input ax-input-short"
                      value={config.coins || ""}
                      onChange={(event) => update({ coins: numberInput(event.target.value) ?? 0 }, "coins", "confirmRepeat")}
                      {...invalid("coins")}
                    />
                  </label>
                  {fieldError("coins")}
                  <p className="ax-hint">
                    Code coins are their own kind of income: they don’t count toward, or use up, the daily earning limit of {DAILY_EARNING_LIMIT} coins from play and slots.
                  </p>
                </Block>
              ) : null}
              {types.cosmetics ? (
                <Block title="Cosmetics">
                  <CosmeticPicker items={catalog.items} selected={config.items} onChange={(items) => update({ items }, "items")} looks={looks} />
                  {fieldError("items")}
                </Block>
              ) : null}
              {types.achievements ? (
                <Block title="Achievements">
                  <p className="ax-hint">
                    Redeeming unlocks each one through the achievement system, with its own reward once per account. Accounts that already have it keep their original unlock and get nothing twice.
                  </p>
                  <AchievementPicker catalog={catalog.achievements} selected={config.achievements} onChange={(achievements) => update({ achievements }, "achievements")} />
                  {fieldError("achievements")}
                </Block>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="ax-stack">
              <Block title="Label">
                <label className="ax-field">
                  <span className="ax-label">Admin label (never shown to players)</span>
                  <input
                    className="ax-input"
                    maxLength={LIMITS.label}
                    value={config.label}
                    placeholder="e.g. Winter newsletter"
                    onChange={(event) => update({ label: event.target.value }, "label")}
                    {...invalid("label")}
                  />
                </label>
                {fieldError("label")}
              </Block>

              <Block title="The code">
                <div role="radiogroup" aria-label="Code type" className="ax-chips">
                  {(
                    [
                      { id: "phrase", label: "Chosen words" },
                      { id: "random", label: "Random code" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={config.codeMode === option.id}
                      className="ax-chip"
                      onClick={() => update({ codeMode: option.id }, "code")}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {config.codeMode === "phrase" ? (
                  <>
                    <label className="ax-field">
                      <span className="ax-label">Phrase</span>
                      <input
                        className="ax-input ax-mono"
                        value={phrase}
                        maxLength={200}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="OPEN THE VAULT"
                        onChange={(event) => {
                          setPhrase(event.target.value);
                          clear("code");
                        }}
                        {...invalid("code")}
                      />
                    </label>
                    <p className="ax-hint" aria-live="polite">
                      {phrase.trim() ? (normalized ? `Players type it as: ${normalized}. Case and extra spaces don’t matter.` : CODE_RULES) : "Letters, numbers and single spaces; case and extra spaces don’t matter."}
                      {draftId || phrase ? " The phrase is never saved with drafts." : ""}
                    </p>
                  </>
                ) : (
                  <p className="ax-hint">A random 16-character code (like K7QM-3XRP-W9TD-HN4C) is generated when you publish, and shown to you once.</p>
                )}
                {fieldError("code")}
              </Block>

              <Block title="Who can redeem it">
                <div role="radiogroup" aria-label="Audience" className="ax-chips">
                  {(
                    [
                      { id: "everyone", label: "Every signed-in account" },
                      { id: "allowlist", label: "Only listed accounts" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={config.audience === option.id}
                      className="ax-chip"
                      onClick={() => update({ audience: option.id }, "allowlist")}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {config.audience === "allowlist" ? (
                  <>
                    <AccountPicker
                      selected={config.allowlist}
                      accounts={accounts}
                      onChange={(allowlist, found) => {
                        if (found) setAccounts((current) => ({ ...current, [found.id]: found }));
                        update({ allowlist }, "allowlist");
                      }}
                    />
                    <p className="ax-hint">Anyone else who tries it is told the code doesn’t exist.</p>
                  </>
                ) : null}
                {fieldError("allowlist")}
              </Block>

              <Block title="When">
                <p className="ax-hint">Times are in your device’s time zone{timeZone ? `: ${timeZone}` : ""}.</p>
                <div className="ax-pair">
                  <DateField
                    label="Starts (optional)"
                    hint="Empty: redeemable as soon as it’s published."
                    value={config.startsAt}
                    onChange={(startsAt) => update({ startsAt }, "startsAt", "expiresAt")}
                    error={fieldError("startsAt")}
                    invalid={invalid("startsAt")}
                  />
                  <DateField
                    label="Expires (optional)"
                    hint="Empty: never expires."
                    value={config.expiresAt}
                    onChange={(expiresAt) => update({ expiresAt }, "expiresAt")}
                    error={fieldError("expiresAt")}
                    invalid={invalid("expiresAt")}
                  />
                </div>
              </Block>

              <Block title="Limits">
                <div className="ax-pair">
                  <div>
                    <label className="ax-field">
                      <span className="ax-label">Total redemptions (optional)</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={LIMITS.maxRedemptions}
                        step={1}
                        className="ax-input"
                        placeholder="No limit"
                        value={config.maxRedemptions ?? ""}
                        onChange={(event) => update({ maxRedemptions: numberInput(event.target.value) }, "maxRedemptions")}
                        {...invalid("maxRedemptions")}
                      />
                    </label>
                    {fieldError("maxRedemptions")}
                    <p className="ax-hint">Across all accounts. Empty: no total limit.</p>
                  </div>
                  <div>
                    <label className="ax-field">
                      <span className="ax-label">Redemptions per account</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={LIMITS.perAccount}
                        step={1}
                        className="ax-input"
                        value={Number.isFinite(config.perAccountLimit) && config.perAccountLimit ? config.perAccountLimit : ""}
                        onChange={(event) => update({ perAccountLimit: numberInput(event.target.value) ?? 0 }, "perAccountLimit", "confirmRepeat")}
                        {...invalid("perAccountLimit")}
                      />
                    </label>
                    {fieldError("perAccountLimit")}
                    <p className="ax-hint">Usually 1. Cosmetics and achievements are only ever granted once; repeats add coins only.</p>
                  </div>
                </div>
              </Block>
            </div>
          ) : null}

          {step === LAST ? (
            <div className="ax-review">
              <div className="ax-stack">
                <Block title="Each redemption grants">
                  <RewardTiles coins={effective.coins} items={effective.items} achievements={effective.achievements} looks={looks} />
                  {effective.items.length ? <p className="ax-hint">Cosmetics are owned permanently. Accounts that already own one keep it, and the redemption still succeeds.</p> : null}
                </Block>

                {chosenAchievements.length ? (
                  <Block title="Achievement rewards">
                    <p className="ax-hint">
                      Each achievement also grants its own reward, once per account, the first time it unlocks. Accounts that already have it keep their original unlock date and get nothing extra.
                      Code unlocks are recorded as coming from a code, not from play.
                    </p>
                    <ul className="ax-review-list">
                      {chosenAchievements.map(({ id, definition, data }) => {
                        const own = data ? rewardSummary(data.coins, data.items) : "";
                        const overlap = (data?.items ?? []).filter((item) => effective.items.includes(item));
                        return (
                          <li key={id}>
                            {definition ? <AchievementBadge achievement={definition} earned size={32} /> : null}
                            <span className="min-w-0">
                              <strong>{definition?.name ?? id}</strong>
                              {data?.hidden ? (
                                <span className="ax-flag" data-tone="hidden">
                                  Hidden
                                </span>
                              ) : null}
                              <span className="ax-muted block">Also grants {own || "no extra reward"}</span>
                              {overlap.length ? (
                                <span className="ax-hint block">
                                  {overlap.map((item) => rewardInfo(item).name).join(", ")} is also picked directly; it’s granted once.
                                </span>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </Block>
                ) : null}
              </div>

              <div className="ax-stack">
                <Block title="Eligibility and timing">
                  <dl className="ax-facts">
                    <Fact term="Label">{effective.label}</Fact>
                    <Fact term="Code">{effective.codeMode === "phrase" ? (normalized ? <span className="ax-mono">{normalized}</span> : "Missing phrase") : "Random, generated on publish"}</Fact>
                    <Fact term="Eligible">{effective.audience === "everyone" ? "Every signed-in account" : plural(effective.allowlist.length, "listed account")}</Fact>
                    <Fact term="Starts">{effective.startsAt ? `${formatWhen(effective.startsAt)}${timeZone ? ` (${timeZone})` : ""}` : "When published"}</Fact>
                    <Fact term="Expires">{effective.expiresAt ? `${formatWhen(effective.expiresAt)}${timeZone ? ` (${timeZone})` : ""}` : "Never"}</Fact>
                  </dl>
                  {effective.audience === "allowlist" && effective.allowlist.length ? (
                    <ul className="ax-accounts" data-variant="compact" aria-label="Eligible accounts">
                      {effective.allowlist.map((id) => {
                        const account = accounts[id];
                        return (
                          <li key={id}>
                            <ProfileAvatar name={account?.name} src={account?.avatarUrl} decoration={null} className="size-7" />
                            <span className="ax-account-name">{accountLabel(account)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </Block>

                <Block title="Usage limits" tone={repeatable ? "alert" : undefined}>
                  <dl className="ax-facts">
                    <Fact term="Total limit">{effective.maxRedemptions === null ? "None" : plural(effective.maxRedemptions, "redemption")}</Fact>
                    <Fact term="Per account">{effective.perAccountLimit === 1 ? "Once" : `Up to ${effective.perAccountLimit} times`}</Fact>
                    {effective.coins > 0 ? (
                      <>
                        <Fact term="Code coins per account">{payout.perAccount.toLocaleString("en")}</Fact>
                        <Fact term="Code coins in total">{payout.total === null ? "No upper limit" : payout.total.toLocaleString("en")}</Fact>
                      </>
                    ) : null}
                    {achievementCoins > 0 ? <Fact term="Achievement coins">Up to {achievementCoins.toLocaleString("en")} per account, once, only for achievements not yet unlocked</Fact> : null}
                  </dl>
                  <p className="ax-hint">
                    {effective.perAccountLimit === 1
                      ? "Repeat redemptions: none. A second attempt from the same account is refused and nothing is granted twice."
                      : effective.coins > 0
                        ? `Repeat redemptions: each repeat adds ${effective.coins.toLocaleString("en")} code coins. Cosmetics and achievements are granted on the first redemption only.`
                        : "Repeat redemptions grant nothing new: cosmetics and achievements are only granted once."}
                    {effective.coins > 0 || achievementCoins > 0 ? ` None of this counts toward the ${DAILY_EARNING_LIMIT}-coin daily earning limit.` : ""}
                  </p>
                </Block>
              </div>

              {repeatable ? (
                <div className="ax-confirm ax-wide" data-invalid={errors.confirmRepeat ? "" : undefined}>
                  <label>
                    <input
                      type="checkbox"
                      checked={confirmRepeat}
                      onChange={(event) => {
                        setConfirmRepeat(event.target.checked);
                        clear("confirmRepeat");
                      }}
                      {...invalid("confirmRepeat")}
                    />
                    <span>
                      I understand each account can redeem this {effective.perAccountLimit} times for up to {payout.perAccount.toLocaleString("en")} code coins
                      {payout.total === null ? ", with no total cap." : `, and at most ${payout.total.toLocaleString("en")} in total.`}
                    </span>
                  </label>
                  {fieldError("confirmRepeat")}
                </div>
              ) : null}

              <p className="ax-hint ax-wide">Once published, rewards and rules can’t be changed. You can disable the code or clone it into a new one.</p>
            </div>
          ) : null}

          {failure ? (
            <p role="alert" className="ax-error">
              {failure}
            </p>
          ) : null}
        </SystemWindow>
      </div>
    </ConsoleView>
  );
}

function Block({ title, tone, children }: { title: string; tone?: "alert"; children: ReactNode }) {
  return (
    <section className="ax-block" data-tone={tone}>
      <h3 className="ax-block-title">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function DateField({
  label,
  hint,
  value,
  onChange,
  error,
  invalid,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  error: ReactNode;
  invalid: object;
}) {
  return (
    <div>
      <label className="ax-field">
        <span className="ax-label">{label}</span>
        <span className="ax-date">
          <input type="datetime-local" className="ax-input" value={toLocalInput(value)} onChange={(event) => onChange(fromLocalInput(event.target.value))} {...invalid} />
          {value ? (
            <button type="button" className="ax-link" onClick={() => onChange(null)}>
              Clear
            </button>
          ) : null}
        </span>
      </label>
      {error}
      <p className="ax-hint">{hint}</p>
    </div>
  );
}
