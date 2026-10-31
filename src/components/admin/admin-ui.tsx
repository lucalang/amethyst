"use client";

import "./admin.css";
import type { CSSProperties, ReactNode, Ref } from "react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";
import { Coins } from "lucide-react";
import { ACHIEVEMENT_PREFIX, kindLabel, RewardArt, rewardInfo, rewardSummary, type VaultLooks } from "@/components/vault/vault-reveal";
import { STATUS_LABEL, type AdminCode, type CodeStatus } from "@/lib/vault-admin";
import { useConsoleSide } from "./admin-console";
import { displayFont, systemFont } from "./system-font";

/** Class for admin surfaces portaled outside the console (dialogs). */
export const adminDialogClass = cn("ax-dialog", systemFont.variable, displayFont.variable);

/**
 * One screen of the System window: a heading row, the main column scrolling inside the window and an
 * optional action bar pinned to its bottom edge. The side column (status, steps) floats in its own
 * window beside it on wide screens and stacks above the main column otherwise.
 */
export function ConsoleView({
  eyebrow,
  title,
  lede,
  back,
  actions,
  aside,
  asideLabel,
  footer,
  mainKey,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  back?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  asideLabel?: string;
  footer?: ReactNode;
  mainKey?: string | number;
  children: ReactNode;
}) {
  const side = useConsoleSide();
  const asideNode = aside ? (
    <aside className="ax-view-aside" aria-label={asideLabel}>
      {aside}
    </aside>
  ) : null;
  return (
    <div className="ax-view" data-aside={asideNode && !side ? "" : undefined}>
      <header className="ax-view-head">
        <div className="min-w-0">
          {back}
          <p className="ax-eyebrow">{eyebrow}</p>
          <h1 className="ax-title">{title}</h1>
          {lede ? <p className="ax-lede">{lede}</p> : null}
        </div>
        {actions ? <div className="ax-head-actions">{actions}</div> : null}
      </header>
      <div className="ax-view-body">
        {side ? null : asideNode}
        <div key={mainKey} className="ax-view-main">
          {children}
        </div>
      </div>
      {footer ? <div className="ax-view-foot">{footer}</div> : null}
      {side && asideNode ? createPortal(asideNode, side) : null}
    </div>
  );
}

/** A system pane inside the console: a heading with its rule and count, then the content. */
export function SystemWindow({
  id,
  title,
  count,
  order = 0,
  tone,
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
  headingRef?: Ref<HTMLHeadingElement>;
  motion?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("ax-window", className)} data-tone={tone} data-motion={motion} aria-labelledby={id} style={{ "--ax-order": order } as CSSProperties}>
      <div className="ax-window-head">
        <h2 id={id} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="ax-window-title">
          {title}
        </h2>
        {count !== undefined ? <span className="ax-window-count">{count}</span> : null}
      </div>
      <div className="ax-window-body">{children}</div>
    </section>
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
