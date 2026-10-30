"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Coins, Gamepad2, Sparkles } from "lucide-react";
import { SampleArt, type FrameSample } from "@/app/(vault)/settings/frame-settings";
import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { BadgeEmblem, ProfileFlair } from "@/components/layout/profile-flair";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import { achievementDefinition, type AchievementDefinition } from "@/lib/achievements";
import { isAvatarDecorationId, isProfileBadgeId, isProfileTitleId, rewardItemInfo } from "@/lib/cosmetics";
import { isShopFrameId } from "@/lib/frames";
import { GAME_SHOPS, gameCosmetic, shopHref, type GameCosmetic } from "@/lib/game-cosmetics";
import type { MotionLevel } from "@/lib/preferences";
import { CARD_STAGGER } from "./timing";

// Game looks are drawn by the shop's live preview, loaded only when a code grants one.
const CosmeticPreview = lazy(() => import("@/components/arcade/shop/preview").then((module) => ({ default: module.CosmeticPreview })));

export type VaultProfile = { name: string | null; avatarUrl: string | null };
export type VaultSamples = { portrait: FrameSample | null; square: FrameSample | null };
/** The account's own avatar and covers, so rewards are shown on the user's real things. */
export type VaultLooks = { profile: VaultProfile; samples: VaultSamples };
/**
 * Where the cards come from, in CSS 3D space: x/y in viewport px and z toward the viewer, seen
 * through `perspective` px from the point (axisX, axisY).
 */
export type RevealOrigin = { x: number; y: number; z: number; perspective: number; axisX: number; axisY: number };

type RewardKind = "frame" | "avatar_decoration" | "badge" | "title" | "game" | "achievement" | "other";
const KIND_LABEL: Record<RewardKind, string> = {
  frame: "Artwork frame",
  avatar_decoration: "Avatar decoration",
  badge: "Profile badge",
  title: "Profile title",
  game: "Game look",
  achievement: "Achievement",
  other: "Item",
};
const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&*+<>/";

/** Achievements a code unlocks travel with its rewards as "achievement:<id>". */
export const ACHIEVEMENT_PREFIX = "achievement:";
const rewardAchievement = (id: string) => (id.startsWith(ACHIEVEMENT_PREFIX) ? achievementDefinition(id.slice(ACHIEVEMENT_PREFIX.length)) : undefined);

/** Profile cosmetics, game looks and achievements alike. */
export function rewardInfo(id: string): { kind: RewardKind; name: string; description: string; game?: GameCosmetic; achievement?: AchievementDefinition } {
  const achievement = rewardAchievement(id);
  if (achievement) return { kind: "achievement", name: achievement.name, description: achievement.description, achievement };
  const game = gameCosmetic(id);
  if (game) return { kind: "game", name: game.name, description: game.description, game };
  return rewardItemInfo(id);
}

export const kindLabel = (info: ReturnType<typeof rewardInfo>) => (info.game ? `${GAME_SHOPS[info.game.game].title} look` : KIND_LABEL[info.kind]);

/** "500 coins · Vault sigil" */
export function rewardSummary(coins: number, items: string[], separator = " · ") {
  return [coins > 0 ? `${coins.toLocaleString("en")} coins` : null, ...items.map((id) => rewardInfo(id).name)].filter(Boolean).join(separator);
}

/** Text that resolves out of noise from left to right. Screen readers get the plain text at once. */
export function DecodeText({ text, animate, delay = 0 }: { text: string; animate: boolean; delay?: number }) {
  const [shown, setShown] = useState<string | null>(() => (animate ? text.replace(/\S/g, "·") : null));
  useEffect(() => {
    if (!animate) return;
    const duration = 240 + text.length * 34;
    let frame = 0;
    let start = 0;
    let step = -1;
    const tick = (now: number) => {
      start ||= now;
      const t = (now - start - delay) / duration;
      if (t >= 1) {
        setShown(null);
        return;
      }
      // Fresh noise about 30 times a second rather than every frame.
      const next = Math.floor((now - start) / 33);
      if (next !== step) {
        step = next;
        const solved = Math.max(0, Math.floor(t * text.length));
        setShown([...text].map((char, index) => (index < solved || char === " " ? char : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join(""));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, animate, delay]);
  return (
    <>
      <span aria-hidden>{shown ?? text}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}

function CountUp({ value, delay, animate }: { value: number; delay: number; animate: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      start ||= now;
      const t = Math.min(1, Math.max(0, (now - start - delay) / 900));
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, delay, animate]);
  return (
    <>
      <span aria-hidden className="tabular-nums">
        +{(animate ? shown : value).toLocaleString("en")}
      </span>
      <span className="sr-only">{value.toLocaleString("en")}</span>
    </>
  );
}

type ArtSize = "slot" | "card" | "large";
const AVATAR: Record<ArtSize, string> = { slot: "size-9 text-xs", card: "size-[4.5rem] text-lg", large: "size-32 text-3xl sm:size-36" };
const FRAME: Record<ArtSize, string> = { slot: "w-[1.6rem]", card: "w-[4.1rem]", large: "w-[6.5rem] sm:w-[7.5rem]" };
const BADGE: Record<ArtSize, string> = { slot: "size-8", card: "size-16", large: "size-28" };
const MEDAL: Record<ArtSize, number> = { slot: 34, card: 68, large: 132 };

/** The reward itself, worn by the account's own avatar and covers where that applies. */
export function RewardArt({ id, size, looks, motion = "off" }: { id: string; size: ArtSize; looks: VaultLooks; motion?: MotionLevel }) {
  const { profile, samples } = looks;
  const achievement = rewardAchievement(id);
  if (achievement) return <AchievementBadge achievement={achievement} earned size={MEDAL[size]} motion={size === "large" && motion !== "off" ? "reveal" : undefined} />;
  if (isAvatarDecorationId(id)) return <ProfileAvatar name={profile.name} src={profile.avatarUrl} decoration={id} className={AVATAR[size]} />;
  if (isShopFrameId(id)) {
    return (
      <span className="flex items-end justify-center gap-4">
        <ArtworkFrame frame={id} className={FRAME[size]}>
          <SampleArt sample={samples.portrait} shape="portrait" />
        </ArtworkFrame>
        {size === "large" ? (
          <ArtworkFrame frame={id} className="w-[8rem] sm:w-[9rem]">
            <SampleArt sample={samples.square} shape="square" />
          </ArtworkFrame>
        ) : null}
      </span>
    );
  }
  if (isProfileBadgeId(id)) return <BadgeEmblem badge={id} className={BADGE[size]} />;
  if (isProfileTitleId(id)) {
    if (size === "slot") return <span className="vx-slot-plate">Title</span>;
    return (
      <span className="vx-nameplate" data-size={size}>
        <ProfileAvatar name={profile.name} src={profile.avatarUrl} className={size === "large" ? "size-12 text-base" : "size-8 text-xs"} />
        <span className="min-w-0">
          <span className="vx-nameplate-name">{profile.name ?? "You"}</span>
          <ProfileFlair badge={null} title={id} />
        </span>
      </span>
    );
  }
  const game = gameCosmetic(id);
  if (game) {
    if (size === "slot") return <Gamepad2 className="size-5" />;
    return (
      <span className="vx-game-art" data-size={size}>
        <Suspense fallback={<Gamepad2 aria-hidden className="size-8" />}>
          <CosmeticPreview game={game.game} look={{ [game.category]: game.slug }} focus={game.category} effects={size === "large" ? motion : "off"} />
        </Suspense>
      </span>
    );
  }
  return <Sparkles className={size === "slot" ? "size-5" : "size-10"} />;
}

function CoinArt({ size }: { size: ArtSize }) {
  return (
    <span className="vx-coin" data-size={size}>
      <Coins />
    </span>
  );
}

function Tag({ fresh, achievement }: { fresh: boolean; achievement: boolean }) {
  return (
    <span className="vx-tag" data-muted={fresh ? undefined : ""}>
      {fresh ? "New" : achievement ? "Already unlocked" : "Already owned"}
    </span>
  );
}

/**
 * What a code granted, slot by slot, exactly as the server confirmed it. `newItems` marks which
 * items were new to the account; leave it out when that isn't known.
 */
export function RewardSlots({ coins, items, newItems, delay, countUp, looks }: { coins: number; items: string[]; newItems?: string[]; delay: number; countUp: boolean; looks: VaultLooks }) {
  const wearable = items.some((id) => ["avatar_decoration", "badge", "title"].includes(rewardInfo(id).kind));
  const offset = coins > 0 ? 1 : 0;
  const slot = (index: number) => ({ "--i": index, "--d": `${delay}ms` }) as CSSProperties;
  return (
    <>
      <ul className="vx-rewards">
        {coins > 0 ? (
          <li className="vx-slot" style={slot(0)}>
            <span aria-hidden className="vx-slot-art">
              <CoinArt size="slot" />
            </span>
            <span className="min-w-0">
              <span className="vx-slot-kind">Coins</span>
              <span className="vx-slot-name vx-slot-coins">
                <CountUp value={coins} delay={delay} animate={countUp} />
              </span>
              <span className="vx-slot-desc">Added to your Arcade wallet.</span>
            </span>
          </li>
        ) : null}
        {items.map((id, index) => {
          const info = rewardInfo(id);
          return (
            <li key={id} className="vx-slot" style={slot(index + offset)}>
              <span aria-hidden className="vx-slot-art">
                <RewardArt id={id} size="slot" looks={looks} />
              </span>
              <span className="min-w-0">
                <span className="vx-slot-kind">{kindLabel(info)}</span>
                <span className="vx-slot-name">
                  {info.name}
                  {newItems ? <Tag fresh={newItems.includes(id)} achievement={info.kind === "achievement"} /> : null}
                </span>
                <span className="vx-slot-desc">{info.description}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {wearable || coins > 0 ? (
        <p className="vx-links" style={{ "--d": `${delay + (items.length + offset) * 120 + 200}ms` } as CSSProperties}>
          {wearable ? (
            <Link href="/customization/profile" className="vx-link">
              Wear it in your profile <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : null}
          {coins > 0 ? (
            <Link href="/arcade/shop" className="vx-link">
              Visit the shop <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : null}
        </p>
      ) : null}
    </>
  );
}

const COINS = "coins";

/** Where each kind of reward is put to use. */
function rewardLink(id: string): { href: string; label: string } {
  if (id === COINS) return { href: "/arcade/shop", label: "Spend them in the shop" };
  const info = rewardInfo(id);
  if (info.game) return { href: shopHref(info.game.game), label: `Use it in ${GAME_SHOPS[info.game.game].title}` };
  if (info.kind === "achievement") return { href: "/achievements", label: "See your achievements" };
  if (info.kind === "frame") return { href: "/settings/frames", label: "Use this frame" };
  return { href: "/customization/profile", label: "Wear it in your profile" };
}

/**
 * The confirmed rewards rising out of the open vault as cards. Each can be inspected up close;
 * Continue keeps the result on the panel. Only ever shown for a grant the server confirmed.
 */
export function RewardReveal({
  coins,
  items,
  newItems,
  looks,
  motion,
  origin,
  titleDelay,
  delay,
  onContinue,
}: {
  coins: number;
  items: string[];
  newItems?: string[];
  looks: VaultLooks;
  motion: MotionLevel;
  /** The vault's core: cards fly out of it. */
  origin: () => RevealOrigin;
  /** When the heading resolves, and when the cards fly. */
  titleDelay: number;
  delay: number;
  onContinue: () => void;
}) {
  const [inspecting, setInspecting] = useState<string | null>(null);
  // Once a card has been opened the fly-out has done its job; don't replay it on the way back.
  const [settled, setSettled] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const detail = useRef<HTMLHeadingElement>(null);
  const lastCard = useRef<string | null>(null);
  const rewards = [...(coins > 0 ? [COINS] : []), ...items];
  const total = rewards.length;

  // Each card starts deep inside the vault's core and travels forward through the same perspective
  // as the 3D scene. Layout offsets ignore the running animation, so the measure is exact.
  const readOrigin = useEffectEvent(origin);
  useLayoutEffect(() => {
    const ul = list.current;
    if (!ul) return;
    const from = readOrigin();
    const box = ul.getBoundingClientRect();
    const cards = [...ul.querySelectorAll<HTMLElement>("[data-card]")].map((card) => {
      const base = card.offsetParent === ul ? 0 : ul.offsetLeft;
      const top = card.offsetParent === ul ? 0 : ul.offsetTop;
      return { card, x: box.left + card.offsetLeft - base + card.offsetWidth / 2, y: box.top + card.offsetTop - top + card.offsetHeight / 2 };
    });
    ul.style.perspective = `${Math.round(from.perspective)}px`;
    ul.style.perspectiveOrigin = `${Math.round(from.axisX - box.left)}px ${Math.round(from.axisY - box.top)}px`;
    for (const { card, x, y } of cards) {
      card.style.setProperty("--fx", `${Math.round(from.x - x)}px`);
      card.style.setProperty("--fy", `${Math.round(from.y - y)}px`);
      card.style.setProperty("--fz", `${Math.round(from.z)}px`);
    }
  }, []);

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
      className="vx-reveal"
      aria-labelledby="vx-reveal-title"
      data-settled={settled || undefined}
      onKeyDown={onKeyDown}
      style={{ "--d": `${delay}ms`, "--stagger": `${CARD_STAGGER}ms` } as CSSProperties}
    >
      <header className="vx-reveal-head">
        <p className="vx-eyebrow">Seal broken</p>
        <h2 id="vx-reveal-title" ref={heading} tabIndex={-1} className="vx-headline">
          <DecodeText text={total === 1 ? "A reward recovered" : `${total} rewards recovered`} animate={motion === "full"} delay={titleDelay} />
        </h2>
        <p className="vx-reveal-sub">{shown ? "Up close." : "They’re on your account now. Choose one to look closer."}</p>
      </header>

      <ul ref={list} className="vx-cards" data-count={Math.min(total, 3)} hidden={shown !== null}>
        {rewards.map((id, index) => {
          const isNew = fresh(id);
          return (
            <li key={id} data-card style={{ "--i": index } as CSSProperties}>
              <button
                type="button"
                className="vx-card"
                data-id={id}
                onClick={() => {
                  lastCard.current = id;
                  setSettled(true);
                  setInspecting(id);
                }}
              >
                <span aria-hidden className="vx-card-art">
                  {id === COINS ? <CoinArt size="card" /> : <RewardArt id={id} size="card" looks={looks} />}
                </span>
                <span className="vx-card-kind">{label(id)}</span>
                <span className="vx-card-name">{id === COINS ? <CountUp value={coins} delay={delay + index * CARD_STAGGER} animate={motion !== "off"} /> : name(id)}</span>
                {isNew === null ? null : <Tag fresh={isNew} achievement={id.startsWith(ACHIEVEMENT_PREFIX)} />}
              </button>
            </li>
          );
        })}
      </ul>

      {shown && link ? (
        <div className="vx-inspect" role="group" aria-labelledby="vx-inspect-title">
          <div aria-hidden className="vx-inspect-art">
            {shown === COINS ? <CoinArt size="large" /> : <RewardArt id={shown} size="large" looks={looks} motion={motion} />}
          </div>
          <div className="vx-inspect-copy">
            <p className="vx-slot-kind">{label(shown)}</p>
            <h3 id="vx-inspect-title" ref={detail} tabIndex={-1} className="vx-inspect-name">
              {name(shown)}
            </h3>
            {fresh(shown) === null ? null : <Tag fresh={fresh(shown) === true} achievement={shown.startsWith(ACHIEVEMENT_PREFIX)} />}
            <p className="vx-slot-desc">{shown === COINS ? "Added to your Arcade wallet, ready for the shop." : rewardInfo(shown).description}</p>
            <Link href={link.href} className="vx-link">
              {link.label} <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </div>
        </div>
      ) : null}

      <div className="vx-actions">
        {shown ? (
          <button type="button" className="vx-button" onClick={close}>
            <ArrowLeft aria-hidden className="size-4" />
            All rewards
          </button>
        ) : null}
        <button type="button" className="vx-button" data-variant="primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </section>
  );
}
