"use client";

import "./admin.css";
import type { ReactNode, Ref } from "react";
import { useSyncExternalStore } from "react";
import { cn } from "cn";
import { ArrowLeft, Coins } from "lucide-react";
import { ACHIEVEMENT_PREFIX, kindLabel, RewardArt, rewardInfo, rewardSummary, type VaultLooks } from "@/components/vault/vault-reveal";
import { STATUS_LABEL, type AdminCode, type CodeStatus } from "@/lib/vault-admin";
import { ConsoleLink } from "./admin-console";
import { displayFont, systemFont } from "./system-font";

/** Class for admin surfaces portaled outside the console (dialogs). */
export const adminDialogClass = cn("ax-dialog", systemFont.variable, displayFont.variable);

/**
 * One state of the System window: the framed title strip (back sigil, eyebrow and title), optional
 * lede and meta line, the body scrolling inside the window and an action bar pinned to its bottom
 * edge. `size` sets the window's width; its height follows the content up to the stage.
 */
export function ConsoleView({
  eyebrow,
  title,
  lede,
  back,
  meta,
  footer,
  size = "full",
  headingRef,
  mainKey,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  back?: { href: string; label: string };
  meta?: ReactNode;
  footer?: ReactNode;
  size?: "compact" | "medium" | "full";
  headingRef?: Ref<HTMLHeadingElement>;
  mainKey?: string | number;
  children: ReactNode;
}) {
  return (
    <div className="ax-view" data-size={size}>
      <header className="ax-head">
        <div className="ax-head-strip">
          {back ? (
            <ConsoleLink href={back.href} className="ax-sigil" aria-label={back.label} title={back.label}>
              <ArrowLeft aria-hidden className="size-4" />
            </ConsoleLink>
          ) : (
            <span aria-hidden className="ax-sigil" data-mark="" />
          )}
          <div className="ax-plate">
            <p className="ax-eyebrow">{eyebrow}</p>
            <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="ax-title">
              {title}
            </h1>
          </div>
        </div>
        {lede ? <p className="ax-lede">{lede}</p> : null}
        {meta ? <div className="ax-head-meta">{meta}</div> : null}
      </header>
      <div key={mainKey} className="ax-view-body">
        {children}
      </div>
      {footer ? <div className="ax-view-foot">{footer}</div> : null}
    </div>
  );
}

/** A section of the window's body: a ruled heading with an optional count, then the content. */
export function Pane({
  id,
  title,
  count,
  tone,
  headingRef,
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  count?: ReactNode;
  tone?: "draft";
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("ax-pane", className)} data-tone={tone} aria-labelledby={id}>
      <div className="ax-pane-head">
        <h2 id={id} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="ax-pane-title">
          {title}
        </h2>
        {count !== undefined ? <span className="ax-pane-count">{count}</span> : null}
      </div>
      {children}
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
