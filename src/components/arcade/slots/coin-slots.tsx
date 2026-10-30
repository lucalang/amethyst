"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Coins, House, Info, Loader2, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { ArcadeProvider, useArcade } from "@/components/arcade/game-shell";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { SlotMachine, SlotOdds, SlotSpin, SlotSpinResult } from "@/lib/slots";
import { cn } from "@/lib/utils";
import { closeSlotAudio, playSlotSound, type SlotSound } from "./slot-audio";
import { SlotSymbol, symbolName } from "./symbols";

export type SlotStatus = { balance: number; wagered: number; room: number; wagerFreesAt: string | null };
export type SlotHistoryRow = { id: string; bet: number; symbols: string[]; payout: number; createdAt: string };
type Props = { machine: SlotMachine; odds: SlotOdds; status: SlotStatus; history: SlotHistoryRow[] };
type Shown = SlotSpin & { replay: boolean; recovered?: boolean };
type Pending = { id: string; bet: number };
type Tier = "win" | "big" | "jackpot";

const PENDING_KEY = "archive:slots:pending";
/** Where each reel starts before the first spin (decorative only). */
const START = [0, 7, 13];
const mod = (value: number, n: number) => ((value % n) + n) % n;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const signed = (value: number) => (value > 0 ? `+${value.toLocaleString("en")}` : value < 0 ? `−${Math.abs(value).toLocaleString("en")}` : "±0");
const coins = (value: number) => `${value.toLocaleString("en")} coin${value === 1 ? "" : "s"}`;
const tierOf = (multiplier: number, top: number): Tier | null => (multiplier <= 0 ? null : multiplier >= top ? "jackpot" : multiplier >= 20 ? "big" : "win");
const TIER_LABEL: Record<Tier, string> = { win: "Win", big: "Big win", jackpot: "Amethyst jackpot" };

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
  const [session, setSession] = useState({ spins: 0, net: 0 });
  const cabinet = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const strips = useRef<(HTMLDivElement | null)[]>([]);
  const pos = useRef([...START]);
  const spinFrame = useRef(0);
  const onscreen = useRef(true);
  const soundRef = useRef(sound);
  const effectsRef = useRef(effects);
  const L = machine.reels.map((reel) => reel.length);
  const busy = phase === "spinning";

  useEffect(() => {
    soundRef.current = sound;
    effectsRef.current = effects;
  }, [sound, effects]);

  const play = (name: SlotSound) => {
    if (soundRef.current) playSlotSound(name);
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
      closeSlotAudio();
    };
  }, []);

  function place(index: number, value: number) {
    pos.current[index] = value;
    strips.current[index]?.style.setProperty("--f", mod(value, L[index]).toFixed(4));
  }

  /** Reels spin freely until `stopReels` is called. */
  function startReels() {
    if (effectsRef.current === "off") return;
    cancelAnimationFrame(spinFrame.current);
    const top = effectsRef.current === "full" ? 16 : 9;
    let last = 0;
    let speed = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      speed = Math.min(top, speed + top * dt * 5);
      for (let i = 0; i < 3; i += 1) place(i, pos.current[i] - speed * dt);
      spinFrame.current = requestAnimationFrame(tick);
    };
    spinFrame.current = requestAnimationFrame(tick);
  }

  /** Lands every reel on its stop, left to right, at the same pace whatever the outcome. */
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
    const speed = full ? 16 : 9;
    return new Promise<void>((resolve) => {
      const plan = stops.map(() => ({ from: 0, to: 0, begun: false, done: false }));
      const start = performance.now();
      let last = start;
      const tick = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        plan.forEach((reel, i) => {
          if (reel.done) return;
          const begin = start + i * stagger;
          if (now < begin) {
            place(i, pos.current[i] - speed * dt);
            return;
          }
          if (!reel.begun) {
            reel.begun = true;
            reel.from = pos.current[i];
            const base = reel.from - 3;
            reel.to = base - mod(mod(base, L[i]) - stops[i], L[i]);
          }
          const t = Math.min(1, (now - begin) / duration);
          // Ease out with a small settle; no lingering or creeping past symbols.
          const c = full ? 1.2 : 0;
          const eased = 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
          place(i, reel.from + (reel.to - reel.from) * eased);
          if (t >= 1) {
            reel.done = true;
            place(i, stops[i]);
            play("stop");
          }
        });
        if (plan.every((reel) => reel.done)) resolve();
        else spinFrame.current = requestAnimationFrame(tick);
      };
      spinFrame.current = requestAnimationFrame(tick);
    });
  }

  function haltReels() {
    cancelAnimationFrame(spinFrame.current);
    for (let i = 0; i < 3; i += 1) place(i, Math.round(pos.current[i]));
  }

  function burst(tier: Tier) {
    const node = canvas.current;
    const context = node?.getContext("2d");
    if (!node || !context || effectsRef.current !== "full" || !onscreen.current) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const { width, height } = node.getBoundingClientRect();
    node.width = width * ratio;
    node.height = height * ratio;
    context.scale(ratio, ratio);
    const count = tier === "jackpot" ? 90 : tier === "big" ? 55 : 24;
    const parts = Array.from({ length: count }, (_, i) => ({
      x: width / 2 + (Math.random() - 0.5) * width * 0.5,
      y: height * 0.55,
      vx: (Math.random() - 0.5) * 320,
      vy: -220 - Math.random() * 320,
      r: 4 + Math.random() * 4,
      spin: Math.random() * Math.PI,
      gem: i % 3 === 0,
    }));
    let start = 0;
    let last = 0;
    const life = tier === "win" ? 1400 : 2200;
    const tick = (now: number) => {
      start ||= now;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const age = (now - start) / life;
      context.clearRect(0, 0, width, height);
      if (age >= 1 || !onscreen.current) return;
      context.globalAlpha = Math.min(1, (1 - age) * 2);
      for (const p of parts) {
        p.vy += 620 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.spin += dt * 6;
        context.save();
        context.translate(p.x, p.y);
        context.rotate(p.spin);
        if (p.gem) {
          context.fillStyle = "#a78bfa";
          context.beginPath();
          context.moveTo(0, -p.r);
          context.lineTo(p.r * 0.7, 0);
          context.lineTo(0, p.r);
          context.lineTo(-p.r * 0.7, 0);
          context.fill();
        } else {
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
    if (tier && !spin.recovered) {
      play(tier === "jackpot" ? "jackpot" : tier === "big" ? "big" : "win");
      burst(tier);
    }
  }

  async function run(next: Pending) {
    setMessage(null);
    setShown(null);
    setPending(null);
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
      setLive((current) => ({
        balance: result.balance,
        wagered: result.wagered,
        room: result.room,
        wagerFreesAt: (current ?? initialStatus).wagerFreesAt ?? new Date(new Date(result.createdAt).getTime() + 86_400_000).toISOString(),
      }));
      window.dispatchEvent(new CustomEvent("archive:coins", { detail: result.balance }));
      addHistory(result);
      if (!result.replay) setSession((value) => ({ spins: value.spins + 1, net: value.net + result.net }));
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
        setMessage("The connection dropped mid-spin. Check the spin to see how it landed. Retrying can never charge twice.");
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
          setMessage("Your last spin was interrupted and we couldn’t check it yet.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reasonFor(value: number) {
    if (value > status.balance) return `You need ${coins(value)} for this bet.`;
    if (status.wagered + value > machine.dailyWagerLimit) return `That would pass your ${machine.dailyWagerLimit}-coin wager limit for the last 24 hours.`;
    if (value * (odds.topPays - 1) > status.room) return "A top win on this bet could pass today’s coin earning limit. Try a smaller bet.";
    return null;
  }

  const reason = reasonFor(bet);
  const tier = shown ? tierOf(shown.multiplier, odds.topPays) : null;
  const marquee = busy ? "Good luck" : shown ? (tier ? `${TIER_LABEL[tier]} ×${shown.multiplier}` : "No win") : "Coin Slots";
  const wagerShare = Math.min(1, status.wagered / machine.dailyWagerLimit);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-3 py-4 md:px-6 md:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Arcade navigation" className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="h-8 px-2">
            <Link href="/arcade">
              <ArrowLeft aria-hidden />
              Arcade
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon-sm" className="size-8">
            <Link href="/" aria-label="Home" title="Home">
              <House aria-hidden />
            </Link>
          </Button>
        </nav>
        <h1 className="px-1 text-lg font-bold tracking-tight md:text-xl">Coin Slots</h1>
        <div className="ml-auto">
          <Button
            variant="ghost"
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
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div ref={cabinet} className="slots-cabinet" data-tier={tier ?? undefined} data-busy={busy || undefined}>
          <div className="slots-marquee">
            <span aria-hidden className="slots-bulbs">
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} style={{ "--i": i } as CSSProperties} />
              ))}
            </span>
            <span className="slots-marquee-text">{marquee}</span>
          </div>
          <div className="slots-window" data-unknown={phase === "pending" || undefined}>
            {machine.reels.map((reel, i) => (
              <div key={i} className="slots-reel" aria-hidden>
                <div
                  ref={(node) => {
                    strips.current[i] = node;
                  }}
                  className="slots-strip"
                  style={{ "--f": START[i] % reel.length } as CSSProperties}
                >
                  {[reel.length - 1, ...reel.keys(), 0, 1].map((index, j) => (
                    <div key={j} className="slots-cell">
                      <SlotSymbol id={reel[index]} className="size-[70%]" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <span aria-hidden className="slots-payline" />
            <canvas ref={canvas} aria-hidden className="slots-particles" />
          </div>
          <p className="slots-plate">Payline: the middle row · Coins only, no cash value</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Balance</span>
              <span className="flex items-center gap-1.5 text-lg font-semibold">
                <Coins aria-hidden className="size-4 text-amber-500" />
                <span className="coin-ink tabular-nums">{status.balance.toLocaleString("en")}</span>
              </span>
            </div>
            <fieldset className="mt-4" disabled={busy}>
              <legend className="text-sm font-medium">Bet per spin</legend>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {machine.bets.map((value) => {
                  const blocked = reasonFor(value);
                  return (
                    <label key={value} className={cn("slots-bet", bet === value && "slots-bet-on", blocked && "slots-bet-blocked")} title={blocked ?? undefined}>
                      <input type="radio" name="slots-bet" value={value} checked={bet === value} onChange={() => setBet(value)} className="sr-only" />
                      {value}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <button type="button" onClick={spin} disabled={busy || Boolean(pending) || Boolean(reason)} aria-describedby={reason ? "slots-reason" : undefined} className="slots-spin mt-4">
              {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
              {busy ? "Spinning…" : `Spin · ${coins(bet)}`}
            </button>
            {reason && !busy ? (
              <p id="slots-reason" className="mt-2 text-xs text-muted-foreground">
                {reason}
              </p>
            ) : null}
            {pending ? (
              <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void run(pending)}>
                <RotateCcw aria-hidden />
                Check the spin
              </Button>
            ) : null}
          </div>

          <div role="status" aria-live="polite" className="min-h-24 rounded-2xl border border-border bg-surface/50 p-4">
            {shown ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {shown.symbols.map(symbolName).join(" · ")}
                </p>
                {shown.payout > 0 ? (
                  <>
                    <p className="mt-1 text-lg font-semibold">
                      Paid {coins(shown.payout)} · <span className="text-emerald-600 dark:text-emerald-400">Net {signed(shown.net)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Bet {shown.bet} × {shown.multiplier} = {shown.payout} paid back, so your profit is {shown.net}.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-semibold">No win · Net {signed(shown.net)}</p>
                    <p className="text-xs text-muted-foreground">The {coins(shown.bet)} bet was lost.</p>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{busy ? "The reels are turning. The result is already decided." : "Pick a bet and press Spin. One press, one spin."}</p>
            )}
            {message ? <p className="mt-2 text-sm">{message}</p> : null}
            {session.spins > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                This visit: {session.spins} spin{session.spins === 1 ? "" : "s"}, net {signed(session.net)} coins.
              </p>
            ) : null}
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-surface/50 p-4 text-sm">
            <div>
              <div className="flex justify-between gap-2">
                <span>Wagered, last 24 hours</span>
                <span className="tabular-nums">
                  {status.wagered} / {machine.dailyWagerLimit}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-foreground/10">
                <div className="h-full rounded-full bg-amethyst" style={{ width: `${wagerShare * 100}%` }} />
              </div>
              {status.wagerFreesAt && status.wagered > 0 ? (
                <p suppressHydrationWarning className="mt-1 text-xs text-muted-foreground">
                  Room frees up as spins age past 24 hours, starting {new Date(status.wagerFreesAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}.
                </p>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Earning room left today: <strong className="text-foreground tabular-nums">{status.room}</strong> coins. Net slot winnings share the daily limit with game rewards.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Paytable machine={machine} odds={odds} bet={bet} />
        <section aria-labelledby="slots-rules" className="rounded-2xl border border-border bg-surface/50 p-4 md:p-5">
          <h2 id="slots-rules" className="flex items-center gap-2 font-semibold">
            <Info aria-hidden className="size-4 text-amethyst" />
            How it works
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Coin Slots uses Arcade coins you’ve earned. Coins can’t be bought, have no cash value and can’t be cashed out.</li>
            <li>Each press of Spin places one bet. There’s no autoplay.</li>
            <li>The server draws every reel with a cryptographically secure random generator the moment you press Spin. The animation only reveals it; earlier spins never change the odds.</li>
            <li>Payout is bet × multiplier. Net is payout minus your bet; the smallest win pays 3×, so every win is a profit.</li>
            <li>You can wager up to {machine.dailyWagerLimit} coins in any 24 hours, and spin up to {machine.maxSpinsPerMinute} times a minute.</li>
            <li>Net winnings count toward the same daily earning limit as game rewards. Bets whose top win wouldn’t fit are paused until room frees up.</li>
          </ul>
        </section>
      </div>

      <section aria-labelledby="slots-history" className="rounded-2xl border border-border bg-surface/50 p-4 md:p-5">
        <h2 id="slots-history" className="font-semibold">
          Recent spins
        </h2>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No spins yet.</p>
        ) : (
          <ol className="mt-3 divide-y divide-border">
            {history.map((row) => {
              const net = row.payout - row.bet;
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                  <span className="flex items-center gap-1" aria-label={row.symbols.map(symbolName).join(", ")}>
                    {row.symbols.map((symbol, i) => (
                      <SlotSymbol key={i} id={symbol} className="size-6" />
                    ))}
                  </span>
                  <span className="text-muted-foreground">Bet {row.bet}</span>
                  <span className={cn("tabular-nums", net > 0 && "font-medium text-emerald-600 dark:text-emerald-400")}>
                    {row.payout > 0 ? `Paid ${row.payout} · Net ${signed(net)}` : `No win · ${signed(net)}`}
                  </span>
                  <span suppressHydrationWarning className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function Paytable({ machine, odds, bet }: { machine: SlotMachine; odds: SlotOdds; bet: number }) {
  const percent = (ways: number) => `${((ways / odds.combos) * 100).toFixed(2)}%`;
  const oneIn = (ways: number) => (ways ? `1 in ${(odds.combos / ways).toLocaleString("en", { maximumFractionDigits: 1 })}` : "never");
  return (
    <section aria-labelledby="slots-paytable" className="rounded-2xl border border-border bg-surface/50 p-4 md:p-5">
      <h2 id="slots-paytable" className="font-semibold">
        Paytable and exact odds
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Each reel has {machine.reels[0].length} equally likely stops, so there are {odds.combos.toLocaleString("en")} possible lines. Only the best matching rule pays.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="pb-2 font-medium">Line</th>
              <th scope="col" className="pb-2 font-medium">Pays</th>
              <th scope="col" className="pb-2 font-medium">On a {bet} bet</th>
              <th scope="col" className="pb-2 font-medium">Chance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {odds.rows.map((row) => (
              <tr key={`${row.symbol}-${row.count}`}>
                <th scope="row" className="py-1.5 text-left font-normal">
                  <span className="flex items-center gap-1">
                    {Array.from({ length: row.count }, (_, i) => (
                      <SlotSymbol key={i} id={row.symbol} className="size-6" />
                    ))}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {row.count === 3 ? `3 ${symbolName(row.symbol)}` : `exactly ${row.count} ${symbolName(row.symbol)}, any position`}
                    </span>
                  </span>
                </th>
                <td className="tabular-nums">×{row.pays}</td>
                <td className="tabular-nums">
                  {row.pays * bet} <span className="text-xs text-muted-foreground">(net +{(row.pays - 1) * bet})</span>
                </td>
                <td className="tabular-nums">
                  {oneIn(row.ways)} <span className="text-xs text-muted-foreground">({row.ways.toLocaleString("en")} · {percent(row.ways)})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="inline">Any win: </dt>
          <dd className="inline text-foreground">
            {oneIn(odds.hitWays)} ({percent(odds.hitWays)})
          </dd>
        </div>
        <div>
          <dt className="inline">Average return: </dt>
          <dd className="inline text-foreground">{((odds.returned / odds.combos) * 100).toFixed(2)}% of coins wagered</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">Over many spins you should expect to lose about {(100 - (odds.returned / odds.combos) * 100).toFixed(1)} coins per 100 wagered.</p>
    </section>
  );
}
