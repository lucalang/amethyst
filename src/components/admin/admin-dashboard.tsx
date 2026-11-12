"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Clock, Coins, Crown, LayoutDashboard, Loader2, PackageOpen, RefreshCw, ScrollText, Search, ShieldCheck, Sparkles, UserMinus, UserPlus, Users, X } from "lucide-react";
import { SlotSymbol, symbolName } from "@/components/arcade/slots/symbols";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { dashboardSchema, type AdminDashboardState, type AdminRole, type DashboardAccount, type OverrideStatus } from "@/lib/admin-dashboard";
import { describeItem, inventoryItemLabel } from "@/lib/inventory";
import { lootCaseInfo } from "@/lib/lootboxes";
import { RARITIES, isRarity } from "@/lib/rarities";
import { createRequestId } from "@/lib/request-id";
import { winningRule } from "@/lib/slots";
import type { AdminAccount } from "@/lib/vault-admin";
import { countdown, plural, useNow } from "./admin-ui";
import "./admin-dashboard.css";

/** A confirmation with its own key, so a retry from the same dialog reuses the same request id. */
type Confirm = { key: string; title: string; body: ReactNode; label: string; destructive?: boolean; run: () => Promise<string> };
type Ask = (confirm: Omit<Confirm, "key">) => void;
type Machine = NonNullable<AdminDashboardState["machine"]>;
type CaseItem = AdminDashboardState["cases"][number]["items"][number];
type Account = DashboardAccount | AdminAccount;

const WHEN = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const when = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : "—");
const who = (account: Account | null, fallback = "Unknown account") => account?.name?.trim() || account?.email || (account ? account.id : fallback);
const itemName = (id: string) => describeItem(id)?.name ?? id;
const itemType = (id: string) => {
  const item = describeItem(id);
  return item ? inventoryItemLabel(item) : "Cosmetic";
};
const rarityLabel = (rarity: string | null | undefined) => (rarity && isRarity(rarity) ? RARITIES[rarity].label : (rarity ?? "—"));
const rarityColor = (rarity: string | null | undefined) => (rarity && isRarity(rarity) ? RARITIES[rarity].color : "var(--muted-foreground)");
const same = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const message = (error: unknown) => (error instanceof ApiError ? error.message : "Something went wrong. Nothing was changed.");

const ROLE_LABEL: Record<AdminRole, string> = { owner: "Owner", admin: "Admin" };
const STATUS_LABEL: Record<OverrideStatus, string> = { queued: "Queued", consumed: "Used", expired: "Expired", cancelled: "Cancelled" };
const ACTION_LABEL: Record<string, string> = {
  admin_grant: "granted admin access",
  admin_role_change: "changed an admin role",
  admin_revoke: "revoked admin access",
  loot_override_create: "queued a Lootbox override",
  loot_override_cancel: "cancelled a Lootbox override",
  loot_override_use: "used a Lootbox override",
  slot_override_create: "queued a Coin Slots override",
  slot_override_cancel: "cancelled a Coin Slots override",
  slot_override_use: "used a Coin Slots override",
};
const AUDIT_FILTERS = [
  { id: "all", label: "All" },
  { id: "admin", label: "Access" },
  { id: "loot", label: "Lootbox" },
  { id: "slot", label: "Coin Slots" },
] as const;

/** The same win tiers as the machine, so the preview names a win the way the reels will. */
function slotTier(multiplier: number, top: number) {
  if (multiplier <= 0) return { key: "none", label: "No win" };
  if (multiplier >= top) return { key: "jackpot", label: "Jackpot" };
  if (multiplier >= 40) return { key: "mega", label: "Mega win" };
  if (multiplier >= 20) return { key: "big", label: "Big win" };
  if (multiplier >= 8) return { key: "win", label: "Nice win" };
  return { key: "small", label: "Win" };
}

/** One reachable outcome for every paytable line (best first), plus a losing one. */
function slotPresets(machine: Machine, choices: string[][]) {
  const combos: string[][] = [];
  for (const a of choices[0] ?? []) for (const b of choices[1] ?? []) for (const c of choices[2] ?? []) combos.push([a, b, c]);
  const presets: { key: string; picks: string[]; pays: number; label: string }[] = [];
  for (const rule of [...machine.paytable].sort((x, y) => y.pays - x.pays)) {
    const picks = combos.find((combo) => {
      const hit = winningRule(machine.paytable, combo);
      return hit?.symbol === rule.symbol && hit.count === rule.count;
    });
    if (picks) presets.push({ key: `${rule.symbol}-${rule.count}`, picks, pays: rule.pays, label: `${rule.count} × ${symbolName(rule.symbol)}` });
  }
  const miss = combos.find((combo) => !winningRule(machine.paytable, combo));
  if (miss) presets.push({ key: "miss", picks: miss, pays: 0, label: "No win" });
  return presets;
}

function Avatar({ account, id }: { account: Account | null; id: string }) {
  const label = who(account).split("@")[0];
  const initials =
    label
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?";
  let hue = 0;
  for (const char of id) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  return (
    <span aria-hidden className="ad-avatar" style={{ "--hue": hue } as CSSProperties}>
      {initials}
    </span>
  );
}

function StatusPill({ status }: { status: OverrideStatus }) {
  return (
    <span className="ad-pill" data-status={status}>
      <span className="ad-pill-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function RarityPill({ rarity }: { rarity: string | null }) {
  return (
    <span className="ad-pill ad-rarity" style={{ "--rarity": rarityColor(rarity) } as CSSProperties}>
      {rarityLabel(rarity)}
    </span>
  );
}

function MiniSymbols({ symbols, size = "size-5" }: { symbols: string[]; size?: string }) {
  return (
    <span className="ad-mini-symbols" aria-label={symbols.map(symbolName).join(", ")}>
      {symbols.map((symbol, i) => (
        <SlotSymbol key={i} id={symbol} className={size} />
      ))}
    </span>
  );
}

function Payline({ symbols, hit, multiplier, top, size = "size-10" }: { symbols: string[]; hit?: string | null; multiplier: number; top: number; size?: string }) {
  const tier = slotTier(multiplier, top);
  return (
    <div className="ad-payline" data-tier={tier.key}>
      <div className="ad-payline-cells">
        {symbols.map((symbol, i) => (
          <span key={i} className="ad-payline-cell" data-hit={(hit && symbol === hit) || undefined}>
            <SlotSymbol id={symbol} className={size} />
          </span>
        ))}
      </div>
      <div className="ad-payout">
        <span className="ad-payout-mult">×{multiplier}</span>
        <span className="ad-payout-tier">{tier.label}</span>
      </div>
    </div>
  );
}

function Panel({ title, description, icon, actions, children }: { title: string; description?: string; icon: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="ad-panel">
      <header className="ad-panel-head">
        <span className="ad-panel-icon">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="ad-panel-title">{title}</h2>
          {description ? <p className="ad-panel-desc">{description}</p> : null}
        </div>
        {actions ? <div className="ad-panel-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function AdminDashboard({ initial }: { initial: AdminDashboardState }) {
  const [state, setState] = useState(initial);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const owner = state.me.role === "owner";
  const overrides = [...state.loot, ...state.slots];
  const queued = overrides.filter((row) => row.status === "queued").length;
  const used = overrides.filter((row) => row.status === "consumed").length;
  const owners = state.admins.filter((admin) => admin.role === "owner").length;

  async function refresh(quiet = false) {
    setRefreshing(true);
    try {
      const parsed = dashboardSchema.safeParse(await apiFetch<unknown>("/api/admin/dashboard"));
      if (!parsed.success) throw new Error("unreadable");
      setState(parsed.data);
    } catch {
      if (!quiet) toast.error("The dashboard couldn’t refresh. Reload to see the latest state.");
    } finally {
      setRefreshing(false);
    }
  }

  const ask: Ask = (next) => setConfirm({ ...next, key: createRequestId() });

  const stats = [
    { key: "admins", label: "Admins", value: state.admins.length, note: plural(owners, "owner"), icon: <Users aria-hidden className="size-4" />, tone: undefined },
    { key: "queued", label: "Queued overrides", value: queued, note: queued ? "waiting for your next attempt" : "nothing queued", icon: <Clock aria-hidden className="size-4" />, tone: queued ? "queued" : undefined },
    { key: "used", label: "Overrides used", value: used, note: "among your recent overrides", icon: <Sparkles aria-hidden className="size-4" />, tone: undefined },
    { key: "audit", label: "Audit entries", value: state.audit.length, note: state.audit[0] ? `latest ${when(state.audit[0].createdAt)}` : "nothing recorded yet", icon: <ScrollText aria-hidden className="size-4" />, tone: undefined },
  ];

  return (
    <div className="ad-root">
      <header className="ad-hero">
        <span className="ad-hero-mark">
          <LayoutDashboard aria-hidden className="size-6" />
        </span>
        <div className="ad-hero-title">
          <h1>Admin Dashboard</h1>
          <p>
            Signed in as {who(state.me.account)}
            <span className="ad-pill" data-role={state.me.role}>
              {state.me.role === "owner" ? <Crown aria-hidden className="size-3" /> : <ShieldCheck aria-hidden className="size-3" />}
              {ROLE_LABEL[state.me.role]}
            </span>
          </p>
        </div>
        <div className="ad-hero-actions">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? <Loader2 aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
            Refresh
          </Button>
          <Button asChild size="sm">
            <Link href="/admin">
              Code Admin
              <ArrowUpRight aria-hidden />
            </Link>
          </Button>
        </div>
      </header>

      <div className="ad-stats">
        {stats.map((stat) => (
          <div key={stat.key} className="ad-stat" data-tone={stat.tone}>
            <p className="ad-label">{stat.label}</p>
            <span className="ad-stat-icon">{stat.icon}</span>
            <p className="ad-stat-value">{stat.value.toLocaleString("en")}</p>
            <p className="ad-stat-note" suppressHydrationWarning>
              {stat.note}
            </p>
          </div>
        ))}
      </div>

      <div className="ad-grid">
        <LootOverridePanel state={state} ask={ask} />
        <SlotOverridePanel state={state} ask={ask} />
      </div>
      <div className="ad-grid ad-grid-split">
        <AdminAccess state={state} owner={owner} ask={ask} />
        <OverrideHistory state={state} />
      </div>
      <AuditLog state={state} />

      <ConfirmDialog key={confirm?.key ?? "none"} confirm={confirm} onClose={() => setConfirm(null)} onDone={() => void refresh(true)} />
    </div>
  );
}

function ConfirmDialog({ confirm, onClose, onDone }: { confirm: Confirm | null; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      toast.success(await confirm.run());
      onClose();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="grid gap-3 text-sm text-muted-foreground">{confirm?.body}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
          <Button variant={confirm?.destructive ? "destructive" : "default"} onClick={() => void run()} disabled={busy}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {error ? "Try again" : confirm?.label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* --------------------------------------------------------------------------- Overrides */

function QueuedCard({ createdAt, expiresAt, onCancel, children }: { createdAt: string; expiresAt: string; onCancel: () => void; children: ReactNode }) {
  const now = useNow(Date.parse(createdAt));
  const left = Date.parse(expiresAt) - now;
  return (
    <div className="ad-queued">
      <div className="ad-queued-head">
        <StatusPill status="queued" />
        <span className="ad-countdown" suppressHydrationWarning>
          <Clock aria-hidden className="size-3.5" />
          {left > 0 ? `expires in ${countdown(left)}` : "expiring"}
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={onCancel}>
          <X aria-hidden />
          Cancel
        </Button>
      </div>
      {children}
      <p className="ad-hint">Not applied yet. It waits for your next eligible attempt and is used exactly once.</p>
    </div>
  );
}

function cancelOverride(ask: Ask, kind: "loot" | "slots", id: string, summary: string) {
  ask({
    title: "Cancel this override?",
    label: "Cancel override",
    destructive: true,
    body: (
      <p>
        {summary} Your next {kind === "loot" ? "opening" : "spin"} uses the normal odds.
      </p>
    ),
    run: async () => {
      await apiFetch("/api/admin/dashboard/overrides/cancel", { method: "POST", json: { kind, id } });
      return "Override cancelled.";
    },
  });
}

function LootOverridePanel({ state, ask }: { state: AdminDashboardState; ask: Ask }) {
  const [caseId, setCaseId] = useState(state.cases[0]?.id ?? "");
  const [itemId, setItemId] = useState("");
  const [rarity, setRarity] = useState("all");
  const [query, setQuery] = useState("");
  const queued = state.loot.find((row) => row.status === "queued");
  const box = state.cases.find((entry) => entry.id === caseId);
  const pool: CaseItem[] = box?.items ?? [];
  const item = pool.find((entry) => entry.id === itemId);
  const rarities = [...new Set(pool.map((entry) => entry.rarity))];
  const term = query.trim().toLowerCase();
  const shown = pool.filter(
    (entry) => (rarity === "all" || entry.rarity === rarity) && (!term || itemName(entry.id).toLowerCase().includes(term) || itemType(entry.id).toLowerCase().includes(term)),
  );

  function pickCase(id: string) {
    setCaseId(id);
    setItemId("");
    setRarity("all");
  }

  function queue() {
    if (!box || !item) return;
    const id = createRequestId();
    const caseName = lootCaseInfo(box.id).name;
    ask({
      title: "Queue this Lootbox override?",
      label: "Queue override",
      body: (
        <>
          <dl className="ad-summary">
            <div>
              <dt>Case</dt>
              <dd>{caseName}</dd>
            </div>
            <div>
              <dt>Item</dt>
              <dd className="flex flex-wrap items-center gap-2">
                {itemName(item.id)} <RarityPill rarity={item.rarity} />
              </dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{itemType(item.id)}</dd>
            </div>
          </dl>
          <p>The first case of your own next {caseName} opening reveals this item. Case cost, ownership and refunds work as usual. It expires after 24 hours if unused.</p>
        </>
      ),
      run: async () => {
        await apiFetch("/api/admin/dashboard/overrides", { method: "POST", json: { kind: "loot", id, case: box.id, item: item.id } });
        setItemId("");
        return `Queued ${itemName(item.id)} for your next ${caseName}.`;
      },
    });
  }

  return (
    <Panel title="Next Lootbox opening" icon={<PackageOpen aria-hidden className="size-4" />} description="Pick the item your own next case opening reveals. Only you, only once; everyone else’s odds are unchanged.">
      {queued ? (
        <QueuedCard
          createdAt={queued.createdAt}
          expiresAt={queued.expiresAt}
          onCancel={() => cancelOverride(ask, "loot", queued.id, `${itemName(queued.item)} from ${lootCaseInfo(queued.case).name} won’t be applied.`)}
        >
          <div className="ad-pick" style={{ "--rarity": rarityColor(queued.rarity) } as CSSProperties}>
            <span className="ad-label">Your next {lootCaseInfo(queued.case).name} reveals</span>
            <p className="ad-pick-name">{itemName(queued.item)}</p>
            <p className="ad-pick-meta">
              <RarityPill rarity={queued.rarity} /> {itemType(queued.item)}
            </p>
          </div>
          <p className="ad-hint">Open it from Shop → Cases. The bulk-open tools don’t use overrides.</p>
        </QueuedCard>
      ) : state.cases.length === 0 ? (
        <p className="ad-empty">No case can be opened right now.</p>
      ) : (
        <>
          <div className="ad-step">
            <span className="ad-label">1 · Case</span>
            <div className="ad-cases">
              {state.cases.map((entry) => {
                const info = lootCaseInfo(entry.id);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="ad-case"
                    aria-pressed={entry.id === caseId}
                    onClick={() => pickCase(entry.id)}
                    style={{ "--hue": info.hue, "--glow": info.glow } as CSSProperties}
                  >
                    <span className="ad-case-name">{info.name}</span>
                    <span className="ad-case-meta">
                      {plural(entry.items.length, "item")}
                      {entry.available ? "" : " · not sold now"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ad-step">
            <span className="ad-label">2 · Item from this case’s pool</span>
            <div className="ad-search">
              <Search aria-hidden />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items" aria-label="Search items" />
            </div>
            <div className="ad-chips" role="group" aria-label="Filter by rarity">
              <button type="button" className="ad-chip" aria-pressed={rarity === "all"} onClick={() => setRarity("all")}>
                All <span className="ad-chip-count">{pool.length}</span>
              </button>
              {rarities.map((value) => (
                <button key={value} type="button" className="ad-chip" aria-pressed={rarity === value} onClick={() => setRarity(value)} style={{ "--rarity": rarityColor(value) } as CSSProperties}>
                  <span className="ad-chip-dot" />
                  {rarityLabel(value)} <span className="ad-chip-count">{pool.filter((entry) => entry.rarity === value).length}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="ad-empty">No item in this case matches.</p>
            ) : (
              <div className="ad-items" role="group" aria-label="Items">
                {shown.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="ad-item"
                    aria-pressed={entry.id === itemId}
                    onClick={() => setItemId(entry.id === itemId ? "" : entry.id)}
                    style={{ "--rarity": rarityColor(entry.rarity) } as CSSProperties}
                  >
                    <span className="ad-item-name">{itemName(entry.id)}</span>
                    <span className="ad-item-meta">
                      {rarityLabel(entry.rarity)} · {itemType(entry.id)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {item && box ? (
            <div className="ad-pick" key={item.id} style={{ "--rarity": rarityColor(item.rarity) } as CSSProperties}>
              <span className="ad-label">Your next {lootCaseInfo(box.id).name} would reveal</span>
              <p className="ad-pick-name">{itemName(item.id)}</p>
              <p className="ad-pick-meta">
                <RarityPill rarity={item.rarity} /> {itemType(item.id)}
              </p>
            </div>
          ) : null}
          <Button onClick={queue} disabled={!item}>
            {item ? "Review and queue" : "Choose an item"}
          </Button>
        </>
      )}
    </Panel>
  );
}

function SlotOverridePanel({ state, ask }: { state: AdminDashboardState; ask: Ask }) {
  const machine = state.machine;
  const choices = (machine?.reels ?? []).map((reel) => [...new Set(reel)]);
  const [picks, setPicks] = useState<string[]>(() => (machine?.reels ?? []).map((reel) => reel[0] ?? ""));
  const queued = state.slots.find((row) => row.status === "queued");
  const top = Math.max(0, ...(machine?.paytable ?? []).map((rule) => rule.pays));
  const rule = machine ? winningRule(machine.paytable, picks) : null;
  const multiplier = rule?.pays ?? 0;
  const presets = machine ? slotPresets(machine, choices) : [];

  function queue() {
    if (!machine) return;
    const stops = picks.map((symbol, i) => machine.reels[i].indexOf(symbol));
    if (stops.some((stop) => stop < 0)) return;
    const id = createRequestId();
    const names = picks.map(symbolName).join(" · ");
    const chosen = [...picks];
    ask({
      title: "Queue this Coin Slots override?",
      label: "Queue override",
      body: (
        <>
          <Payline symbols={chosen} hit={rule?.symbol} multiplier={multiplier} top={top} size="size-9" />
          <p>Your own next spin lands on {names}. You still choose and pay the bet; the payout comes from the machine’s paytable. It expires after 24 hours if unused.</p>
        </>
      ),
      run: async () => {
        await apiFetch("/api/admin/dashboard/overrides", { method: "POST", json: { kind: "slots", id, stops } });
        return `Queued ${names} for your next spin.`;
      },
    });
  }

  return (
    <Panel title="Next Coin Slots spin" icon={<Coins aria-hidden className="size-4" />} description="Pick where your own next spin lands. Only you, only once; the paytable decides the payout.">
      {queued ? (
        <QueuedCard
          createdAt={queued.createdAt}
          expiresAt={queued.expiresAt}
          onCancel={() => cancelOverride(ask, "slots", queued.id, `${queued.symbols.map(symbolName).join(" · ")} won’t be applied.`)}
        >
          <Payline symbols={queued.symbols} multiplier={queued.multiplier} top={top} size="size-9" />
        </QueuedCard>
      ) : !machine ? (
        <p className="ad-empty">Coin Slots is closed right now.</p>
      ) : (
        <>
          <div className="ad-step">
            <span className="ad-label">Quick picks</span>
            <div className="ad-presets">
              {presets.map((preset) => (
                <button key={preset.key} type="button" className="ad-preset" aria-pressed={same(preset.picks, picks)} onClick={() => setPicks(preset.picks)} title={preset.label}>
                  <MiniSymbols symbols={preset.picks} size="size-4" />
                  {preset.pays ? `×${preset.pays}` : "Miss"}
                </button>
              ))}
            </div>
          </div>
          <div className="ad-step">
            <span className="ad-label">Or pick each reel</span>
            <div className="ad-reels">
              {choices.map((list, i) => (
                <div key={i} className="ad-reel" role="radiogroup" aria-label={`Reel ${i + 1}`}>
                  <span className="ad-label">Reel {i + 1}</span>
                  <div className="ad-reel-symbols">
                    {list.map((symbol) => (
                      <button
                        key={symbol}
                        type="button"
                        role="radio"
                        aria-checked={picks[i] === symbol}
                        className="ad-symbol"
                        title={symbolName(symbol)}
                        onClick={() => setPicks((current) => current.map((value, j) => (j === i ? symbol : value)))}
                      >
                        <SlotSymbol id={symbol} className="size-8" />
                        <span className="sr-only">{symbolName(symbol)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div aria-live="polite">
            <Payline symbols={picks} hit={rule?.symbol} multiplier={multiplier} top={top} />
          </div>
          <Button onClick={queue}>Review and queue</Button>
        </>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------------------------- Admin access */

function AdminAccess({ state, owner, ask }: { state: AdminDashboardState; owner: boolean; ask: Ask }) {
  const owners = state.admins.filter((admin) => admin.role === "owner").length;

  function change(account: Account, userId: string, role: AdminRole | null, current: AdminRole | null) {
    const name = who(account);
    const verb = role === null ? "Revoke admin access" : current === null ? `Grant ${ROLE_LABEL[role].toLowerCase()} access` : `Change role to ${ROLE_LABEL[role]}`;
    ask({
      title: `${verb}?`,
      label: role === null ? "Revoke access" : current === null ? "Grant access" : "Change role",
      destructive: role === null,
      body: (
        <>
          <dl className="ad-summary">
            <div>
              <dt>Account</dt>
              <dd>
                {name}
                {account?.email && account.email !== name ? <span className="font-normal text-muted-foreground"> · {account.email}</span> : null}
              </dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>
                {current ? ROLE_LABEL[current] : "None"} → {role ? ROLE_LABEL[role] : "None"}
              </dd>
            </div>
          </dl>
          {role === "owner" ? <p>Owners can grant and revoke admin access for everyone else.</p> : null}
          <p>{role === null ? "Their unused overrides expire immediately. " : ""}This is recorded in the audit log.</p>
        </>
      ),
      run: async () => {
        const result = await apiFetch<{ changed: boolean }>("/api/admin/dashboard/admins", { method: "POST", json: { userId, role } });
        if (!result.changed) return `${name} already had that access. Nothing changed.`;
        return role === null ? `Revoked admin access for ${name}.` : `${name} is now ${ROLE_LABEL[role].toLowerCase()}.`;
      },
    });
  }

  return (
    <Panel
      title="Admin access"
      icon={<ShieldCheck aria-hidden className="size-4" />}
      description={owner ? "Grant, change or revoke access. You can’t change your own role, and there’s always at least one owner." : "Only owners can change admin access."}
    >
      <ul className="ad-list">
        {state.admins.map((admin) => {
          const self = admin.id === state.me.id;
          const lastOwner = admin.role === "owner" && owners <= 1;
          const account = admin.account ?? { id: admin.id, name: null, email: null, avatarUrl: null };
          const locked = lastOwner ? "Amethyst needs at least one owner." : undefined;
          return (
            <li key={admin.id} className="ad-row">
              <div className="ad-row-main">
                <Avatar account={admin.account} id={admin.id} />
                <div className="ad-row-text">
                  <p className="ad-row-title">
                    {who(admin.account)}
                    {self ? <span className="font-normal text-muted-foreground">(you)</span> : null}
                  </p>
                  <p className="ad-row-meta" suppressHydrationWarning>
                    {admin.account?.email ?? admin.id} · since {when(admin.grantedAt)}
                    {admin.grantedBy ? ` · by ${who(admin.grantedBy)}` : ""}
                  </p>
                </div>
              </div>
              <span className="ad-pill" data-role={admin.role}>
                {admin.role === "owner" ? <Crown aria-hidden className="size-3" /> : null}
                {ROLE_LABEL[admin.role]}
              </span>
              {owner && !self ? (
                <div className="ad-row-actions">
                  <Button variant="outline" size="sm" disabled={lastOwner} title={locked} onClick={() => change(account, admin.id, admin.role === "owner" ? "admin" : "owner", admin.role)}>
                    {admin.role === "owner" ? "Make admin" : "Make owner"}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={lastOwner}
                    title={locked ?? "Revoke access"}
                    aria-label={`Revoke access for ${who(admin.account)}`}
                    onClick={() => change(account, admin.id, null, admin.role)}
                  >
                    <UserMinus aria-hidden />
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {owner ? <GrantAccess admins={state.admins} selfId={state.me.id} onGrant={(account, role) => change(account, account.id, role, null)} /> : null}
    </Panel>
  );
}

function GrantAccess({ admins, selfId, onGrant }: { admins: AdminDashboardState["admins"]; selfId: string; onGrant: (account: AdminAccount, role: AdminRole) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; accounts: AdminAccount[] | null } | null>(null);
  const [picked, setPicked] = useState<AdminAccount | null>(null);
  const [role, setRole] = useState<AdminRole>("admin");
  const q = query.trim();

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      apiFetch<{ accounts: AdminAccount[] }>(`/api/admin/vault/accounts?q=${encodeURIComponent(term)}`).then(
        (result) => live && setFound({ q: term, accounts: result.accounts }),
        () => live && setFound({ q: term, accounts: null }),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  const searching = q.length >= 2 && found?.q !== q;
  const results = q.length >= 2 && found?.q === q ? found.accounts : undefined;
  const existing = picked ? admins.find((admin) => admin.id === picked.id) : undefined;

  return (
    <div className="ad-step border-t border-border pt-4">
      <span className="ad-label">Grant access</span>
      <div className="ad-search">
        <Search aria-hidden />
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPicked(null);
          }}
          placeholder="Search by name, email or account id"
          aria-label="Search accounts"
        />
      </div>
      {q.length > 0 && q.length < 2 ? <p className="ad-hint">Type at least 2 characters.</p> : null}
      {searching ? (
        <p className="ad-hint flex items-center gap-2">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Searching…
        </p>
      ) : null}
      {results === null ? <p className="text-sm text-destructive">Accounts couldn’t be searched. Try again.</p> : null}
      {results && results.length === 0 ? <p className="ad-empty">No account matches. The person needs to sign in to Amethyst once before they can be granted access.</p> : null}
      {results && results.length > 0 && !picked ? (
        <ul className="ad-results">
          {results.map((account) => {
            const current = admins.find((admin) => admin.id === account.id);
            return (
              <li key={account.id}>
                <button type="button" onClick={() => setPicked(account)} className="ad-result w-full">
                  <Avatar account={account} id={account.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{who(account)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{account.email ?? account.id}</span>
                  </span>
                  {current ? (
                    <span className="ad-pill" data-role={current.role}>
                      {ROLE_LABEL[current.role]}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {picked ? (
        <div className="ad-chosen">
          <Avatar account={picked} id={picked.id} />
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-medium">{who(picked)}</p>
            <p className="truncate text-xs text-muted-foreground">{picked.email ?? picked.id}</p>
          </div>
          {picked.id === selfId ? (
            <p className="ad-hint">That’s you. Ask another owner to change your access.</p>
          ) : existing ? (
            <p className="ad-hint">Already {ROLE_LABEL[existing.role].toLowerCase()}; change it in the list above.</p>
          ) : (
            <>
              <div className="ad-segment" role="group" aria-label="Role">
                {(["admin", "owner"] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={role === value} onClick={() => setRole(value)}>
                    {ROLE_LABEL[value]}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={() => onGrant(picked, role)}>
                <UserPlus aria-hidden />
                Grant
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => setPicked(null)} aria-label="Clear selection">
            <X aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------------- History */

function OverrideHistory({ state }: { state: AdminDashboardState }) {
  const rows = [...state.loot, ...state.slots].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Panel title="Your overrides" icon={<Clock aria-hidden className="size-4" />} description="Your last 10 of each kind. Used ones show what was actually recorded.">
      {rows.length === 0 ? (
        <p className="ad-empty">You haven’t queued any overrides yet.</p>
      ) : (
        <ul className="ad-list ad-scroll">
          {rows.map((row) => (
            <li key={row.id} className="ad-row">
              <div className="ad-row-main">
                <span className="ad-icon" data-kind={row.kind === "loot" ? "loot" : "slot"}>
                  {row.kind === "loot" ? <PackageOpen aria-hidden className="size-4" /> : <Coins aria-hidden className="size-4" />}
                </span>
                <div className="ad-row-text">
                  {row.kind === "loot" ? (
                    <p className="ad-row-title">
                      <span className="ad-chip-dot" style={{ "--rarity": rarityColor(row.rarity) } as CSSProperties} />
                      {itemName(row.item)}
                    </p>
                  ) : (
                    <p className="ad-row-title">
                      <MiniSymbols symbols={row.symbols} />
                      {row.status === "consumed" && row.bet !== null ? `bet ${row.bet.toLocaleString("en")} → ${(row.payout ?? 0).toLocaleString("en")}` : `×${row.multiplier}`}
                    </p>
                  )}
                  <p className="ad-row-meta" suppressHydrationWarning>
                    {row.kind === "loot" ? `${lootCaseInfo(row.case).name} · ` : "Coin Slots · "}
                    {row.resolvedAt ? when(row.resolvedAt) : `queued ${when(row.createdAt)}`}
                  </p>
                </div>
              </div>
              <StatusPill status={row.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function auditDetail(action: string, details: Record<string, unknown>) {
  const text = (key: string) => (typeof details[key] === "string" ? (details[key] as string) : null);
  if (action === "admin_grant") return `as ${text("role") ?? "admin"}`;
  if (action === "admin_role_change") return `${text("from")} → ${text("to")}`;
  if (action === "admin_revoke") return `was ${text("from") ?? "admin"}`;
  if (action.startsWith("loot_")) {
    const item = text("item");
    const box = text("case");
    return [item && itemName(item), box && lootCaseInfo(box).name].filter(Boolean).join(" from ");
  }
  if (action === "slot_override_use") return `bet ${String(details.bet)} → paid ${String(details.payout)}`;
  return "";
}

function AuditLog({ state }: { state: AdminDashboardState }) {
  const [filter, setFilter] = useState<(typeof AUDIT_FILTERS)[number]["id"]>("all");
  const entries = state.audit.filter((entry) => filter === "all" || entry.action.startsWith(`${filter}_`));
  return (
    <Panel
      title="Audit log"
      icon={<ScrollText aria-hidden className="size-4" />}
      description="Every access change and override, newest first. Entries can’t be edited or deleted."
      actions={
        <div className="ad-chips" role="group" aria-label="Filter the audit log">
          {AUDIT_FILTERS.map((option) => (
            <button key={option.id} type="button" className="ad-chip" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      {entries.length === 0 ? (
        <p className="ad-empty">{state.audit.length ? "Nothing of this kind in the latest entries." : "Nothing recorded yet."}</p>
      ) : (
        <ol className="ad-list ad-scroll">
          {entries.map((entry) => {
            const kind = entry.action.split("_")[0];
            const self = entry.actor?.id && entry.actor.id === entry.target?.id;
            const detail = auditDetail(entry.action, entry.details);
            const symbols = Array.isArray(entry.details.symbols) ? entry.details.symbols.filter((s): s is string => typeof s === "string") : [];
            return (
              <li key={entry.id} className="ad-row">
                <div className="ad-row-main">
                  <span className="ad-icon" data-kind={kind}>
                    {kind === "admin" ? <ShieldCheck aria-hidden className="size-4" /> : kind === "loot" ? <PackageOpen aria-hidden className="size-4" /> : <Coins aria-hidden className="size-4" />}
                  </span>
                  <div className="ad-row-text">
                    <p className="ad-row-title font-normal">
                      <span className="font-semibold">{who(entry.actor, "Deleted account")}</span> {ACTION_LABEL[entry.action] ?? entry.action}
                      {!self && entry.target ? ` for ${who(entry.target)}` : ""}
                    </p>
                    <p className="ad-row-meta flex items-center gap-1.5" suppressHydrationWarning>
                      {symbols.length ? <MiniSymbols symbols={symbols} size="size-4" /> : null}
                      {detail ? `${detail} · ` : ""}
                      {when(entry.createdAt)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
