"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { KeyRound, Loader2, RotateCcw, ScrollText, Volume2, VolumeX } from "lucide-react";
import { ArcadeProvider, useArcade } from "@/components/arcade/game-shell";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { MotionLevel } from "@/lib/preferences";
import { closeVaultAudio, playVaultSound, type VaultSound } from "./vault-audio";
import { DecodeText, RewardSlots, rewardSummary } from "./vault-reveal";
import { noise, VaultSeal, type SealMode } from "./vault-seal";

export type VaultFind = { redeemedAt: string; coins: number; items: string[] };

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
  idle: "Sealed",
  verifying: "Verifying",
  granted: "Open",
  already: "Claimed",
  invalid: "Denied",
  unavailable: "Dormant",
  locked: "Lockdown",
  lost: "No signal",
};
const TITLE: Record<Phase, string> = {
  idle: "Access request",
  verifying: "Verifying",
  granted: "Access granted",
  already: "Already claimed",
  invalid: "Access denied",
  unavailable: "Seal dormant",
  locked: "Lockdown",
  lost: "Signal lost",
};
const HEADLINE: Record<Outcome["phase"], string> = {
  granted: "Seal broken",
  already: "Already yours",
  invalid: "No seal answers",
  unavailable: "The seal is dormant",
  locked: "Access suspended",
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
/** The shortest verifying sequence. The request goes out at once; only showing its answer waits. */
const MIN_VERIFY: Record<MotionLevel, number> = { full: 900, subtle: 350, off: 0 };
/** When the headline decodes and the reward slots land, timed to the seal opening. */
const DECODE_AT: Record<MotionLevel, number> = { full: 350, subtle: 0, off: 0 };
const REVEAL_AT: Record<MotionLevel, number> = { full: 1350, subtle: 250, off: 0 };
const PIPS = Array.from({ length: 12 }, (_, index) => index);
const TRACE = ["Signal received", "Reading the seal", "Awaiting the chamber"];
const EMBERS = Array.from({ length: 14 }, (_, index) => ({
  "--x": `${(3 + noise(index, 11) * 94).toFixed(1)}%`,
  "--s": `${(1.5 + noise(index, 12) * 2.5).toFixed(1)}px`,
  "--d": `${(11 + noise(index, 13) * 9).toFixed(1)}s`,
  "--delay": `${(-noise(index, 14) * 19).toFixed(1)}s`,
  "--sway": `${Math.round((noise(index, 15) - 0.5) * 80)}px`,
  "--o": (0.3 + noise(index, 16) * 0.5).toFixed(2),
})) as CSSProperties[];
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
        : "The chamber yields. Everything inside is now yours.";
    case "already":
      return `Your account broke this seal on ${formatDate(outcome.redeemedAt)}. Its rewards are already yours; nothing new was added.`;
    case "invalid":
      return (outcome.message ?? "That code doesn’t open anything here. Check the words and try again.") + triesNote(outcome.triesLeft);
    case "unavailable":
      return "That code is real, but its seal no longer opens: it has expired, run out or been withdrawn." + triesNote(outcome.triesLeft);
    case "locked":
    case "lost":
      return outcome.message;
  }
}

function announce(outcome: Outcome) {
  const rewards = outcome.phase === "granted" || outcome.phase === "already" ? ` ${rewardSummary(outcome.coins, outcome.items, ", ")}.` : "";
  return `${TITLE[outcome.phase]}.${rewards} ${copyFor(outcome)}`;
}

/** The Vault: a sealed chamber that opens for secret codes. Codes are checked and rewards granted on the server only. */
export function SecretVault({ finds }: { finds: VaultFind[] }) {
  return (
    <ArcadeProvider>
      <Chamber initialFinds={finds} />
    </ArcadeProvider>
  );
}

function Chamber({ initialFinds }: { initialFinds: VaultFind[] }) {
  const router = useRouter();
  const { sound, toggleSound, effects: motion } = useArcade();
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [round, setRound] = useState(0);
  const [finds, setFinds] = useState(initialFinds);
  const [checking, setChecking] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const stageRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  /** After a lost answer: the newest find before it, so a later "already" for that code shows as its grant. */
  const lostSince = useRef<string | null | undefined>(undefined);
  const soundRef = useRef(sound);
  const busy = phase === "verifying";
  const signal = Math.min(PIPS.length, code.replace(/\s+/g, "").length);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // Effects pause offscreen; the synth is released on leave.
  useEffect(() => {
    const stage = stageRef.current!;
    const observer = new IntersectionObserver(([entry]) => stage.toggleAttribute("data-paused", !entry.isIntersecting));
    observer.observe(stage);
    return () => {
      observer.disconnect();
      closeVaultAudio();
    };
  }, []);

  useEffect(() => {
    if (!outcome) return;
    if (outcome.phase === "invalid" || outcome.phase === "unavailable") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else headingRef.current?.focus();
  }, [outcome]);

  const play = (name: VaultSound) => {
    if (soundRef.current) playVaultSound(name);
  };

  function show(next: Outcome, audible = true) {
    setOutcome(next);
    setPhase(next.phase);
    setRound((value) => value + 1);
    setAnnouncement(announce(next));
    if (audible) play(SOUND[next.phase]);
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
      const result = await apiFetch<Redemption>("/api/vault/redeem", { method: "POST", json: { code } });
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
      show({ phase: "granted", coins: found.coins, items: found.items, recovered: true });
      router.refresh();
    } else show({ phase: "lost", since, message: "Nothing new reached your log, so that attempt granted nothing. Enter the code again whenever you’re ready." });
  }

  function again() {
    setOutcome(null);
    setPhase("idle");
    setAnnouncement("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const sealMode: SealMode = busy ? "verifying" : phase === "granted" || phase === "already" ? "align" : phase === "unavailable" || phase === "locked" ? "still" : "idle";
  const opened = phase === "granted" || phase === "already";

  return (
    <section
      ref={stageRef}
      aria-labelledby="vx-title"
      className="vx-stage"
      data-phase={phase}
      data-motion={motion}
      style={{ "--vx-charge": (signal / PIPS.length).toFixed(3) } as CSSProperties}
    >
      <div aria-hidden className="vx-backdrop">
        <div className="vx-fog" />
        <div className="vx-floor" />
        {motion === "full" ? (
          <div className="vx-embers">
            {EMBERS.map((style, index) => (
              <span key={index} style={style} />
            ))}
          </div>
        ) : null}
        <div className="vx-vignette" />
      </div>
      <div aria-hidden className="vx-frame">
        <span />
        <span />
        <span />
        <span />
      </div>
      <span aria-hidden className="vx-boot" />

      <div className="vx-inner">
        <header className="vx-hud">
          <div className="min-w-0">
            <p className="vx-eyebrow">System · Sealed chamber</p>
            <h1 id="vx-title" className="vx-title">
              The Vault
            </h1>
          </div>
          <div className="vx-hud-side">
            <span className="vx-chip">{STATUS[phase]}</span>
            <button type="button" onClick={toggleSound} aria-pressed={sound} aria-label="Sound effects" title={sound ? "Sound on" : "Sound off"} className="vx-icon-button">
              {sound ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
            </button>
          </div>
        </header>

        <div className="vx-main">
          <VaultSeal mode={sealMode} level={signal} phase={phase} motion={motion} />

          <div className="vx-window">
            <span aria-hidden className="vx-corners" />
            <span aria-hidden className="vx-window-flare" />
            <div className="vx-window-bar">
              <p key={phase} className="vx-window-title">
                <span aria-hidden className="vx-glyph" />
                {TITLE[phase]}
              </p>
            </div>
            <div aria-hidden className="vx-rule" />
            <div className="vx-window-body">
              {outcome ? (
                <div key={round} className="vx-result">
                  <h2 ref={headingRef} tabIndex={-1} className="vx-headline">
                    {outcome.phase === "granted" || outcome.phase === "already" ? (
                      <DecodeText text={HEADLINE[outcome.phase]} animate={motion !== "off"} delay={outcome.phase === "granted" ? DECODE_AT[motion] : 0} />
                    ) : (
                      HEADLINE[outcome.phase]
                    )}
                  </h2>
                  <p className="vx-copy">{copyFor(outcome)}</p>
                  {outcome.phase === "granted" ? (
                    <RewardSlots coins={outcome.coins} items={outcome.items} newItems={outcome.newItems} delay={REVEAL_AT[motion]} countUp={motion !== "off"} />
                  ) : outcome.phase === "already" ? (
                    <RewardSlots coins={outcome.coins} items={outcome.items} delay={motion === "full" ? 250 : 0} countUp={false} />
                  ) : null}
                </div>
              ) : busy ? (
                <div className="vx-result">
                  <ol aria-hidden className="vx-trace">
                    {TRACE.map((line, index) => (
                      <li key={line} style={{ "--i": index } as CSSProperties}>
                        {line}
                      </li>
                    ))}
                  </ol>
                  <div aria-hidden className="vx-progress" />
                </div>
              ) : (
                <p className="vx-lede">A sealed chamber that answers only to the right words. Speak a code to break its seal.</p>
              )}

              {opened ? (
                <div className="vx-actions">
                  <button type="button" onClick={again} className="vx-button">
                    <RotateCcw aria-hidden className="size-4" />
                    Enter another code
                  </button>
                </div>
              ) : (
                <form onSubmit={submit} className="vx-form">
                  <label htmlFor="vx-code" className="vx-label">
                    Code
                  </label>
                  <input
                    ref={inputRef}
                    id="vx-code"
                    name="vx-code"
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
                    placeholder="Speak the code"
                    aria-describedby="vx-code-help"
                    className="vx-input"
                  />
                  <div aria-hidden className="vx-signal">
                    <span className="vx-pips">
                      {PIPS.map((index) => (
                        <span key={index} data-on={index < signal ? "" : undefined} style={{ "--i": index } as CSSProperties} />
                      ))}
                    </span>
                    <span className="vx-signal-count">{String(signal).padStart(2, "0")}</span>
                  </div>
                  <p id="vx-code-help" className="vx-help">
                    Words, or letters and numbers. Letter case and extra spaces don’t matter, and each code opens once per account.
                  </p>
                  <div className="vx-actions">
                    <button type="submit" disabled={busy} className="vx-button">
                      {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <KeyRound aria-hidden className="size-4" />}
                      {busy ? "Verifying…" : outcome?.phase === "lost" ? "Try again" : "Break the seal"}
                    </button>
                    {outcome?.phase === "lost" ? (
                      <button type="button" onClick={checkLog} disabled={checking} className="vx-button vx-button-quiet">
                        {checking ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ScrollText aria-hidden className="size-4" />}
                        Check the log
                      </button>
                    ) : null}
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        <section aria-labelledby="vx-log-title" className="vx-log">
          <div className="vx-log-head">
            <h2 id="vx-log-title" className="vx-log-title">
              Access log
            </h2>
            <span className="vx-log-count">{finds.length ? `${finds.length} ${finds.length === 1 ? "seal" : "seals"} broken` : "No entries"}</span>
          </div>
          {finds.length ? (
            <ol className="vx-log-list">
              {finds.map((find, index) => (
                <li key={`${find.redeemedAt}-${index}`}>
                  <span suppressHydrationWarning className="vx-log-time">
                    {formatDate(find.redeemedAt)}
                  </span>
                  <span className="min-w-0">{rewardSummary(find.coins, find.items) || "Opened"}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="vx-log-note">No seals broken yet. Codes turn up in unexpected places.</p>
          )}
          <p className="vx-log-note">
            Badges, titles and decorations are worn from <Link href="/customization/profile">your profile</Link>; coins go to your{" "}
            <Link href="/arcade/shop">Arcade wallet</Link>.
          </p>
        </section>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
