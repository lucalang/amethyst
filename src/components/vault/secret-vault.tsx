"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowRight, Coins, Frame, KeyRound, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { AvatarDecoration } from "@/components/layout/avatar-decoration";
import { BadgeEmblem } from "@/components/layout/profile-flair";
import { useMotionLevel } from "@/components/showcase/motion";
import { ApiError, apiFetch } from "@/lib/api-client";
import { isAvatarDecorationId, isProfileBadgeId, rewardItemInfo } from "@/lib/cosmetics";
import { cn } from "@/lib/utils";

export type VaultFind = { redeemedAt: string; coins: number; items: string[] };

type Redemption =
  | { status: "unlocked"; coins: number; items: string[]; newItems: string[]; balance: number }
  | { status: "already"; coins: number; items: string[]; redeemedAt: string; balance: number }
  | { status: "unknown"; triesLeft: number };

type Outcome =
  | { phase: "unlocked"; coins: number; items: string[]; newItems: string[]; balance: number }
  | { phase: "already"; coins: number; items: string[]; redeemedAt: string }
  | { phase: "sealed"; triesLeft: number }
  | { phase: "resting" | "error"; message: string };

type Phase = "idle" | "turning" | Outcome["phase"];

/** Deterministic 0–1 noise, identical on server and client. */
const noise = (index: number, salt: number) => (((index + 1) * 9301 + salt * 49297) % 233280) / 233280;

/** Rune marks (original shapes) engraved on the dial rings. */
const GLYPHS = [
  "M0,-3 V3 M0,-1.1 L2.1,-2.8",
  "M-2,3 L0,-3 L2,3",
  "M0,-3 V3 M0,-0.5 L2,0.9 L0,2.4",
  "M-1.9,-2.7 H1.9 M0,-2.7 V3 M-1.4,0.6 H1.4",
  "M-1.9,-3 L1.9,3 M1.9,-3 L-1.9,3",
  "M0,-3 V3 M-2.1,-1 L0,0.7 L2.1,-1",
  "M-1.7,3 V-3 L1.7,-1 L-1.7,1",
];
const RINGS = [
  { radius: 91, count: 30 },
  { radius: 70, count: 22 },
  { radius: 50, count: 14 },
].map((ring, r) => ({
  ...ring,
  marks: Array.from({ length: ring.count - 1 }, (_, index) => ({
    angle: (360 * (index + 1)) / ring.count,
    d: GLYPHS[(index * 5 + r * 3 + ((index * index) % 4)) % GLYPHS.length],
  })),
}));
const BOLTS = Array.from({ length: 16 }, (_, index) => (index * Math.PI) / 8);
/** Degrees per second while idle; the rings turn against each other. */
const DRIFT = [6, -9, 13];

const MOTES = Array.from({ length: 18 }, (_, index) => ({
  "--x": `${(noise(index, 1) * 100).toFixed(1)}%`,
  "--s": `${(2 + noise(index, 2) * 3).toFixed(1)}px`,
  "--d": `${(11 + noise(index, 3) * 9).toFixed(1)}s`,
  "--delay": `${(-noise(index, 4) * 20).toFixed(1)}s`,
  "--sway": `${Math.round((noise(index, 5) - 0.5) * 70)}px`,
  "--o": (0.3 + noise(index, 6) * 0.5).toFixed(2),
})) as CSSProperties[];
const SPARKS = Array.from({ length: 16 }, (_, index) => ({
  "--a": `${Math.round((index * 360) / 16 + noise(index, 7) * 14)}deg`,
  "--r": `${Math.round(110 + noise(index, 8) * 90)}px`,
  "--delay": `${Math.round(noise(index, 9) * 160)}ms`,
})) as CSSProperties[];

const SHUDDER: Keyframe[] = [
  { translate: "0 0" },
  { translate: "-7px 0" },
  { translate: "6px 0" },
  { translate: "-4px 0" },
  { translate: "2px 0" },
  { translate: "0 0" },
];

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

function CountUp({ value, animate }: { value: number; animate: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      start ||= now;
      // Starts once the door is open.
      const t = Math.min(1, Math.max(0, (now - start - 900) / 900));
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, animate]);
  return (
    <>
      <span aria-hidden className="tabular-nums">
        +{(animate ? shown : value).toLocaleString("en")}
      </span>
      <span className="sr-only">{value.toLocaleString("en")}</span>
    </>
  );
}

function RewardPreview({ id }: { id: string }) {
  if (isAvatarDecorationId(id)) {
    return (
      <span className="relative grid size-11 place-items-center">
        <span className="relative size-8 rounded-full bg-[radial-gradient(circle_at_35%_30%,#4c3a7a,#1d1236)] ring-1 ring-white/15">
          <AvatarDecoration decoration={id} />
        </span>
      </span>
    );
  }
  if (isProfileBadgeId(id)) return <BadgeEmblem badge={id} className="size-11" />;
  const kind = rewardItemInfo(id).kind;
  return (
    <span className="grid size-11 place-items-center rounded-full bg-white/[0.06] text-[#ffd36b] ring-1 ring-white/10">
      {kind === "frame" ? <Frame aria-hidden className="size-5" /> : kind === "title" ? <span className="text-[10px] font-bold tracking-widest">TITLE</span> : <Sparkles aria-hidden className="size-5" />}
    </span>
  );
}

function Rewards({ coins, items, newItems, animate }: { coins: number; items: string[]; newItems?: string[]; animate: boolean }) {
  const wearable = items.some((id) => ["avatar_decoration", "badge", "title"].includes(rewardItemInfo(id).kind));
  return (
    <>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {coins > 0 ? (
          <li className="vault-reward" style={{ "--i": 0 } as CSSProperties}>
            <span aria-hidden className="vault-reward-coin">
              <Coins className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-semibold text-[#ffd36b]">
                <CountUp value={coins} animate={animate} /> coins
              </span>
              <span className="block text-xs text-[#efe7ff]/65">Added to your Arcade wallet</span>
            </span>
          </li>
        ) : null}
        {items.map((id, index) => {
          const info = rewardItemInfo(id);
          const fresh = !newItems || newItems.includes(id);
          return (
            <li key={id} className="vault-reward" style={{ "--i": index + 1 } as CSSProperties}>
              <RewardPreview id={id} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 font-semibold">
                  {info.name}
                  {newItems ? <span className={cn("vault-tag", !fresh && "vault-tag-muted")}>{fresh ? "New" : "Already yours"}</span> : null}
                </span>
                <span className="block text-xs text-pretty text-[#efe7ff]/65">{info.description}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {wearable ? (
        <Link href="/customization/profile" className="vault-link mt-4">
          Wear it in your profile <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      ) : null}
    </>
  );
}

/** The Vault: a hidden door that opens for secret codes. Validation and rewards happen on the server. */
export function SecretVault({ finds: initialFinds }: { finds: VaultFind[] }) {
  const motion = useMotionLevel();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [finds, setFinds] = useState(initialFinds);
  const roomRef = useRef<HTMLDivElement>(null);
  const doorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const ringRefs = useRef<(SVGGElement | null)[]>([]);
  const angles = useRef([0, 0, 0]);
  const speeds = useRef([...DRIFT]);
  const mode = useRef<"idle" | "turning" | "align">("idle");
  const wake = useRef<() => void>(() => {});
  const busy = phase === "turning";

  // The dial: rings drift, spin up while a code is checked and whirl into line when it opens.
  // Script-driven so speed changes stay smooth; it sleeps offscreen, in hidden tabs and once settled.
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return;
    const angle = angles.current;
    const speed = speeds.current;
    const draw = () => ringRefs.current.forEach((ring, index) => ring?.setAttribute("transform", `rotate(${(angle[index] % 360).toFixed(2)})`));
    if (motion === "off") {
      wake.current = () => {
        if (mode.current === "align") angle.fill(0);
        draw();
      };
      wake.current();
      return;
    }
    const scale = motion === "subtle" ? 0.5 : 1;
    const targets: (number | null)[] = [null, null, null];
    let frame = 0;
    let last = 0;
    let onscreen = true;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      let moving = false;
      for (let index = 0; index < 3; index += 1) {
        if (mode.current === "align") {
          if (targets[index] === null) {
            const ahead = speed[index] >= 0 ? 1 : -1;
            targets[index] = ahead > 0 ? Math.ceil((angle[index] + 60) / 360) * 360 : Math.floor((angle[index] - 60) / 360) * 360;
          }
          const target = targets[index]!;
          // Critically damped spring: no overshoot past the aligned position.
          speed[index] += (-30 * (angle[index] - target) - 2 * Math.sqrt(30) * speed[index]) * dt;
          angle[index] += speed[index] * dt;
          if (Math.abs(angle[index] - target) < 0.05 && Math.abs(speed[index]) < 1) {
            angle[index] = target;
            speed[index] = 0;
          } else moving = true;
        } else {
          targets[index] = null;
          const goal = DRIFT[index] * scale * (mode.current === "turning" ? 16 : 1);
          speed[index] += (goal - speed[index]) * (1 - Math.exp(-dt * (mode.current === "turning" ? 2.5 : 1.2)));
          angle[index] = (angle[index] + speed[index] * dt) % 360;
          moving = true;
        }
      }
      draw();
      frame = moving && onscreen && !document.hidden ? requestAnimationFrame(tick) : 0;
    };
    const start = () => {
      if (frame || !onscreen || document.hidden) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    wake.current = start;
    const observer = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      room.toggleAttribute("data-paused", !onscreen);
      if (onscreen) start();
    });
    observer.observe(room);
    const onVisibility = () => start();
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      wake.current = () => {};
    };
  }, [motion]);

  useEffect(() => {
    if (outcome) resultRef.current?.focus();
  }, [outcome]);

  function nudge() {
    // Each keystroke knocks the tumblers a little.
    speeds.current = speeds.current.map((value, index) => value + (index % 2 ? -14 : 14));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!code.trim()) {
      inputRef.current?.focus();
      return;
    }
    setOutcome(null);
    setPhase("turning");
    mode.current = "turning";
    wake.current();
    const started = performance.now();
    const minimum = motion === "full" ? 1100 : motion === "subtle" ? 500 : 0;

    let next: Outcome;
    try {
      const result = await apiFetch<Redemption>("/api/vault/redeem", { method: "POST", json: { code } });
      next =
        result.status === "unlocked"
          ? { phase: "unlocked", coins: result.coins, items: result.items, newItems: result.newItems, balance: result.balance }
          : result.status === "already"
            ? { phase: "already", coins: result.coins, items: result.items, redeemedAt: result.redeemedAt }
            : { phase: "sealed", triesLeft: result.triesLeft };
    } catch (error) {
      next =
        error instanceof ApiError && error.code === "rate_limited"
          ? { phase: "resting", message: error.message }
          : error instanceof ApiError && error.status === 422
            ? { phase: "error", message: error.message }
            : { phase: "error", message: "The vault didn’t answer. Nothing was used up, so try again." };
    }
    const wait = minimum - (performance.now() - started);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    mode.current = next.phase === "unlocked" || next.phase === "already" ? "align" : "idle";
    wake.current();
    if (next.phase === "unlocked") {
      const { coins, items, balance } = next;
      setCode("");
      setFinds((list) => [{ redeemedAt: new Date().toISOString(), coins, items }, ...list]);
      if (coins > 0) window.dispatchEvent(new CustomEvent("archive:coins", { detail: balance }));
      // Refresh the shell so new badges, titles and decorations show up in the profile pickers.
      if (items.length) router.refresh();
    } else if (next.phase !== "already" && motion !== "off") {
      doorRef.current?.animate(SHUDDER, { duration: 460, easing: "ease-out" });
    }
    setOutcome(next);
    setPhase(next.phase);
  }

  function again() {
    setOutcome(null);
    setPhase("idle");
    mode.current = "idle";
    wake.current();
    inputRef.current?.focus();
  }

  const charge = Math.min(1, code.replace(/[\s._-]/g, "").length / 12);
  const open = phase === "unlocked";

  return (
    <div className="space-y-6">
      <div ref={roomRef} className="vault-room" data-phase={phase} style={{ "--charge": charge } as CSSProperties}>
        <div aria-hidden className="vault-motes">
          {MOTES.map((style, index) => (
            <span key={index} style={style} />
          ))}
        </div>

        <div className="relative px-4 pt-6 text-center md:pt-8">
          <p className="text-[11px] font-semibold tracking-[0.3em] text-[#ffd36b]/80 uppercase">Behind the shelves</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">The Vault</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-pretty text-[#efe7ff]/70">A door that only answers to secret words. If you’ve found a code, speak it here.</p>
        </div>

        <div ref={doorRef} aria-hidden className="vault-door">
          <div className="vault-rays" />
          <svg viewBox="-120 -120 240 240" className="vault-dial">
            <defs>
              <radialGradient id="vault-light" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor="#fffaf0" />
                <stop offset="0.35" stopColor="#ffe3a3" stopOpacity="0.9" />
                <stop offset="1" stopColor="#b794ff" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="vault-metal" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#2b1d48" />
                <stop offset="0.5" stopColor="#180f2b" />
                <stop offset="1" stopColor="#0c0717" />
              </linearGradient>
              <radialGradient id="vault-face" cx="0.38" cy="0.32" r="0.8">
                <stop offset="0" stopColor="#3b2a63" />
                <stop offset="1" stopColor="#120a22" />
              </radialGradient>
            </defs>
            <circle r="117" fill="#05020a" />
            <circle r="112" fill="url(#vault-metal)" stroke="#4a3874" strokeWidth="1.5" />
            {BOLTS.map((theta, index) => (
              <circle key={index} cx={(104 * Math.cos(theta)).toFixed(2)} cy={(104 * Math.sin(theta)).toFixed(2)} r="2.2" className="vault-bolt" />
            ))}
            <circle r="46" fill="url(#vault-light)" className="vault-light" />
            {RINGS.map((ring, index) => (
              <g
                key={ring.radius}
                ref={(node) => {
                  ringRefs.current[index] = node;
                }}
                className="vault-ring"
              >
                <circle r={ring.radius + 8} className="vault-ring-edge" />
                <circle r={ring.radius - 8} className="vault-ring-edge" />
                <g className="vault-runes">
                  {ring.marks.map((mark, markIndex) => (
                    <path key={markIndex} d={mark.d} transform={`rotate(${mark.angle.toFixed(2)}) translate(0 ${-ring.radius})`} />
                  ))}
                </g>
                <path className="vault-notch" d={`M0,${-ring.radius + 4.5} L-4.2,${-ring.radius - 3.5} H4.2 Z`} />
              </g>
            ))}
            <rect x="-1.4" y="-104" width="2.8" height="62" rx="1.4" className="vault-beam" />
            <g className="vault-half vault-half-l">
              <path d="M0,-36 A36,36 0 0 0 0,36 Z" fill="url(#vault-face)" />
              <path d="M0,-15 A7.5,7.5 0 0 0 -4.6,-1.2 L-6.5,17 H0 Z" className="vault-keyhole" />
            </g>
            <g className="vault-half vault-half-r">
              <path d="M0,-36 A36,36 0 0 1 0,36 Z" fill="url(#vault-face)" />
              <path d="M0,-15 A7.5,7.5 0 0 1 4.6,-1.2 L6.5,17 H0 Z" className="vault-keyhole" />
            </g>
            <circle r="36" className="vault-core-rim" />
          </svg>
          <div className="vault-sparks">
            {open && motion !== "off" ? SPARKS.map((style, index) => <span key={index} style={style} />) : null}
          </div>
        </div>

        <form onSubmit={submit} className="relative mx-auto flex max-w-md flex-col items-center gap-3 px-4 pb-6">
          <label htmlFor="vault-code" className="sr-only">
            Secret code
          </label>
          <input
            ref={inputRef}
            id="vault-code"
            name="vault-code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              if (motion !== "off") nudge();
            }}
            maxLength={60}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            aria-describedby="vault-code-help"
            disabled={busy}
            className="vault-input"
          />
          <p id="vault-code-help" className="text-xs text-[#efe7ff]/55">
            Letters and numbers; spaces and dashes don’t matter. Each code opens once per account.
          </p>
          {open || phase === "already" ? (
            <button type="button" onClick={again} className="vault-key">
              <RotateCcw aria-hidden className="size-4" />
              Try another code
            </button>
          ) : (
            <button type="submit" disabled={busy} aria-busy={busy} className="vault-key">
              {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <KeyRound aria-hidden className="size-4" />}
              {busy ? "Turning…" : "Turn the key"}
            </button>
          )}
        </form>

        <div role="status" aria-live="polite" className="relative px-4 pb-6 md:px-8 md:pb-8">
          {outcome ? (
            <div className={cn("vault-result", outcome.phase === "unlocked" && "vault-result-open")}>
              <h2 ref={resultRef} tabIndex={-1} className="text-xl font-semibold outline-none">
                {outcome.phase === "unlocked"
                  ? "The vault opens"
                  : outcome.phase === "already"
                    ? "You’ve opened this one before"
                    : outcome.phase === "sealed"
                      ? "The vault stays sealed"
                      : outcome.phase === "resting"
                        ? "The vault is resting"
                        : "The key didn’t turn"}
              </h2>
              {outcome.phase === "unlocked" ? (
                <>
                  <p className="mt-1 text-sm text-[#efe7ff]/70">Everything inside is yours to keep.</p>
                  <Rewards coins={outcome.coins} items={outcome.items} newItems={outcome.newItems} animate={motion !== "off"} />
                </>
              ) : outcome.phase === "already" ? (
                <>
                  <p className="mt-1 text-sm text-[#efe7ff]/70">You opened it on {formatDate(outcome.redeemedAt)}, and what it holds is already yours. Nothing new was added.</p>
                  <Rewards coins={outcome.coins} items={outcome.items} animate={false} />
                </>
              ) : outcome.phase === "sealed" ? (
                <p className="mt-1 text-sm text-[#efe7ff]/70">
                  That code didn’t open anything. Check it and try again.
                  {outcome.triesLeft === 0
                    ? " The vault will rest for a while before the next try."
                    : outcome.triesLeft <= 2
                      ? ` ${outcome.triesLeft} more ${outcome.triesLeft === 1 ? "try" : "tries"} before it rests for a while.`
                      : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-[#efe7ff]/70">{outcome.message}</p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="vault-finds-heading" className="rounded-2xl border border-border bg-surface/40 p-4 md:p-5">
        <h2 id="vault-finds-heading" className="flex items-center gap-2 text-base font-semibold">
          <Sparkles aria-hidden className="size-4 text-amethyst" />
          Your finds
        </h2>
        {finds.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing yet. Codes turn up in unexpected places.</p>
        ) : (
          <ol className="mt-3 divide-y divide-border">
            {finds.map((find, index) => (
              <li key={`${find.redeemedAt}-${index}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <span className="min-w-0 text-foreground">
                  {[find.coins > 0 ? `${find.coins.toLocaleString("en")} coins` : null, ...find.items.map((id) => rewardItemInfo(id).name)].filter(Boolean).join(" · ")}
                </span>
                <span suppressHydrationWarning className="text-xs text-muted-foreground">
                  {formatDate(find.redeemedAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Badges, titles and decorations are worn from{" "}
          <Link href="/customization/profile" className="text-amethyst underline-offset-4 hover:underline">
            your profile
          </Link>
          ; coins land in your{" "}
          <Link href="/arcade/shop" className="text-amethyst underline-offset-4 hover:underline">
            Arcade wallet
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
