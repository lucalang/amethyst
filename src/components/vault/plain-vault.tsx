"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Eye, KeyRound, Loader2, RotateCcw, ScrollText, Volume2, VolumeX } from "lucide-react";
import { useArcade } from "@/components/arcade/game-shell";
import { useCardTilt } from "@/components/showcase/card-tilt";
import { PageContainer } from "@/components/layout/app-shell";
import { useSettings } from "@/components/layout/settings-context";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { MotionLevel } from "@/lib/preferences";
import { VAULT_LOOKS, type VaultLookId } from "@/lib/vault-looks";
import type { VaultFind } from "./secret-vault";
import { CARD_STAGGER, PACE } from "./timing";
import { closeVaultAudio, playVaultReveal, playVaultSound, type VaultSound } from "./vault-audio";
import { ACHIEVEMENT_PREFIX, CoinArt, COINS, CountUp, DecodeText, kindLabel, RewardArt, rewardInfo, rewardLink, rewardSummary, Tag, type VaultLooks } from "./vault-reveal";
import "./plain-vault.css";
import { createVaultRequestId } from "./vault-request";

type Redemption =
  | { status: "unlocked"; coins: number; items: string[]; newItems: string[]; balance: number }
  | { status: "already"; coins: number; items: string[]; redeemedAt: string; balance: number }
  | { status: "unavailable" | "unknown"; triesLeft: number };

type Outcome =
  | { phase: "granted"; coins: number; items: string[]; newItems?: string[]; recovered?: boolean }
  | { phase: "already"; coins: number; items: string[]; redeemedAt: string }
  | { phase: "invalid" | "unavailable"; triesLeft: number | null; message?: string }
  | { phase: "locked"; message: string }
  | { phase: "lost"; message: string; since: string | null };

type Phase = "idle" | "verifying" | Outcome["phase"];

const STATUS: Record<Phase, string> = {
  idle: "Ready",
  verifying: "Verifying",
  granted: "Unlocked",
  already: "Claimed",
  invalid: "Denied",
  unavailable: "Inactive",
  locked: "Paused",
  lost: "No answer",
};
const TITLE: Record<Phase, string> = {
  idle: "Enter a code",
  verifying: "Verifying",
  granted: "Access granted",
  already: "Already claimed",
  invalid: "Access denied",
  unavailable: "Code inactive",
  locked: "Too many tries",
  lost: "Answer lost",
};
const HEADLINE: Record<Outcome["phase"], string> = {
  granted: "Code accepted",
  already: "Already yours",
  invalid: "That code didn’t work",
  unavailable: "That code no longer opens",
  locked: "Access paused",
  lost: "No answer",
};
const SOUND: Record<Outcome["phase"], VaultSound> = {
  granted: "grant",
  already: "already",
  invalid: "invalid",
  unavailable: "unavailable",
  locked: "locked",
  lost: "lost",
};
/** A short minimum "verifying" beat so the answer doesn't flash; the request goes out at once. */
const MIN_VERIFY: Record<MotionLevel, number> = { full: 600, subtle: 300, off: 0 };
/** When the reward cards start appearing after a grant. */
const REVEAL_AT: Record<MotionLevel, number> = { full: 150, subtle: 80, off: 0 };
const LOST = "The vault’s answer didn’t arrive. If the code was accepted, its rewards are safe and can’t be granted twice. Check the log or try again.";

/** Marks an attempt in flight (never the code) so a reload can look up how it ended. */
const PENDING_KEY = "archive:vault:pending";
type Pending = { since: string | null; at: number };

function markPending(since: string | null) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ since, at: Date.now() } satisfies Pending));
  } catch {
    // No storage (private mode): "Check the log" after a lost answer still works.
  }
}

function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // No storage: nothing was marked.
  }
}

function readPending(): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as Pending | null;
    return value && typeof value.at === "number" && Date.now() - value.at < 30 * 60_000 ? value : null;
  } catch {
    return null;
  }
}

/** The newest find recorded after `since` (the newest find known before the attempt). */
function newestSince(finds: VaultFind[], since: string | null) {
  const after = since ? Date.parse(since) : Number.NEGATIVE_INFINITY;
  return finds.find((find) => Date.parse(find.redeemedAt) > after) ?? null;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();
const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
const triesNote = (left: number | null) =>
  left === null || left > 2 ? "" : left === 0 ? " The vault will rest for a while before the next try." : ` ${left} more ${left === 1 ? "try" : "tries"} before it rests for a while.`;

function copyFor(outcome: Outcome) {
  switch (outcome.phase) {
    case "granted":
      return outcome.recovered
        ? "Your last attempt was cut off, but the vault had already answered. These rewards were granted once and are yours."
        : "Everything below is now on your account.";
    case "already":
      return `Your account redeemed this code on ${formatDate(outcome.redeemedAt)}. Its rewards are already yours; nothing new was added.`;
    case "invalid":
      return (outcome.message ?? "That code doesn’t open anything here. Check the words and try again.") + triesNote(outcome.triesLeft);
    case "unavailable":
      return "That code is real, but it has expired, run out or been withdrawn." + triesNote(outcome.triesLeft);
    case "locked":
    case "lost":
      return outcome.message;
  }
}

function announce(outcome: Outcome) {
  const rewards = outcome.phase === "granted" || outcome.phase === "already" ? ` ${rewardSummary(outcome.coins, outcome.items, ", ")}.` : "";
  return `${TITLE[outcome.phase]}.${rewards} ${copyFor(outcome)}`;
}

/** The Vault with Special page designs off: the same redemption flow in the standard page style. */
export function PlainChamber({ initialFinds, looks }: { initialFinds: VaultFind[]; looks: VaultLooks }) {
  const router = useRouter();
  const { sound, toggleSound, effects: motion } = useArcade();
  const settings = useSettings();
  const [look, setLook] = useState<VaultLookId>(settings.vaultLook);
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [round, setRound] = useState(0);
  const [finds, setFinds] = useState(initialFinds);
  const [checking, setChecking] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  /** The reward cards: "fresh" right after a grant, "again" when reopened from the panel. */
  const [reveal, setReveal] = useState<"fresh" | "again" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  useCardTilt(stageRef, motion !== "off", "[data-tilt]");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  /** After a lost answer: the newest find before it, so a later "already" for that code shows as its grant. */
  const lostSince = useRef<string | null | undefined>(undefined);
  // One id per attempt. Retrying the same code after a lost answer reuses it, so the vault answers
  // with what that attempt granted instead of granting a repeatable code again.
  const attempt = useRef<{ code: string; request: string } | null>(null);
  const soundRef = useRef(sound);
  const busy = phase === "verifying";

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  useEffect(() => () => closeVaultAudio(), []);

  useEffect(() => {
    if (!outcome) return;
    if (outcome.phase === "invalid" || outcome.phase === "unavailable") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else headingRef.current?.focus();
  }, [outcome]);

  const play = (name: VaultSound) => {
    if (soundRef.current) playVaultSound(name, motion === "subtle" ? PACE.subtle : 1);
  };

  function show(next: Outcome, audible = true) {
    setOutcome(next);
    setPhase(next.phase);
    setRound((value) => value + 1);
    setAnnouncement(announce(next));
    setReveal(next.phase === "granted" ? "fresh" : null);
    if (audible) play(SOUND[next.phase]);
    if (audible && soundRef.current && next.phase === "granted") playVaultReveal((next.coins > 0 ? 1 : 0) + next.items.length, REVEAL_AT[motion] / 1000);
  }

  async function readLog() {
    try {
      const { finds: latest } = await apiFetch<{ finds: VaultFind[] }>("/api/vault/redeem");
      setFinds(latest);
      return latest;
    } catch {
      return null;
    }
  }

  // An answer cut off by a reload is looked up in the log; a code is never sent again.
  useEffect(() => {
    const pending = readPending();
    if (!pending) return;
    let cancelled = false;
    void (async () => {
      const latest = await readLog();
      if (cancelled) return;
      const found = latest && newestSince(latest, pending.since);
      if (found) {
        clearPending();
        show({ phase: "granted", coins: found.coins, items: found.items, recovered: true }, false);
        router.refresh();
      } else if (latest) {
        clearPending();
        show({ phase: "lost", since: pending.since, message: "Your last attempt was interrupted, and nothing new reached your log. Enter the code again if you like; rewards are never granted twice." }, false);
      } else {
        lostSince.current = pending.since;
        show({ phase: "lost", since: pending.since, message: "Your last attempt was interrupted and the log couldn’t be read yet. Check it again in a moment." }, false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!code.trim()) {
      inputRef.current?.focus();
      return;
    }
    inFlight.current = true;
    const since = lostSince.current === undefined ? (finds[0]?.redeemedAt ?? null) : lostSince.current;
    markPending(since);
    setOutcome(null);
    setPhase("verifying");
    setAnnouncement("Verifying the code.");
    play("verify");
    const shortest = wait(MIN_VERIFY[motion]);

    let next: Outcome;
    let balance: number | null = null;
    try {
      const request = attempt.current?.code === code ? attempt.current.request : createVaultRequestId();
      attempt.current = { code, request };
      const result = await apiFetch<Redemption>("/api/vault/redeem", { method: "POST", json: { code, request } });
      if (result.status === "unlocked") {
        next = { phase: "granted", coins: result.coins, items: result.items, newItems: result.newItems };
        balance = result.balance;
      } else if (result.status === "already") {
        // A grant whose answer was lost earlier is shown as that grant, not as an old claim.
        const recovered = lostSince.current !== undefined && Date.parse(result.redeemedAt) > (lostSince.current ? Date.parse(lostSince.current) : Number.NEGATIVE_INFINITY);
        next = recovered
          ? { phase: "granted", coins: result.coins, items: result.items, recovered: true }
          : { phase: "already", coins: result.coins, items: result.items, redeemedAt: result.redeemedAt };
        balance = result.balance;
      } else {
        next = { phase: result.status === "unavailable" ? "unavailable" : "invalid", triesLeft: result.triesLeft };
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "rate_limited") next = { phase: "locked", message: error.message };
      else if (error instanceof ApiError && error.status === 422) next = { phase: "invalid", triesLeft: null, message: error.message };
      else next = { phase: "lost", since, message: error instanceof ApiError && error.status >= 400 && error.status < 500 ? error.message : LOST };
    }

    await shortest;
    inFlight.current = false;
    if (next.phase === "lost") lostSince.current = since;
    else {
      lostSince.current = undefined;
      attempt.current = null;
      clearPending();
    }
    if (balance !== null) window.dispatchEvent(new CustomEvent("archive:coins", { detail: balance }));
    if (next.phase === "granted") {
      const { coins, items, recovered } = next;
      setCode("");
      if (!recovered) setFinds((list) => [{ redeemedAt: nowIso(), coins, items }, ...list]);
      // Server timestamps replace the local guess, so later checks compare like with like.
      void readLog();
      if (items.length) router.refresh();
    }
    show(next);
  }

  async function checkLog() {
    if (outcome?.phase !== "lost" || checking) return;
    const { since } = outcome;
    setChecking(true);
    const latest = await readLog();
    setChecking(false);
    if (!latest) {
      show({ phase: "lost", since, message: "The log couldn’t be read either. Check your connection, then try again." });
      return;
    }
    clearPending();
    lostSince.current = undefined;
    const found = newestSince(latest, since);
    if (found) {
      attempt.current = null;
      show({ phase: "granted", coins: found.coins, items: found.items, recovered: true });
      router.refresh();
    } else show({ phase: "lost", since, message: "Nothing new reached your log, so that attempt granted nothing. Enter the code again whenever you’re ready." });
  }

  function again() {
    setOutcome(null);
    setPhase("idle");
    setAnnouncement("");
    setReveal(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const opened = phase === "granted" || phase === "already";
  const revealing = outcome?.phase === "granted" && reveal !== null;

  const chooseLook = async (next: VaultLookId) => {
    if (next === look) return;
    setLook(next);
    try {
      await apiFetch("/api/preferences", { method: "PATCH", json: { settings: { vaultLook: next } } });
      router.refresh();
    } catch {
      toast.error("Could not save the vault colours. They apply until you leave this page.");
    }
  };

  return (
    <PageContainer>
      <section ref={stageRef} aria-labelledby="vp-title" className="vp-stage" data-phase={phase} data-motion={motion} data-look={look}>
        <header className="vp-hud">
          <div className="min-w-0">
            <h1 id="vp-title" className="vp-title">
              The Vault
            </h1>
            <p className="vp-subtitle">Redeem secret codes for coins, cosmetics and achievements.</p>
          </div>
          <div className="vp-hud-side">
            <fieldset className="vp-look">
              <legend className="sr-only">Vault colours</legend>
              {VAULT_LOOKS.map((option) => (
                <label key={option.id} className="vp-look-option">
                  <input type="radio" name="vp-look" value={option.id} checked={look === option.id} onChange={() => void chooseLook(option.id)} className="sr-only" />
                  <span aria-hidden className="vp-look-swatch" data-swatch={option.id} />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <button type="button" onClick={toggleSound} aria-pressed={sound} aria-label="Sound effects" title={sound ? "Sound on" : "Sound off"} className="vp-icon-button">
              {sound ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
            </button>
          </div>
        </header>

        {revealing ? (
          <PlainReveal
            coins={outcome.coins}
            items={outcome.items}
            newItems={outcome.newItems}
            looks={looks}
            motion={motion}
            titleDelay={0}
            delay={reveal === "fresh" ? REVEAL_AT[motion] : 0}
            onContinue={() => {
              setReveal(null);
              requestAnimationFrame(() => headingRef.current?.focus());
            }}
          />
        ) : null}

        <div className="vp-window" data-tilt data-card="panel" hidden={revealing}>
          <div className="vp-window-bar">
            <p key={phase} className="vp-window-title">
              {TITLE[phase]}
            </p>
            <span className="vp-chip">
              <span aria-hidden className="vp-chip-dot" />
              {STATUS[phase]}
            </span>
          </div>
          <div className="vp-window-body">
            {outcome ? (
              <div key={round} className="vp-result">
                <h2 ref={headingRef} tabIndex={-1} className="vp-headline">
                  {HEADLINE[outcome.phase]}
                </h2>
                <p className="vp-copy">{copyFor(outcome)}</p>
                {outcome.phase === "granted" || outcome.phase === "already" ? (
                  <PlainSlots coins={outcome.coins} items={outcome.items} newItems={outcome.phase === "granted" ? outcome.newItems : undefined} delay={0} countUp={false} looks={looks} />
                ) : null}
              </div>
            ) : busy ? (
              <div className="vp-result">
                <div aria-hidden className="vp-progress" />
              </div>
            ) : null}

            {opened ? (
              <div className="vp-actions">
                {outcome?.phase === "granted" ? (
                  <button type="button" onClick={() => setReveal("again")} className="vp-button vp-button-quiet">
                    <Eye aria-hidden className="size-4" />
                    View rewards
                  </button>
                ) : null}
                <button type="button" onClick={again} className="vp-button">
                  <RotateCcw aria-hidden className="size-4" />
                  Enter another code
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="vp-form">
                <label htmlFor="vp-code" className="vp-label">
                  Code
                </label>
                <input
                  ref={inputRef}
                  id="vp-code"
                  name="vp-code"
                  value={code}
                  onChange={(event) => {
                    if (event.target.value.length > code.length) play("key");
                    setCode(event.target.value);
                  }}
                  readOnly={busy}
                  maxLength={80}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder="Enter your code"
                  aria-describedby="vp-code-help"
                  className="vp-input"
                />
                <p id="vp-code-help" className="vp-help">
                  Words, letters or numbers. Case and spacing don’t matter.
                </p>
                <div className="vp-actions">
                  <button type="submit" disabled={busy} className="vp-button" data-variant="primary">
                    {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <KeyRound aria-hidden className="size-4" />}
                    {busy ? "Verifying…" : outcome?.phase === "lost" ? "Try again" : "Redeem code"}
                  </button>
                  {outcome?.phase === "lost" ? (
                    <button type="button" onClick={checkLog} disabled={checking} className="vp-button vp-button-quiet">
                      {checking ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ScrollText aria-hidden className="size-4" />}
                      Check the log
                    </button>
                  ) : null}
                </div>
              </form>
            )}
          </div>
        </div>

        <section aria-labelledby="vp-log-title" className="vp-log">
          <div className="vp-log-head">
            <h2 id="vp-log-title" className="vp-log-title">
              Access log
            </h2>
            <span className="vp-log-count">{finds.length ? `${finds.length} ${finds.length === 1 ? "code" : "codes"} redeemed` : "No entries"}</span>
          </div>
          {finds.length ? (
            <ol className="vp-log-list">
              {finds.map((find, index) => (
                <li key={`${find.redeemedAt}-${index}`}>
                  <span suppressHydrationWarning className="vp-log-time">
                    {formatDate(find.redeemedAt)}
                  </span>
                  <span className="min-w-0">{rewardSummary(find.coins, find.items) || "Opened"}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="vp-log-note">No codes redeemed yet. Codes turn up in unexpected places.</p>
          )}
          <p className="vp-log-note">
            Badges, titles and decorations are worn from <Link href="/customization/profile">your profile</Link>; coins go to your{" "}
            <Link href="/shop">coin wallet</Link>.
          </p>
        </section>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </section>
    </PageContainer>
  );
}


/**
 * What a code granted, slot by slot, exactly as the server confirmed it. `newItems` marks which
 * items were new to the account; leave it out when that isn't known.
 */
function PlainSlots({ coins, items, newItems, delay, countUp, looks }: { coins: number; items: string[]; newItems?: string[]; delay: number; countUp: boolean; looks: VaultLooks }) {
  const wearable = items.some((id) => ["avatar_decoration", "badge", "title"].includes(rewardInfo(id).kind));
  const offset = coins > 0 ? 1 : 0;
  const slot = (index: number) => ({ "--i": index, "--d": `${delay}ms` }) as CSSProperties;
  return (
    <>
      <ul className="vp-rewards">
        {coins > 0 ? (
          <li className="vp-slot" style={slot(0)}>
            <span aria-hidden className="vp-slot-art">
              <CoinArt size="slot" />
            </span>
            <span className="min-w-0">
              <span className="vp-slot-kind">Coins</span>
              <span className="vp-slot-name vp-slot-coins">
                <CountUp value={coins} delay={delay} animate={countUp} />
              </span>
              <span className="vp-slot-desc">Added to your Arcade wallet.</span>
            </span>
          </li>
        ) : null}
        {items.map((id, index) => {
          const info = rewardInfo(id);
          return (
            <li key={id} className="vp-slot" style={slot(index + offset)}>
              <span aria-hidden className="vp-slot-art">
                <RewardArt id={id} size="slot" looks={looks} />
              </span>
              <span className="min-w-0">
                <span className="vp-slot-kind">{kindLabel(info)}</span>
                <span className="vp-slot-name">
                  {info.name}
                  {newItems ? <Tag fresh={newItems.includes(id)} achievement={info.kind === "achievement"} /> : null}
                </span>
                <span className="vp-slot-desc">{info.description}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {wearable || coins > 0 ? (
        <p className="vp-links" style={{ "--d": `${delay + (items.length + offset) * 120 + 200}ms` } as CSSProperties}>
          {wearable ? (
            <Link href="/customization/profile" className="vp-link">
              Wear it in your profile <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : null}
          {coins > 0 ? (
            <Link href="/shop" className="vp-link">
              Visit the shop <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : null}
        </p>
      ) : null}
    </>
  );
}

/**
 * The confirmed rewards as cards that fade in one after another. Each can be inspected up close;
 * Continue keeps the result on the panel. Only ever shown for a grant the server confirmed.
 */
function PlainReveal({
  coins,
  items,
  newItems,
  looks,
  motion,
  titleDelay,
  delay,
  onContinue,
}: {
  coins: number;
  items: string[];
  newItems?: string[];
  looks: VaultLooks;
  motion: MotionLevel;
  /** When the heading resolves, and when the cards appear. */
  titleDelay: number;
  delay: number;
  onContinue: () => void;
}) {
  const [inspecting, setInspecting] = useState<string | null>(null);
  // Once a card has been opened, don't replay the entrance on the way back.
  const [settled, setSettled] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const detail = useRef<HTMLHeadingElement>(null);
  const lastCard = useRef<string | null>(null);
  const rewards = [...(coins > 0 ? [COINS] : []), ...items];
  const total = rewards.length;

  useEffect(() => {
    if (inspecting) detail.current?.focus({ preventScroll: true });
    else if (lastCard.current) list.current?.querySelector<HTMLElement>(`[data-id="${lastCard.current}"]`)?.focus({ preventScroll: true });
    else heading.current?.focus({ preventScroll: true });
  }, [inspecting]);

  const close = () => setInspecting(null);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (inspecting) close();
    else onContinue();
  };

  const label = (id: string) => (id === COINS ? "Coins" : kindLabel(rewardInfo(id)));
  const name = (id: string) => (id === COINS ? `${coins.toLocaleString("en")} coins` : rewardInfo(id).name);
  const fresh = (id: string) => (id === COINS || !newItems ? null : newItems.includes(id));
  const shown = inspecting;
  const link = shown ? rewardLink(shown) : null;

  return (
    <section
      className="vp-reveal"
      aria-labelledby="vp-reveal-title"
      data-settled={settled || undefined}
      onKeyDown={onKeyDown}
      style={{ "--d": `${delay}ms`, "--stagger": `${CARD_STAGGER}ms` } as CSSProperties}
    >
      <header className="vp-reveal-head">
        <p className="vp-eyebrow">Code accepted</p>
        <h2 id="vp-reveal-title" ref={heading} tabIndex={-1} className="vp-headline">
          <DecodeText text={total === 1 ? "A reward recovered" : `${total} rewards recovered`} animate={motion === "full"} delay={titleDelay} />
        </h2>
        <p className="vp-reveal-sub">{shown ? "Up close." : "They’re on your account now. Choose one to look closer."}</p>
      </header>

      <ul ref={list} className="vp-cards" data-count={Math.min(total, 3)} hidden={shown !== null}>
        {rewards.map((id, index) => {
          const isNew = fresh(id);
          return (
            <li key={id} data-card style={{ "--i": index } as CSSProperties}>
              <button
                type="button"
                className="vp-card"
                data-id={id}
                onClick={() => {
                  lastCard.current = id;
                  setSettled(true);
                  setInspecting(id);
                }}
              >
                <span aria-hidden className="vp-card-art">
                  {id === COINS ? <CoinArt size="card" /> : <RewardArt id={id} size="card" looks={looks} />}
                </span>
                <span className="vp-card-kind">{label(id)}</span>
                <span className="vp-card-name">{id === COINS ? <CountUp value={coins} delay={delay + index * CARD_STAGGER} animate={motion !== "off"} /> : name(id)}</span>
                {isNew === null ? null : <Tag fresh={isNew} achievement={id.startsWith(ACHIEVEMENT_PREFIX)} />}
              </button>
            </li>
          );
        })}
      </ul>

      {shown && link ? (
        <div className="vp-inspect" role="group" aria-labelledby="vp-inspect-title">
          <div aria-hidden className="vp-inspect-art">
            {shown === COINS ? <CoinArt size="large" /> : <RewardArt id={shown} size="large" looks={looks} motion={motion} />}
          </div>
          <div className="vp-inspect-copy">
            <p className="vp-slot-kind">{label(shown)}</p>
            <h3 id="vp-inspect-title" ref={detail} tabIndex={-1} className="vp-inspect-name">
              {name(shown)}
            </h3>
            {fresh(shown) === null ? null : <Tag fresh={fresh(shown) === true} achievement={shown.startsWith(ACHIEVEMENT_PREFIX)} />}
            <p className="vp-slot-desc">{shown === COINS ? "Added to your Arcade wallet, ready for the shop." : rewardInfo(shown).description}</p>
            <Link href={link.href} className="vp-link">
              {link.label} <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </div>
        </div>
      ) : null}

      <div className="vp-actions">
        {shown ? (
          <button type="button" className="vp-button" onClick={close}>
            <ArrowLeft aria-hidden className="size-4" />
            All rewards
          </button>
        ) : null}
        <button type="button" className="vp-button" data-variant="primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </section>
  );
}
