"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Eye, FastForward, KeyRound, Loader2, RotateCcw, ScrollText, Volume2, VolumeX } from "lucide-react";
import { ArcadeProvider, useArcade } from "@/components/arcade/game-shell";
import { webglAvailable } from "@/components/showcase/motion";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { MotionLevel } from "@/lib/preferences";
import { SUMMON, UNLOCK, type SummonKind } from "./timing";
import { closeVaultAudio, hushVault, playVaultReveal, playVaultSound, playVaultSummon, setVaultAmbience, type VaultSound } from "./vault-audio";
import { DecodeText, RewardReveal, RewardSlots, rewardSummary, type RevealOrigin, type VaultLooks, type VaultProfile, type VaultSamples } from "./vault-reveal";
import type { VaultSceneHandle } from "./vault-scene";
import { noise, VaultSeal, type SealMode } from "./vault-seal";

// The 3D vault (and three.js with it) loads only here, after the page is already usable.
const VaultScene = lazy(() => import("./vault-scene"));

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
/** How long the panel holds "Seal broken" while the vault opens, before the cards take over. */
const HANDOFF: Record<MotionLevel, number> = { full: UNLOCK.handoff, subtle: 0, off: 0 };
const PIPS = Array.from({ length: 12 }, (_, index) => index);
const TRACE = ["Signal received", "Reading the seal", "Awaiting the chamber"];
const OPENING = ["Seal accepted", "Releasing the locks"];
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

/** The full summon plays once per browsing session; later visits get the short one. */
const SUMMONED_KEY = "archive:vault:summoned";
function summonKind(motion: MotionLevel): SummonKind {
  try {
    const seen = sessionStorage.getItem(SUMMONED_KEY) !== null;
    sessionStorage.setItem(SUMMONED_KEY, "1");
    return seen || motion === "subtle" ? "short" : "full";
  } catch {
    // No storage: keep it brief rather than replaying the full sequence on every visit.
    return "short";
  }
}

const noSubscribe = () => () => {};

/** A failed scene chunk (offline, blocked) leaves the drawn seal in place instead of breaking the page. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
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
export function SecretVault({ finds, profile, samples }: { finds: VaultFind[]; profile: VaultProfile; samples: VaultSamples }) {
  return (
    <ArcadeProvider>
      <Chamber initialFinds={finds} looks={{ profile, samples }} />
    </ArcadeProvider>
  );
}

type SceneStatus = "loading" | "ready" | "failed";
/** dark: before the first frame; summon: the entrance; done: at rest. */
type Intro = "dark" | "summon" | "done";

function Chamber({ initialFinds, looks }: { initialFinds: VaultFind[]; looks: VaultLooks }) {
  const router = useRouter();
  const { sound, toggleSound, effects: motion } = useArcade();
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [round, setRound] = useState(0);
  const [finds, setFinds] = useState(initialFinds);
  const [checking, setChecking] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [pulse, setPulse] = useState(0);
  /** The reward cards: "fresh" right after a grant, "again" when reopened from the panel. */
  const [reveal, setReveal] = useState<"fresh" | "again" | null>(null);
  const [sceneStatus, setSceneStatus] = useState<SceneStatus>("loading");
  const [intro, setIntro] = useState<Intro>("dark");
  const [introAt, setIntroAt] = useState(0);
  const [summon, setSummon] = useState<SummonKind>("full");
  /** The vault is opening: the panel holds its headline until the cards take over. */
  const [opening, setOpening] = useState(false);
  const [present, setPresent] = useState(true);
  const stageRef = useRef<HTMLElement>(null);
  const artifactRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<VaultSceneHandle>(null);
  const introTimer = useRef(0);
  const openTimer = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  /** After a lost answer: the newest find before it, so a later "already" for that code shows as its grant. */
  const lostSince = useRef<string | null | undefined>(undefined);
  // One id per attempt. Retrying the same code after a lost answer reuses it, so the vault answers
  // with what that attempt granted instead of granting a repeatable code again.
  const attempt = useRef<{ code: string; request: string } | null>(null);
  const soundRef = useRef(sound);
  const busy = phase === "verifying";
  const signal = Math.min(PIPS.length, code.replace(/\s+/g, "").length);
  const canWebgl = useSyncExternalStore(noSubscribe, webglAvailable, () => false);
  const scene: SceneStatus = canWebgl ? sceneStatus : "failed";
  // Reduced motion goes straight to the vault at rest.
  const introShown: Intro = motion === "off" ? "done" : intro;
  const timeline = SUMMON[summon];

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // Effects pause offscreen and in background tabs; the synth is released on leave.
  useEffect(() => {
    const stage = stageRef.current!;
    let seen = true;
    const update = () => setPresent(seen && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      seen = entry.isIntersecting;
      stage.toggleAttribute("data-paused", !seen);
      update();
    });
    observer.observe(stage);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      clearTimeout(introTimer.current);
      clearTimeout(openTimer.current);
      closeVaultAudio();
    };
  }, []);

  // A quiet bed of sound under the vault at rest, only while it's on screen and sound is on.
  useEffect(() => {
    if (!sound) hushVault();
    setVaultAmbience(sound && present && introShown === "done");
  }, [sound, present, introShown]);

  // The entrance starts on the first frame; the 3D vault joins it wherever it is once loaded.
  const beginSummon = useEffectEvent(() => {
    if (motion === "off") {
      setIntro("done");
      return;
    }
    const kind = summonKind(motion);
    setSummon(kind);
    setIntroAt(performance.now());
    setIntro("summon");
    if (sound) playVaultSummon(kind);
    introTimer.current = window.setTimeout(() => setIntro("done"), SUMMON[kind].total);
  });
  useEffect(() => {
    if (intro !== "dark") return;
    const frame = requestAnimationFrame(() => beginSummon());
    return () => cancelAnimationFrame(frame);
  }, [intro]);

  function skipIntro(focusInput: boolean) {
    clearTimeout(introTimer.current);
    hushVault();
    sceneRef.current?.skip();
    // Synchronously, so a key that skipped can land in the field it reveals.
    flushSync(() => setIntro("done"));
    if (focusInput) inputRef.current?.focus({ preventScroll: true });
  }

  // Any key or press skips the entrance; typing goes straight into the code field.
  const onIntroInput = useEffectEvent((event: KeyboardEvent | PointerEvent) => {
    if (!(event instanceof KeyboardEvent)) return skipIntro(false);
    if (event.ctrlKey || event.metaKey || event.altKey || ["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(event.key)) return;
    const target = event.target as HTMLElement | null;
    const typingElsewhere = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (!typingElsewhere && ["Escape", "Enter", " "].includes(event.key)) event.preventDefault();
    skipIntro(!typingElsewhere && event.key !== "Tab");
  });
  useEffect(() => {
    if (introShown === "done") return;
    const onKey = (event: KeyboardEvent) => onIntroInput(event);
    const onPointer = (event: PointerEvent) => onIntroInput(event);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [introShown]);

  const sceneReady = () => setSceneStatus("ready");
  const sceneFailed = () => setSceneStatus("failed");

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
    setReveal(next.phase === "granted" ? "fresh" : null);
    // A grant opens the vault first; the cards take over once its doors are moving.
    clearTimeout(openTimer.current);
    const handoff = next.phase === "granted" ? HANDOFF[motion] : 0;
    setOpening(handoff > 0);
    if (handoff) openTimer.current = window.setTimeout(() => setOpening(false), handoff);
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
      // The answer matters more than the entrance.
      skipIntro(false);
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
    const request = attempt.current?.code === code ? attempt.current.request : crypto.randomUUID();
    attempt.current = { code, request };
    try {
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

  const sealMode: SealMode = busy ? "verifying" : phase === "granted" || phase === "already" ? "align" : phase === "unavailable" || phase === "locked" ? "still" : "idle";
  const opened = phase === "granted" || phase === "already";
  const revealing = outcome?.phase === "granted" && reveal !== null && !opening;
  // The drawn seal stands in if WebGL fails, or if the 3D vault is still loading once the entrance is over.
  const drawnSeal = scene === "failed" || (scene === "loading" && introShown === "done");

  /** The cards fly out of the 3D core when it's there, else out of the drawn seal. */
  const revealOrigin = (): RevealOrigin => {
    const core = scene === "ready" ? sceneRef.current?.origin() : null;
    if (core) return core;
    const box = artifactRef.current?.getBoundingClientRect();
    const x = box ? box.left + box.width / 2 : window.innerWidth / 2;
    const y = box ? box.top + box.height / 2 : window.innerHeight / 3;
    return { x, y, z: -1400, perspective: 1000, axisX: x, axisY: y };
  };

  return (
    <section
      ref={stageRef}
      aria-labelledby="vx-title"
      className="vx-stage"
      data-phase={phase}
      data-motion={motion}
      data-intro={introShown}
      data-summon={summon}
      data-scene={scene}
      style={
        {
          "--vx-charge": (signal / PIPS.length).toFixed(3),
          "--vx-hud-at": `${timeline.hud}ms`,
          "--vx-panel-at": `${timeline.panel}ms`,
          "--vx-settle-at": `${timeline.settle}ms`,
        } as CSSProperties
      }
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
      {canWebgl && sceneStatus !== "failed" ? (
        <SceneBoundary onError={sceneFailed}>
          <Suspense fallback={null}>
            <VaultScene
              ref={sceneRef}
              artifact={artifactRef}
              panel={panelRef}
              phase={phase}
              round={round}
              charge={signal / PIPS.length}
              pulse={pulse}
              motion={motion}
              revealing={revealing}
              introKind={summon}
              introAt={introAt}
              introDone={introShown === "done"}
              onReady={sceneReady}
              onFail={sceneFailed}
            />
          </Suspense>
        </SceneBoundary>
      ) : null}

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
          <div ref={artifactRef} className="vx-artifact">
            {drawnSeal ? <VaultSeal mode={sealMode} level={signal} phase={phase} motion={motion} /> : null}
          </div>

          {revealing ? (
            <RewardReveal
              coins={outcome.coins}
              items={outcome.items}
              newItems={outcome.newItems}
              looks={looks}
              motion={motion}
              origin={revealOrigin}
              titleDelay={reveal === "fresh" ? Math.max(0, DECODE_AT[motion] - HANDOFF[motion]) : 0}
              delay={reveal === "fresh" ? REVEAL_AT[motion] - HANDOFF[motion] : 0}
              onContinue={() => {
                setReveal(null);
                requestAnimationFrame(() => headingRef.current?.focus());
              }}
            />
          ) : null}

          {/* The console's screen: the 3D scene builds its body around this panel and keeps the two registered. */}
          <div ref={panelRef} className="vx-window" hidden={revealing}>
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
              {outcome && opening ? (
                <div className="vx-result">
                  <h2 ref={headingRef} tabIndex={-1} className="vx-headline">
                    {HEADLINE.granted}
                  </h2>
                  <ol aria-hidden className="vx-trace" data-done="">
                    {OPENING.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                  <div aria-hidden className="vx-progress" data-done="" />
                </div>
              ) : outcome ? (
                <div key={round} className="vx-result">
                  <h2 ref={headingRef} tabIndex={-1} className="vx-headline">
                    {outcome.phase === "already" ? <DecodeText text={HEADLINE.already} animate={motion !== "off"} /> : HEADLINE[outcome.phase]}
                  </h2>
                  <p className="vx-copy">{copyFor(outcome)}</p>
                  {outcome.phase === "granted" ? (
                    <RewardSlots coins={outcome.coins} items={outcome.items} newItems={outcome.newItems} delay={0} countUp={false} looks={looks} />
                  ) : outcome.phase === "already" ? (
                    <RewardSlots coins={outcome.coins} items={outcome.items} delay={motion === "full" ? 250 : 0} countUp={false} looks={looks} />
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
              ) : null}

              {opening ? null : opened ? (
                <div className="vx-actions">
                  {outcome?.phase === "granted" ? (
                    <button type="button" onClick={() => setReveal("again")} className="vx-button vx-button-quiet">
                      <Eye aria-hidden className="size-4" />
                      View rewards
                    </button>
                  ) : null}
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
                      if (event.target.value.length > code.length) {
                        play("key");
                        setPulse((value) => value + 1);
                      }
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
                    Words, letters or numbers. Case and spacing don’t matter.
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
      {introShown === "done" ? null : (
        <button type="button" onClick={() => skipIntro(true)} className="vx-skip">
          <FastForward aria-hidden className="size-3.5" />
          Skip intro
        </button>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
