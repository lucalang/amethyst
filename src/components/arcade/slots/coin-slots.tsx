"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Coins, Loader2, Minus, Plus, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { ArcadeProvider, useArcade } from "@/components/arcade/game-shell";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { winningRule, type SlotMachine, type SlotOdds, type SlotSpin, type SlotSpinResult } from "@/lib/slots";
import { cn } from "@/lib/utils";
import { closeSlotAudio, playSlotSound, type SlotSound } from "./slot-audio";
import { SlotSymbol, symbolName } from "./symbols";
import "./slots.css";

export type SlotStatus = { balance: number };
export type SlotHistoryRow = { id: string; bet: number; symbols: string[]; payout: number; createdAt: string };
type Props = { machine: SlotMachine; odds: SlotOdds; status: SlotStatus; history: SlotHistoryRow[] };
type Shown = SlotSpin & { replay: boolean; recovered?: boolean };
type Pending = { id: string; bet: number };
type Tier = "small" | "win" | "big" | "mega" | "jackpot";

const PENDING_KEY = "archive:slots:pending";
/** Where each reel starts before the first spin (decorative only). */
const START = [0, 7, 13];
const mod = (value: number, n: number) => ((value % n) + n) % n;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const fmt = (value: number) => value.toLocaleString("en");
const signed = (value: number) => (value > 0 ? `+${fmt(value)}` : value < 0 ? `−${fmt(Math.abs(value))}` : "±0");
const coins = (value: number) => `${fmt(value)} coin${value === 1 ? "" : "s"}`;
/** Win tiers by multiplier, so rarer lines celebrate harder (current paytable: ×3 small, ×8–16 win, ×20 big, ×40 mega, top line jackpot). */
const tierOf = (multiplier: number, top: number): Tier | null =>
  multiplier <= 0 ? null : multiplier >= top ? "jackpot" : multiplier >= 40 ? "mega" : multiplier >= 20 ? "big" : multiplier >= 8 ? "win" : "small";
const TIER_LABEL: Record<Tier, string> = { small: "Win", win: "Nice win", big: "Big win", mega: "Mega win", jackpot: "Jackpot" };
/** Big wins and up flash and shake the cabinet. */
const isBig = (tier: Tier | null) => tier === "big" || tier === "mega" || tier === "jackpot";
/** Coin and gem bursts per tier; mega wins and jackpots add sparks and a second wave raining from above. */
const BURST: Record<Tier, { count: number; power: number; life: number; sparks: number; rain: number; ribbons: number; waves: number }> = {
  small: { count: 16, power: 0.85, life: 1200, sparks: 0, rain: 0, ribbons: 0, waves: 1 },
  win: { count: 40, power: 1, life: 1700, sparks: 12, rain: 0, ribbons: 0, waves: 1 },
  big: { count: 100, power: 1.3, life: 2900, sparks: 30, rain: 24, ribbons: 40, waves: 1 },
  mega: { count: 140, power: 1.45, life: 3800, sparks: 60, rain: 70, ribbons: 80, waves: 2 },
  jackpot: { count: 180, power: 1.6, life: 5600, sparks: 100, rain: 150, ribbons: 140, waves: 3 },
};
/** Big wins and up take over the cabinet: how long that stays and how long its payout counts up. */
const PARTY: Record<Tier, { stay: number; count: number }> = {
  small: { stay: 0, count: 0 },
  win: { stay: 0, count: 0 },
  big: { stay: 3400, count: 1700 },
  mega: { stay: 4600, count: 2600 },
  jackpot: { stay: 6500, count: 3800 },
};
const RIBBONS = ["#a57cff", "#f472a8", "#fde68a", "#67e8f9", "#f0abfc"];

/** The first two reels match a symbol whose three of a kind pays, and the third doesn't. */
const nearMiss = (machine: SlotMachine, symbols: string[]) =>
  symbols[0] === symbols[1] && symbols[2] !== symbols[0] && machine.paytable.some((rule) => rule.symbol === symbols[0] && rule.count === 3);

type Part = { x: number; y: number; vx: number; vy: number; r: number; spin: number; kind: "coin" | "gem" | "spark" | "ribbon"; delay: number; color: string };

/** The particles for one win burst: coins and gems from the reels, plus rain from above and sparks for rarer tiers. */
function makeParts(tier: Tier, width: number, height: number): Part[] {
  const { count, power, life, sparks, rain, ribbons, waves } = BURST[tier];
  const cy = height * 0.62;
  const parts: Part[] = [];
  // Rarer wins fire the fountain again (waves), rain coins from above and throw confetti.
  for (let w = 0; w < waves; w += 1) {
    for (let i = 0; i < count; i += 1) {
      parts.push({
        x: width / 2 + (Math.random() - 0.5) * width * 0.6,
        y: cy,
        vx: (Math.random() - 0.5) * 420 * power,
        vy: (-260 - Math.random() * 380) * power,
        r: 4 + Math.random() * 5,
        spin: Math.random() * Math.PI,
        kind: i % 3 === 0 ? "gem" : "coin",
        delay: w * 650,
        color: "",
      });
    }
  }
  for (let i = 0; i < rain; i += 1) {
    parts.push({
      x: Math.random() * width,
      y: -12,
      vx: (Math.random() - 0.5) * 60,
      vy: 40 + Math.random() * 120,
      r: 4 + Math.random() * 6,
      spin: Math.random() * Math.PI,
      kind: i % 4 === 0 ? "gem" : "coin",
      delay: 300 + Math.random() * life * 0.45,
      color: "",
    });
  }
  for (let i = 0; i < sparks; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (180 + Math.random() * 520) * power;
    const wave = Math.floor(Math.random() * waves) * 650;
    parts.push({ x: width / 2, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 1.5 + Math.random() * 2, spin: 0, kind: "spark", delay: wave + Math.random() * 240, color: "" });
  }
  for (let i = 0; i < ribbons; i += 1) {
    parts.push({
      x: Math.random() * width,
      y: -20 - Math.random() * height * 0.3,
      vx: (Math.random() - 0.5) * 80,
      vy: 60 + Math.random() * 90,
      r: 5 + Math.random() * 4,
      spin: Math.random() * Math.PI * 2,
      kind: "ribbon",
      delay: 150 + Math.random() * life * 0.35,
      color: RIBBONS[i % RIBBONS.length],
    });
  }
  return parts;
}

function readPending(): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
    return value && typeof value.id === "string" && Number.isInteger(value.bet) ? value : null;
  } catch {
    return null;
  }
}

export function CoinSlots(props: Props) {
  return (
    <ArcadeProvider>
      <Machine {...props} />
    </ArcadeProvider>
  );
}

function Machine({ machine, odds, status: initialStatus, history: initialHistory }: Props) {
  const router = useRouter();
  const { sound, toggleSound, effects } = useArcade();
  const [live, setLive] = useState<SlotStatus | null>(null);
  const status = live ?? initialStatus;
  const [history, setHistory] = useState(initialHistory);
  const [bet, setBet] = useState(machine.bets[0]);
  const [phase, setPhase] = useState<"idle" | "spinning" | "shown" | "pending">("idle");
  const [shown, setShown] = useState<Shown | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const cabinet = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strips = useRef<(HTMLDivElement | null)[]>([]);
  const pos = useRef([...START]);
  const spinFrame = useRef(0);
  const onscreen = useRef(true);
  const soundRef = useRef(sound);
  const effectsRef = useRef(effects);
  const lastTick = useRef(0);
  const [tease, setTease] = useState(false);
  /** How many reels from the left have landed on the same symbol (lit while the rest still spin). */
  const [matched, setMatched] = useState(0);
  /** The spin whose big-win takeover is showing. */
  const [party, setParty] = useState<string | null>(null);
  const partyTimer = useRef(0);
  const L = machine.reels.map((reel) => reel.length);
  const busy = phase === "spinning";

  useEffect(() => {
    soundRef.current = sound;
    effectsRef.current = effects;
  }, [sound, effects]);

  const play = (name: SlotSound, value?: number) => {
    if (soundRef.current) playSlotSound(name, value);
  };

  // Decorative lights pause offscreen; audio is released on leave.
  useEffect(() => {
    const node = cabinet.current!;
    const observer = new IntersectionObserver(([entry]) => {
      onscreen.current = entry.isIntersecting;
      node.toggleAttribute("data-paused", !entry.isIntersecting);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(spinFrame.current);
      window.clearTimeout(partyTimer.current);
      closeSlotAudio();
    };
  }, []);

  function place(index: number, value: number) {
    pos.current[index] = value;
    strips.current[index]?.style.setProperty("--f", mod(value, L[index]).toFixed(4));
  }

  /** Moves a spinning reel and clicks as symbols pass the payline (throttled so three reels never buzz). */
  function roll(index: number, value: number, now: number) {
    const before = Math.floor(pos.current[index]);
    place(index, value);
    if (Math.floor(value) !== before && now - lastTick.current > 45) {
      lastTick.current = now;
      play("tick");
    }
  }

  /** Reels spin freely until `stopReels` is called. */
  function startReels() {
    if (effectsRef.current === "off") return;
    cancelAnimationFrame(spinFrame.current);
    const top = effectsRef.current === "full" ? 18 : 9;
    let last = 0;
    let speed = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      speed = Math.min(top, speed + top * dt * 5);
      for (let i = 0; i < 3; i += 1) roll(i, pos.current[i] - speed * dt, now);
      spinFrame.current = requestAnimationFrame(tick);
    };
    spinFrame.current = requestAnimationFrame(tick);
  }

  /**
   * Lands every reel on its stop, left to right. When the first two reels show the same symbol and
   * three of it would pay, the last reel spins on a little longer under a riser. That depends only
   * on what is already visible, never on where the last reel lands.
   */
  function stopReels(stops: number[]) {
    cancelAnimationFrame(spinFrame.current);
    if (effectsRef.current === "off") {
      stops.forEach((stop, i) => place(i, stop));
      play("stop");
      return Promise.resolve();
    }
    const full = effectsRef.current === "full";
    const stagger = full ? 320 : 180;
    const duration = full ? 520 : 300;
    const speed = full ? 18 : 9;
    const hold = full ? 1100 : 550;
    const [first, second] = stops.map((stop, i) => machine.reels[i][stop]);
    const teasing = first === second && machine.paytable.some((rule) => rule.symbol === first && rule.count === 3);
    const begins = [0, stagger, teasing ? stagger + duration + hold : stagger * 2];
    const lengths = [duration, duration, teasing ? duration * 1.8 : duration];
    return new Promise<void>((resolve) => {
      const plan = stops.map(() => ({ from: 0, to: 0, begun: false, done: false }));
      const start = performance.now();
      let last = start;
      const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        plan.forEach((reel, i) => {
          if (reel.done) return;
          const begin = start + begins[i];
          if (now < begin) {
            roll(i, pos.current[i] - speed * dt, now);
            return;
          }
          if (!reel.begun) {
            reel.begun = true;
            reel.from = pos.current[i];
            const base = reel.from - (teasing && i === 2 ? 6 : 3);
            reel.to = base - mod(mod(base, L[i]) - stops[i], L[i]);
          }
          const t = Math.min(1, (now - begin) / lengths[i]);
          // Ease out with a small settle; no lingering or creeping past symbols.
          const c = full ? 1.2 : 0;
          const eased = 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
          roll(i, reel.from + (reel.to - reel.from) * eased, now);
          if (t >= 1) {
            reel.done = true;
            place(i, stops[i]);
            play("stop", i);
            const symbol = machine.reels[i][stops[i]];
            if (i > 0 && stops.slice(0, i).every((stop, j) => machine.reels[j][stop] === symbol)) {
              play("match", i);
              setMatched(i + 1);
            }
            if (teasing && i === 1) {
              setTease(true);
              play("tease", (hold + lengths[2]) / 1000);
            }
          }
        });
        if (plan.every((reel) => reel.done)) {
          setTease(false);
          resolve();
        }
        else spinFrame.current = requestAnimationFrame(tick);
      };
      spinFrame.current = requestAnimationFrame(tick);
    });
  }

  function haltReels() {
    cancelAnimationFrame(spinFrame.current);
    setTease(false);
    setMatched(0);
    for (let i = 0; i < 3; i += 1) place(i, Math.round(pos.current[i]));
  }

  /** Coins and gems bursting out of the reels; bigger tiers throw more, higher and longer. */
  function burst(tier: Tier) {
    const node = canvas.current;
    const context = node?.getContext("2d");
    if (!node || !context || effectsRef.current !== "full" || !onscreen.current) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const { width, height } = node.getBoundingClientRect();
    node.width = width * ratio;
    node.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const { life } = BURST[tier];
    const parts = makeParts(tier, width, height);
    let start = 0;
    let last = 0;
    const tick = (now: number) => {
      start ||= now;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const elapsed = now - start;
      context.clearRect(0, 0, width, height);
      if (elapsed >= life || !onscreen.current) return;
      const fade = Math.min(1, (1 - elapsed / life) * 2);
      for (const p of parts) {
        if (elapsed < p.delay) continue;
        if (p.kind === "spark") {
          const drag = Math.max(0, 1 - 2.8 * dt);
          p.vx *= drag;
          p.vy = p.vy * drag + 160 * dt;
        } else if (p.kind === "ribbon") {
          p.vy = Math.min(150, p.vy + 90 * dt);
          p.vx += Math.sin(elapsed / 260 + p.spin) * 40 * dt;
        } else p.vy += 620 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.spin += dt * 6;
        context.save();
        context.translate(p.x, p.y);
        if (p.kind === "spark") {
          context.globalAlpha = fade * Math.max(0, 1 - (elapsed - p.delay) / 900);
          context.fillStyle = "rgba(253, 230, 138, 0.35)";
          context.beginPath();
          context.arc(0, 0, p.r * 3, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "#fff7d6";
          context.beginPath();
          context.arc(0, 0, p.r, 0, Math.PI * 2);
          context.fill();
        } else if (p.kind === "ribbon") {
          context.globalAlpha = fade;
          context.rotate(p.spin);
          context.scale(1, Math.cos(p.spin * 2.2));
          context.fillStyle = p.color;
          context.fillRect(-p.r / 2, -p.r, p.r, p.r * 2);
        } else if (p.kind === "gem") {
          context.globalAlpha = fade;
          context.rotate(p.spin);
          context.fillStyle = "#a78bfa";
          context.beginPath();
          context.moveTo(0, -p.r);
          context.lineTo(p.r * 0.7, 0);
          context.lineTo(0, p.r);
          context.lineTo(-p.r * 0.7, 0);
          context.fill();
        } else {
          context.globalAlpha = fade;
          context.rotate(p.spin);
          context.scale(Math.abs(Math.cos(p.spin)) + 0.15, 1);
          context.fillStyle = "#fbbf24";
          context.beginPath();
          context.arc(0, 0, p.r, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "#fde68a";
          context.beginPath();
          context.arc(-p.r * 0.25, -p.r * 0.25, p.r * 0.4, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** A short cabinet shake for big wins and up, harder and longer the rarer the tier (Full effects only). */
  function shake(tier: Tier) {
    if (!isBig(tier) || effectsRef.current !== "full") return;
    const amount = tier === "jackpot" ? 9 : tier === "mega" ? 6 : 4;
    cabinet.current?.animate(
      [{ translate: "0 0" }, { translate: `${-amount}px 0` }, { translate: `${amount}px 0` }, { translate: `${-amount / 2}px 0` }, { translate: "0 0" }],
      { duration: tier === "jackpot" ? 700 : tier === "mega" ? 560 : 450, easing: "ease-out", iterations: tier === "jackpot" ? 2 : 1 },
    );
  }

  function addHistory(spin: SlotSpin) {
    setHistory((list) =>
      list.some((row) => row.id === spin.spinId)
        ? list
        : [{ id: spin.spinId, bet: spin.bet, symbols: spin.symbols, payout: spin.payout, createdAt: spin.createdAt }, ...list].slice(0, 10),
    );
  }

  function reveal(spin: Shown) {
    setShown(spin);
    setPhase("shown");
    const tier = tierOf(spin.multiplier, odds.topPays);
    if (spin.recovered) return;
    if (!tier) {
      play(nearMiss(machine, spin.symbols) ? "close" : "lose");
      return;
    }
    play(tier);
    burst(tier);
    shake(tier);
    if (isBig(tier) && effectsRef.current !== "off") {
      play("sweep");
      setParty(spin.spinId);
      window.clearTimeout(partyTimer.current);
      partyTimer.current = window.setTimeout(() => setParty(null), PARTY[tier].stay);
    }
  }

  async function run(next: Pending) {
    setMessage(null);
    setShown(null);
    setPending(null);
    setMatched(0);
    setParty(null);
    window.clearTimeout(partyTimer.current);
    setPhase("spinning");
    play("spin");
    startReels();
    const minimum = effectsRef.current === "full" ? 1000 : effectsRef.current === "subtle" ? 500 : 0;
    const minimumSpin = wait(minimum);
    try {
      const result = await apiFetch<SlotSpinResult>("/api/arcade/slots", { method: "POST", json: { spinId: next.id, bet: next.bet } });
      sessionStorage.removeItem(PENDING_KEY);
      // Settled on the server; the balance updates once the reels have landed.
      await minimumSpin;
      await stopReels(result.stops);
      setLive({ balance: result.balance });
      window.dispatchEvent(new CustomEvent("archive:coins", { detail: result.balance }));
      addHistory(result);
      reveal({ ...result });
    } catch (error) {
      haltReels();
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        // A definite answer: the spin was refused and nothing was charged.
        sessionStorage.removeItem(PENDING_KEY);
        setMessage(error.message);
        setPhase("idle");
      } else {
        // Unknown: it may or may not have reached the machine. Retrying with the same id is safe.
        setPending(next);
        setMessage("Connection lost mid-spin. Check the spin; it can never be charged twice.");
        setPhase("pending");
      }
    }
  }

  function spin() {
    if (busy || pending || reasonFor(bet)) return;
    const next = { id: crypto.randomUUID(), bet };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(next));
    void run(next);
  }

  // Finish showing a spin interrupted by a reload. Only looks it up; never spins on its own.
  useEffect(() => {
    const saved = readPending();
    if (!saved) {
      sessionStorage.removeItem(PENDING_KEY);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const spin = await apiFetch<SlotSpin>(`/api/arcade/slots?spin=${encodeURIComponent(saved.id)}`);
        if (cancelled) return;
        sessionStorage.removeItem(PENDING_KEY);
        spin.stops.forEach((stop, i) => place(i, stop));
        addHistory(spin);
        reveal({ ...spin, replay: true, recovered: true });
        setMessage("Your last spin was interrupted; here’s how it landed. It was only charged once.");
        setLive(null);
        router.refresh();
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) sessionStorage.removeItem(PENDING_KEY);
        else {
          setPending(saved);
          setPhase("pending");
          setMessage("Your last spin was interrupted and couldn’t be checked yet.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reasonFor(value: number) {
    return value > status.balance ? `You need ${coins(value)} for this bet.` : null;
  }

  const betIndex = machine.bets.indexOf(bet);
  const maxBet = machine.bets.filter((value) => value <= status.balance).at(-1) ?? machine.bets[0];
  const step = (delta: number) => {
    play("click");
    setBet(machine.bets[Math.min(machine.bets.length - 1, Math.max(0, betIndex + delta))]);
  };

  const reason = reasonFor(bet);
  const tier = shown ? tierOf(shown.multiplier, odds.topPays) : null;
  const rule = shown ? winningRule(machine.paytable, shown.symbols) : null;
  const result = busy ? "busy" : shown ? (tier ? "win" : "lose") : "idle";
  const near = Boolean(shown && !tier && nearMiss(machine, shown.symbols));
  const title = busy ? "Good luck" : shown ? (tier ? TIER_LABEL[tier] : near ? "So close" : "No win") : "Coin Slots";
  const celebrate = Boolean(shown && !shown.recovered && effects !== "off");
  const announce = shown
    ? `${shown.symbols.map(symbolName).join(", ")}. ${shown.payout > 0 ? `Won ${coins(shown.payout)}, net ${signed(shown.net)}.` : `No win, lost ${coins(shown.bet)}.`}`
    : "";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 md:px-6 md:py-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
          <Link href="/arcade">
            <ArrowLeft aria-hidden />
            Arcade
          </Link>
        </Button>
        <h1 className="sr-only">Coin Slots</h1>
        <span className="slots-balance ml-auto" aria-label={`Balance: ${coins(status.balance)}`}>
          <Coins aria-hidden className="size-4" />
          <span className="coin-ink tabular-nums">{fmt(status.balance)}</span>
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          className="size-8"
          onClick={toggleSound}
          aria-pressed={sound}
          aria-label={sound ? "Mute sound effects" : "Turn on sound effects"}
          title={sound ? "Sound on" : "Sound off"}
        >
          {sound ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div ref={cabinet} className="slots-cabinet" data-tier={tier ?? undefined} data-busy={busy || undefined}>
          <div className="slots-marquee" data-result={result} data-near={(near && celebrate) || undefined}>
            {celebrate && (tier === "mega" || tier === "jackpot") ? <span key={shown!.spinId} aria-hidden className="slots-rays" /> : null}
            <Bulbs />
            <span key={shown?.spinId ?? phase} className="slots-title" data-pop={(celebrate && tier) || undefined}>
              {title}
            </span>
            {shown && shown.payout > 0 ? (
              <span className="slots-amount">
                <Coins aria-hidden className="size-[0.75em]" />+<CountUp key={shown.spinId} value={shown.payout} animate={celebrate} onTick={(progress) => play("count", progress)} onDone={() => play("ding")} />
              </span>
            ) : shown ? (
              <span className="slots-sub">−{fmt(shown.bet)}</span>
            ) : null}
            <Bulbs bottom />
          </div>
          <div className="slots-window" data-unknown={phase === "pending" || undefined}>
            {machine.reels.map((reel, i) => (
              <div key={i} className="slots-reel" aria-hidden data-hit={(rule && shown?.symbols[i] === rule.symbol) || undefined} data-tease={(tease && i === 2) || undefined} data-match={(busy && matched >= 2 && i < matched) || undefined}>
                <div
                  ref={(node) => {
                    strips.current[i] = node;
                  }}
                  className="slots-strip"
                  style={{ "--f": START[i] % reel.length } as CSSProperties}
                >
                  {[reel.length - 1, ...reel.keys(), 0, 1].map((index, j) => (
                    <div key={j} className="slots-cell">
                      <SlotSymbol id={reel[index]} className="size-[72%]" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <span aria-hidden className="slots-payline" />
            <canvas ref={canvas} aria-hidden className="slots-particles" />
            {celebrate && isBig(tier) ? <span key={shown!.spinId} aria-hidden className="slots-flash" data-tier={tier ?? undefined} /> : null}
          </div>
          {party && shown && party === shown.spinId && tier && isBig(tier) ? (
            <button
              type="button"
              className="slots-party"
              data-tier={tier}
              aria-label="Skip the celebration"
              onClick={() => {
                window.clearTimeout(partyTimer.current);
                setParty(null);
              }}
            >
              <span aria-hidden className="slots-party-rays" />
              <span aria-hidden className="slots-party-title">
                {TIER_LABEL[tier]}
              </span>
              <span aria-hidden className="slots-party-amount">
                <Coins className="size-[0.7em]" />+<CountUp value={shown.payout} animate duration={PARTY[tier].count} />
              </span>
              <span aria-hidden className="slots-party-mult">
                ×{shown.multiplier} your bet
              </span>
              <span aria-hidden className="slots-party-hint">
                Tap to continue
              </span>
            </button>
          ) : null}
        </div>

        <div className="slots-console">
          <fieldset disabled={busy}>
            <legend className="slots-label">Bet</legend>
            <div className="slots-bet">
              <button type="button" className="slots-step" onClick={() => step(-1)} disabled={betIndex <= 0} aria-label="Lower bet">
                <Minus aria-hidden />
              </button>
              <output className="slots-bet-value" aria-live="polite">
                <Coins aria-hidden />
                {fmt(bet)}
              </output>
              <button type="button" className="slots-step" onClick={() => step(1)} disabled={betIndex >= machine.bets.length - 1} aria-label="Raise bet">
                <Plus aria-hidden />
              </button>
            </div>
            <div className="slots-quick">
              <button type="button" className="slots-chip" data-on={bet === machine.bets[0] || undefined} onClick={() => {
                  play("click");
                  setBet(machine.bets[0]);
                }}>
                Min
              </button>
              <button type="button" className="slots-chip" data-on={bet === maxBet || undefined} onClick={() => {
                  play("click");
                  setBet(maxBet);
                }}>
                Max
              </button>
            </div>
          </fieldset>
          <button type="button" onClick={spin} disabled={busy || Boolean(pending) || Boolean(reason)} aria-describedby={reason ? "slots-reason" : undefined} className="slots-spin">
            {busy ? <Loader2 aria-hidden className="size-6 animate-spin" /> : "Spin"}
            {busy ? <span className="sr-only">Spinning</span> : null}
          </button>
          {reason && !busy ? (
            <p id="slots-reason" className="slots-note">
              {reason}
            </p>
          ) : null}
          {pending ? (
            <Button variant="outline" size="sm" className="w-full" onClick={() => void run(pending)}>
              <RotateCcw aria-hidden />
              Check the spin
            </Button>
          ) : null}
          {message ? <p className="slots-note">{message}</p> : null}
          <p className="slots-fine">Coins only · no cash value</p>
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {busy ? "" : announce}
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <Paytable machine={machine} odds={odds} bet={bet} />
        <Recent history={history} />
      </div>
    </div>
  );
}

function Bulbs({ bottom }: { bottom?: boolean }) {
  return (
    <span aria-hidden className={cn("slots-bulbs", bottom && "slots-bulbs-bottom")}>
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} style={{ "--i": i } as CSSProperties} />
      ))}
    </span>
  );
}

/** The payout counting up on the marquee; keyed per spin so every win counts from zero. */
function CountUp({ value, animate, duration, onTick, onDone }: { value: number; animate: boolean; duration?: number; onTick?: (progress: number) => void; onDone?: () => void }) {
  const [current, setCurrent] = useState(animate ? 0 : value);
  const tickRef = useRef(onTick);
  const doneRef = useRef(onDone);
  useEffect(() => {
    tickRef.current = onTick;
    doneRef.current = onDone;
  });
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    const start = performance.now();
    const ms = duration ?? Math.min(2200, 500 + Math.log10(value + 1) * 380);
    let clink = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setCurrent(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1 && now - clink >= 70) {
        clink = now;
        tickRef.current?.(t);
      }
      if (t < 1) frame = requestAnimationFrame(tick);
      else doneRef.current?.();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, value, duration]);
  return <>{fmt(current)}</>;
}

function Paytable({ machine, odds, bet }: { machine: SlotMachine; odds: SlotOdds; bet: number }) {
  const oneIn = (ways: number) => (ways ? `1 in ${(odds.combos / ways).toLocaleString("en", { maximumFractionDigits: 1 })}` : "never");
  const rtp = (odds.returned / odds.combos) * 100;
  return (
    <section aria-labelledby="slots-paytable" className="slots-panel">
      <h2 id="slots-paytable" className="slots-heading">
        Paytable
      </h2>
      <ul className="mt-3 grid gap-1.5">
        {odds.rows.map((row) => (
          <li key={`${row.symbol}-${row.count}`} className="slots-pay-row">
            <span className="flex items-center gap-0.5" aria-label={`${row.count} ${symbolName(row.symbol)}${row.count < 3 ? ", any position" : ""}`}>
              {Array.from({ length: row.count }, (_, i) => (
                <SlotSymbol key={i} id={row.symbol} className="size-7" />
              ))}
            </span>
            <span className="slots-pay-mult">×{row.pays}</span>
            <span className="slots-pay-coins">
              <Coins aria-hidden className="size-3" />
              {fmt(row.pays * bet)}
            </span>
          </li>
        ))}
      </ul>
      <details className="slots-details">
        <summary>Odds and rules</summary>
        <ul className="mt-2 space-y-1">
          {odds.rows.map((row) => (
            <li key={`${row.symbol}-${row.count}`} className="flex justify-between gap-3">
              <span>
                {row.count} {symbolName(row.symbol)}
                {row.count < 3 ? " (any position)" : ""}
              </span>
              <span className="tabular-nums">{oneIn(row.ways)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Any win {oneIn(odds.hitWays)} · returns {rtp.toFixed(1)}% of coins wagered over time.
        </p>
        <p className="mt-1">
          The server draws each spin securely when you press Spin; the reels only reveal it. Up to {machine.maxSpinsPerMinute} spins a minute.
        </p>
      </details>
    </section>
  );
}

function Recent({ history }: { history: SlotHistoryRow[] }) {
  return (
    <section aria-labelledby="slots-history" className="slots-panel">
      <h2 id="slots-history" className="slots-heading">
        Recent spins
      </h2>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No spins yet.</p>
      ) : (
        <ol className="mt-3 grid gap-1.5">
          {history.map((row) => {
            const net = row.payout - row.bet;
            return (
              <li key={row.id} className="slots-past" data-win={net > 0 || undefined}>
                <span className="flex items-center gap-0.5" aria-label={row.symbols.map(symbolName).join(", ")}>
                  {row.symbols.map((symbol, i) => (
                    <SlotSymbol key={i} id={symbol} className="size-6" />
                  ))}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums" aria-label={`Bet ${coins(row.bet)}`}>
                  {fmt(row.bet)}
                </span>
                <span className="slots-past-net">{signed(net)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
