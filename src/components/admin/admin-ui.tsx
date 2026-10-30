"use client";

import "./admin.css";
import type { CSSProperties, ReactNode, Ref } from "react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "cn";
import { Coins } from "lucide-react";
import { ACHIEVEMENT_PREFIX, kindLabel, RewardArt, rewardInfo, rewardSummary, type VaultLooks } from "@/components/vault/vault-reveal";
import { STATUS_LABEL, type AdminCode, type CodeStatus } from "@/lib/vault-admin";
import { systemFont } from "./system-font";

/** Class for admin surfaces portaled outside the stage (dialogs). */
export const adminDialogClass = cn("ax-dialog", systemFont.variable);

/**
 * The admin panel's system-window stage. Only the decorative depth layers follow the pointer;
 * windows and controls never move under it. CSS turns the parallax off with motion.
 */
export function AdminStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = ref.current;
    if (!stage || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const move = (event: PointerEvent) => {
      x = (event.clientX / window.innerWidth) * 2 - 1;
      y = (event.clientY / window.innerHeight) * 2 - 1;
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        stage.style.setProperty("--ax-px", x.toFixed(3));
        stage.style.setProperty("--ax-py", y.toFixed(3));
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={cn("ax-stage", systemFont.variable)}>
      <div aria-hidden className="ax-backdrop">
        <span className="ax-depth" data-depth="far" />
        <span className="ax-depth" data-depth="mid" />
        <span className="ax-depth" data-depth="near" />
      </div>
      <div className="ax-inner">{children}</div>
    </div>
  );
}

/**
 * A system window: luminous edge rails, a framed title tab and staggered content. `order`
 * staggers windows that open together.
 */
export function SystemWindow({
  id,
  title,
  count,
  order = 0,
  tone,
  level = 2,
  headingRef,
  motion,
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  count?: ReactNode;
  order?: number;
  tone?: "draft";
  level?: 1 | 2;
  headingRef?: Ref<HTMLHeadingElement>;
  motion?: string;
  className?: string;
  children: ReactNode;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <section className={cn("ax-window", className)} data-tone={tone} data-motion={motion} aria-labelledby={id} style={{ "--ax-order": order } as CSSProperties}>
      <span aria-hidden className="ax-rail" data-edge="top" />
      <span aria-hidden className="ax-rail" data-edge="bottom" />
      <div className="ax-window-head">
        <Heading id={id} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="ax-window-title">
          {title}
          {count !== undefined ? <span className="ax-window-count">{count}</span> : null}
        </Heading>
      </div>
      <div className="ax-window-body">{children}</div>
    </section>
  );
}

export function AdminHeader({ eyebrow, title, lede, actions }: { eyebrow: string; title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ax-head">
      <div className="min-w-0">
        <p className="ax-eyebrow">{eyebrow}</p>
        <h1 className="ax-title">{title}</h1>
        {lede ? <p className="ax-lede">{lede}</p> : null}
      </div>
      {actions ? <div className="ax-head-actions">{actions}</div> : null}
    </header>
  );
}

export function StatusPill({ status }: { status: CodeStatus }) {
  return (
    <span className="ax-tag" data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const subscribeMinute = (onChange: () => void) => {
  const id = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(id);
};
const nowMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

/** The current minute; the server's time until hydration so statuses render the same on both. */
export function useNow(serverNow: number) {
  return useSyncExternalStore(subscribeMinute, nowMinute, () => serverNow);
}

const noSubscribe = () => () => {};
/** The device's time zone (null while rendering on the server). */
export function useTimeZone() {
  return useSyncExternalStore(noSubscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => null);
}

export const formatWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function When({ iso, fallback = "—" }: { iso: string | null; fallback?: string }) {
  if (!iso) return <>{fallback}</>;
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {formatWhen(iso)}
    </time>
  );
}

export const codeRewards = (code: Pick<AdminCode, "coins" | "items" | "achievements">) =>
  rewardSummary(code.coins, [...code.items, ...code.achievements.map((id) => `${ACHIEVEMENT_PREFIX}${id}`)]);

/** Each reward with its real preview: coins, cosmetics, then achievements. */
export function RewardTiles({ coins, items, achievements, looks }: { coins: number; items: string[]; achievements: string[]; looks: VaultLooks }) {
  const ids = [...items, ...achievements.map((id) => `${ACHIEVEMENT_PREFIX}${id}`)];
  return (
    <ul className="ax-tiles">
      {coins > 0 ? (
        <li className="ax-tile">
          <span aria-hidden className="ax-tile-art">
            <span className="vx-coin" data-size="slot">
              <Coins />
            </span>
          </span>
          <span className="min-w-0">
            <span className="ax-tile-kind">Coins</span>
            <span className="ax-tile-name">{coins.toLocaleString("en")}</span>
          </span>
        </li>
      ) : null}
      {ids.map((id) => {
        const info = rewardInfo(id);
        return (
          <li key={id} className="ax-tile">
            <span aria-hidden className="ax-tile-art">
              <RewardArt id={id} size="slot" looks={looks} />
            </span>
            <span className="min-w-0">
              <span className="ax-tile-kind">{kindLabel(info)}</span>
              <span className="ax-tile-name">{info.name}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function audienceSummary(code: Pick<AdminCode, "audience" | "allowlistCount" | "perAccountLimit">) {
  const who = code.audience === "allowlist" ? `${code.allowlistCount} listed account${code.allowlistCount === 1 ? "" : "s"}` : "All signed-in accounts";
  return `${who} · ${code.perAccountLimit === 1 ? "once per account" : `up to ${code.perAccountLimit}× per account`}`;
}
