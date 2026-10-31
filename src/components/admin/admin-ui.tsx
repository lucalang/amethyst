"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CODE_STATUS, type CodeStatus } from "@/lib/vault-admin";
import { sanctumFont } from "./admin-font";

/* A shared one-second clock for countdowns, so many tablets use one interval. */
const listeners = new Set<() => void>();
let ticker = 0;
let current = 0;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!ticker) {
    current = Date.now();
    ticker = window.setInterval(() => {
      current = Date.now();
      for (const item of listeners) item();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.clearInterval(ticker);
      ticker = 0;
    }
  };
}
export const useNow = (fallback: number) => useSyncExternalStore(subscribe, () => current || fallback, () => fallback);

const noop = () => () => {};
/** False on the server and during hydration: panel content (dates, portals) renders only in the browser. */
export const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

const WHEN = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
export const formatWhen = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : "—");
export const formatDay = (day: string) => DAY.format(new Date(`${day}T12:00:00`));
export const number = (value: number) => value.toLocaleString("en");
export const plural = (count: number, word: string, many = `${word}s`) => `${number(count)} ${count === 1 ? word : many}`;

/** "3d 4h", "2h 05m", "4m 09s". */
export function countdown(ms: number) {
  if (ms <= 0) return "now";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function timeAgo(iso: string, now: number) {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 86_400 * 7) return plural(Math.floor(seconds / 86_400), "day") + " ago";
  return formatWhen(iso);
}

/** An ISO time as the value of a datetime-local input (local time), and back. */
export function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function fromLocalInput(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
/** A whole number typed into a field, or null when empty or not a number. */
export function wholeNumber(value: string) {
  const trimmed = value.replace(/[\s,_]/g, "");
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Counts up to `value` (once per change); static when motion is off. */
export function CountUp({ value, animate, delay = 0 }: { value: number; animate: boolean; delay?: number }) {
  const [shown, setShown] = useState(0);
  const latest = useRef(0);
  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    let start = 0;
    const from = latest.current;
    const step = (now: number) => {
      if (!start) start = now + delay;
      const k = Math.min(1, Math.max(0, (now - start) / 1300));
      const next = Math.round(from + (value - from) * (1 - (1 - k) ** 4));
      latest.current = next;
      setShown(next);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, animate, delay]);
  return (
    <span className="tabular-nums" data-no-decode>
      {number(animate ? shown : value)}
    </span>
  );
}

export function Field({ id, label, hint, error, children, className }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={`cs-field ${className ?? ""}`} data-invalid={error ? "" : undefined}>
      <label htmlFor={id} className="cs-label">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="cs-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="cs-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** aria-describedby for a Field's control. */
export const describedBy = (id: string, hint: boolean, error: unknown) => [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;

export function ConfirmAction({
  trigger,
  title,
  description,
  confirm,
  onConfirm,
  danger = false,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirm: string;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className={`cs-dialog ${sanctumFont.variable}`}>
        <AlertDialogHeader>
          <AlertDialogTitle className="cs-dialog-title">{title}</AlertDialogTitle>
          <AlertDialogDescription className="cs-dialog-text">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cs-button" variant="ghost">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction className={danger ? "cs-button cs-button-danger" : "cs-button cs-button-primary"} onClick={onConfirm}>
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function StatusBadge({ status }: { status: CodeStatus }) {
  return (
    <span className="cs-status" data-status={status} title={CODE_STATUS[status].hint}>
      <span aria-hidden className="cs-status-dot" />
      {CODE_STATUS[status].label}
    </span>
  );
}

export const ACTION_LABEL: Record<string, string> = { publish: "Published", disable: "Disabled", enable: "Re-enabled", update: "Edited" };
export const FIELD_LABEL: Record<string, string> = {
  label: "label",
  coins: "coins",
  items: "cosmetics",
  achievements: "achievements",
  startsAt: "start",
  expiresAt: "expiry",
  maxRedemptions: "total limit",
  perAccountLimit: "per-account limit",
  audience: "audience",
  allowlist: "allowlist",
};
export const accountName = (account: { name: string | null; email: string | null } | null | undefined) => account?.name || account?.email || "Unknown account";

/** In-app navigation without a page load (the scene keeps running and flies to the next view). */
const NavigateContext = createContext<(href: string) => void>(() => {});
export const NavigateProvider = NavigateContext.Provider;
export const useNavigate = () => useContext(NavigateContext);

export function NavLink({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  const navigate = useNavigate();
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(href);
      }}
    />
  );
}

/** A small engraved heading row for panels. */
export function PanelHead({ title, kicker, id, children }: { title: string; kicker?: string; id?: string; children?: ReactNode }) {
  return (
    <header className="cs-head">
      <div className="min-w-0">
        {kicker ? <p className="cs-kicker">{kicker}</p> : null}
        <h2 id={id} className="cs-title">
          {title}
        </h2>
      </div>
      {children ? <div className="cs-head-actions">{children}</div> : null}
    </header>
  );
}
