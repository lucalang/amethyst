"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { Coins } from "lucide-react";
import { ACHIEVEMENT_PREFIX, kindLabel, RewardArt, rewardInfo, rewardSummary, type VaultLooks } from "@/components/vault/vault-reveal";
import { STATUS_LABEL, type AdminCode, type CodeStatus } from "@/lib/vault-admin";

/** The admin panel's black-and-crimson console. */
export function AdminStage({ children }: { children: ReactNode }) {
  return (
    <div className="ax-stage">
      <div aria-hidden className="ax-backdrop" />
      <div className="ax-inner">{children}</div>
    </div>
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
    <span className="ax-pill" data-status={status}>
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
