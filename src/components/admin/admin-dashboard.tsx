"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Clock, Coins, Crown, LayoutDashboard, Loader2, PackageOpen, RefreshCw, ScrollText, Search, ShieldCheck, Sparkles, UserMinus, UserPlus, Users, X } from "lucide-react";
import { SlotSymbol, symbolName } from "@/components/arcade/slots/symbols";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/components/layout/settings-context";
import { useMotionLevel } from "@/components/showcase/motion";
import { playGeodeSound } from "@/components/vault/vault-audio";
import { gemStyle, type AdminGemId } from "@/lib/admin-gems";
import { ApiError, apiFetch } from "@/lib/api-client";
import { ADMIN_DASHBOARD_STYLES, type AdminDashboardStyle, type Settings } from "@/lib/preferences";
import { DASHBOARD_CONTAINER, dashboardSchema, type AdminDashboardState, type AdminRole, type DashboardAccount, type OverrideStatus } from "@/lib/admin-dashboard";
import { describeItem, inventoryItemLabel } from "@/lib/inventory";
import { lootCaseInfo } from "@/lib/lootboxes";
import { RARITIES, isRarity } from "@/lib/rarities";
import { createRequestId } from "@/lib/request-id";
import { winningRule } from "@/lib/slots";
import type { AdminAccount } from "@/lib/vault-admin";
import { PlayerTools } from "./admin-players";
import { FlashyDashboard, FxCounters, FxPanel } from "./admin-dashboard-fx";
import { countdown, plural, useMounted, useNow } from "./admin-ui";
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
  season_premium_grant: "granted Season Pass Premium",
  season_premium_revoke: "revoked Season Pass Premium",
  coins_grant: "gave coins",
  coins_take: "took coins",
  cosmetic_grant: "gave a cosmetic",
  cosmetic_take: "took a cosmetic",
  booster_grant: "gave boosted openings",
  booster_take: "took boosted openings",
  booster_end: "ended an active luck booster",
};
const AUDIT_FILTERS = [
  { id: "all", label: "All" },
  { id: "admin", label: "Access" },
  { id: "loot", label: "Lootbox" },
  { id: "slot", label: "Coin Slots" },
  { id: "player", label: "Players" },
] as const;
const auditGroup = (action: string) => (/^(admin|loot|slot)_/.test(action) ? action.split("_")[0] : "player");

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
    <span aria-hidden className="dash-avatar" style={{ "--hue": hue } as CSSProperties}>
      {initials}
    </span>
  );
}

function StatusPill({ status }: { status: OverrideStatus }) {
  return (
    <span className="dash-pill" data-status={status}>
      <span className="dash-pill-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function RarityPill({ rarity }: { rarity: string | null }) {
  return (
    <span className="dash-pill dash-rarity" style={{ "--rarity": rarityColor(rarity) } as CSSProperties}>
      {rarityLabel(rarity)}
    </span>
  );
}

function MiniSymbols({ symbols, size = "size-5" }: { symbols: string[]; size?: string }) {
  return (
    <span className="dash-mini-symbols" aria-label={symbols.map(symbolName).join(", ")}>
      {symbols.map((symbol, i) => (
        <SlotSymbol key={i} id={symbol} className={size} />
      ))}
    </span>
  );
}

function Payline({ symbols, hit, multiplier, top, size = "size-10" }: { symbols: string[]; hit?: string | null; multiplier: number; top: number; size?: string }) {
  const tier = slotTier(multiplier, top);
  return (
    <div className="dash-payline" data-tier={tier.key}>
      <div className="dash-payline-cells">
        {symbols.map((symbol, i) => (
          <span key={i} className="dash-payline-cell" data-hit={(hit && symbol === hit) || undefined}>
            <SlotSymbol id={symbol} className={size} />
          </span>
        ))}
      </div>
      <div className="dash-payout">
        <span className="dash-payout-mult">×{multiplier}</span>
        <span className="dash-payout-tier">{tier.label}</span>
      </div>
    </div>
  );
}

function Panel({ title, description, icon, actions, children }: { title: string; description?: string; icon: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="dash-panel">
      <header className="dash-panel-head">
        <span className="dash-panel-icon">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="dash-panel-title">{title}</h2>
          {description ? <p className="dash-panel-desc">{description}</p> : null}
        </div>
        {actions ? <div className="dash-panel-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function AdminDashboard({ initial }: { initial: AdminDashboardState }) {
  const [state, setState] = useState(initial);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const settings = useSettings();
  const router = useRouter();
  const motion = useMotionLevel();
  const [style, setStyle] = useState<AdminDashboardStyle>(settings.adminDashboardStyle);
  const [success, setSuccess] = useState(0);
  const flashy = style === "flashy";
  // Flashy is lit by its own gem; sound is the account's one sound setting (shared with the Arcade and Code Admin).
  const [gem, setGem] = useState<AdminGemId>(settings.adminDashboardGem);
  const [soundOn, setSoundOn] = useState(settings.arcadeSound);
  const fxStyle = useMemo(() => gemStyle(gem), [gem]);

  /** Saves one setting; the choice applies right away and stays for this visit even if saving fails. */
  async function save(patch: Partial<Pick<Settings, "adminDashboardStyle" | "adminDashboardGem" | "arcadeSound">>, failure: string) {
    try {
      await apiFetch("/api/preferences", { method: "PATCH", json: { settings: patch } });
      router.refresh();
    } catch {
      toast.error(failure);
    }
  }

  async function chooseStyle(next: AdminDashboardStyle) {
    if (next === style) return;
    setStyle(next);
    await save({ adminDashboardStyle: next }, "Could not save the dashboard style. It applies until you leave this page.");
  }
  async function chooseGem(next: AdminGemId) {
    if (next === gem) return;
    setGem(next);
    await save({ adminDashboardGem: next }, "Could not save the gem. It applies until you leave this page.");
  }
  async function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    await save({ arcadeSound: next }, "Could not save the sound setting. It applies until you leave this page.");
  }
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

  const confirmDialog = (
    <ConfirmDialog
      key={confirm?.key ?? "none"}
      confirm={confirm}
      className={flashy ? "geo-dialog" : undefined}
      style={flashy ? fxStyle : undefined}
      onResult={(ok) => {
        if (!flashy) return;
        // Success chimes with its shard burst (in the Flashy shell); a failure gets the dull glass knock here.
        if (ok) setSuccess((count) => count + 1);
        else if (soundOn) playGeodeSound("error");
      }}
      onClose={() => setConfirm(null)}
      onDone={() => void refresh(true)}
    />
  );

  if (flashy) {
    return (
      <FlashyDashboard
        style={fxStyle}
        motion={motion}
        sound={soundOn}
        onToggleSound={() => void toggleSound()}
        gem={gem}
        onChooseGem={(id) => void chooseGem(id)}
        success={success}
        tools={
          <>
            <StylePicker value={style} onChange={(next) => void chooseStyle(next)} flashy />
            <button type="button" className="geo-tool" onClick={() => void refresh()} disabled={refreshing} title="Refresh">
              {refreshing ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" />}
              <span className="sr-only">Refresh</span>
            </button>
            <Link href="/admin" className="geo-tool" title="Open Code Admin">
              <ArrowUpRight aria-hidden className="size-4" />
              <span className="sr-only">Code Admin</span>
            </Link>
          </>
        }
        views={[
          {
            id: "overview",
            label: "Overview",
            icon: <LayoutDashboard aria-hidden className="size-3.5" />,
            kicker: "Amethyst command",
            title: "Overview",
            aside: (
              <p className="geo-whoami">
                Signed in as <strong>{who(state.me.account)}</strong>
                <span className="dash-pill" data-role={state.me.role}>
                  {owner ? <Crown aria-hidden className="size-3" /> : <ShieldCheck aria-hidden className="size-3" />}
                  {ROLE_LABEL[state.me.role]}
                </span>
              </p>
            ),
            slots: [
              { id: "counters", node: <FxCounters stats={stats} animate={motion !== "off"} /> },
              { id: "chart", pose: "floor", node: <FxChart state={state} /> },
              { id: "queue", node: <FxQueue state={state} /> },
              { id: "roster", pose: "left", node: <FxRoster state={state} /> },
              { id: "activity", pose: "right", node: <FxActivity state={state} /> },
            ],
          },
          {
            id: "overrides",
            label: "Overrides",
            icon: <Sparkles aria-hidden className="size-3.5" />,
            badge: queued || undefined,
            kicker: "Your next pulls",
            title: "Overrides",
            slots: [
              { id: "loot", pose: "left", node: <LootOverridePanel state={state} ask={ask} /> },
              { id: "slots", pose: "right", node: <SlotOverridePanel state={state} ask={ask} /> },
              { id: "history", pose: "floor", node: <OverrideHistory state={state} /> },
            ],
          },
          {
            id: "access",
            label: "Access",
            icon: <ShieldCheck aria-hidden className="size-3.5" />,
            kicker: "Who holds the keys",
            title: "Access",
            slots: [
              { id: "main", node: <AdminAccess state={state} owner={owner} ask={ask} /> },
              { id: "side", pose: "right", node: <FxAccessLog state={state} /> },
            ],
          },
          {
            id: "players",
            label: "Players",
            icon: <Users aria-hidden className="size-3.5" />,
            kicker: "Season Pass, coins, cosmetics, boosters",
            title: "Players",
            slots: [{ id: "main", node: <PlayerTools ask={ask} /> }],
          },
          {
            id: "audit",
            label: "Audit",
            icon: <ScrollText aria-hidden className="size-3.5" />,
            kicker: "Append-only record",
            title: "Audit",
            slots: [
              { id: "main", node: <AuditLog state={state} /> },
              { id: "side", pose: "left", node: <FxKinds state={state} /> },
            ],
          },
        ]}
      >
        {confirmDialog}
      </FlashyDashboard>
    );
  }

  return (
    <div className={`${DASHBOARD_CONTAINER} dash-root`}>
      <header className="dash-hero">
        <span className="dash-hero-mark">
          <LayoutDashboard aria-hidden className="size-6" />
        </span>
        <div className="dash-hero-title">
          <h1>Admin Dashboard</h1>
          <p>
            Signed in as {who(state.me.account)}
            <span className="dash-pill" data-role={state.me.role}>
              {state.me.role === "owner" ? <Crown aria-hidden className="size-3" /> : <ShieldCheck aria-hidden className="size-3" />}
              {ROLE_LABEL[state.me.role]}
            </span>
          </p>
        </div>
        <div className="dash-hero-actions">
          <StylePicker value={style} onChange={(next) => void chooseStyle(next)} />
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

      <div className="dash-stats">
        {stats.map((stat) => (
          <div key={stat.key} className="dash-stat" data-tone={stat.tone}>
            <p className="dash-label">{stat.label}</p>
            <span className="dash-stat-icon">{stat.icon}</span>
            <p className="dash-stat-value">{stat.value.toLocaleString("en")}</p>
            <p className="dash-stat-note" suppressHydrationWarning>
              {stat.note}
            </p>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <LootOverridePanel state={state} ask={ask} />
        <SlotOverridePanel state={state} ask={ask} />
      </div>
      <div className="dash-grid dash-grid-split">
        <AdminAccess state={state} owner={owner} ask={ask} />
        <OverrideHistory state={state} />
      </div>
      <PlayerTools ask={ask} />
      <AuditLog state={state} />

      {confirmDialog}
    </div>
  );
}

/** Standard / Flashy. Presentation only: both render the same tools, data and checks. */
function StylePicker({ value, onChange, flashy = false }: { value: AdminDashboardStyle; onChange: (next: AdminDashboardStyle) => void; flashy?: boolean }) {
  return (
    <div className={flashy ? "geo-switch" : "dash-segment"} role="group" aria-label="Dashboard style">
      {ADMIN_DASHBOARD_STYLES.map((option) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}>
          {option === "flashy" ? <Sparkles aria-hidden className="size-3.5" /> : <LayoutDashboard aria-hidden className="size-3.5" />}
          <span className="dash-style-label">{option === "flashy" ? "Flashy" : "Standard"}</span>
        </button>
      ))}
    </div>
  );
}

function ConfirmDialog({
  confirm,
  className,
  style,
  onResult,
  onClose,
  onDone,
}: {
  confirm: Confirm | null;
  className?: string;
  style?: CSSProperties;
  onResult?: (ok: boolean) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      toast.success(await confirm.run());
      onResult?.(true);
      onClose();
    } catch (failure) {
      setError(message(failure));
      onResult?.(false);
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent className={className} style={style}>
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
    <div className="dash-queued">
      <div className="dash-queued-head">
        <StatusPill status="queued" />
        <span className="dash-countdown" suppressHydrationWarning>
          <Clock aria-hidden className="size-3.5" />
          {left > 0 ? `expires in ${countdown(left)}` : "expiring"}
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={onCancel}>
          <X aria-hidden />
          Cancel
        </Button>
      </div>
      {children}
      <p className="dash-hint">Not applied yet. It waits for your next eligible attempt and is used exactly once.</p>
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
          <dl className="dash-summary">
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
          <div className="dash-pick" style={{ "--rarity": rarityColor(queued.rarity) } as CSSProperties}>
            <span className="dash-label">Your next {lootCaseInfo(queued.case).name} reveals</span>
            <p className="dash-pick-name">{itemName(queued.item)}</p>
            <p className="dash-pick-meta">
              <RarityPill rarity={queued.rarity} /> {itemType(queued.item)}
            </p>
          </div>
          <p className="dash-hint">Open it from Shop → Cases. The bulk-open tools don’t use overrides.</p>
        </QueuedCard>
      ) : state.cases.length === 0 ? (
        <p className="dash-empty">No case can be opened right now.</p>
      ) : (
        <>
          <div className="dash-step">
            <span className="dash-label">1 · Case</span>
            <div className="dash-cases">
              {state.cases.map((entry) => {
                const info = lootCaseInfo(entry.id);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="dash-case"
                    aria-pressed={entry.id === caseId}
                    onClick={() => pickCase(entry.id)}
                    style={{ "--hue": info.hue, "--glow": info.glow } as CSSProperties}
                  >
                    <span className="dash-case-name">{info.name}</span>
                    <span className="dash-case-meta">
                      {plural(entry.items.length, "item")}
                      {entry.available ? "" : " · not sold now"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dash-step">
            <span className="dash-label">2 · Item from this case’s pool</span>
            <div className="dash-search">
              <Search aria-hidden />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items" aria-label="Search items" />
            </div>
            <div className="dash-chips" role="group" aria-label="Filter by rarity">
              <button type="button" className="dash-chip" aria-pressed={rarity === "all"} onClick={() => setRarity("all")}>
                All <span className="dash-chip-count">{pool.length}</span>
              </button>
              {rarities.map((value) => (
                <button key={value} type="button" className="dash-chip" aria-pressed={rarity === value} onClick={() => setRarity(value)} style={{ "--rarity": rarityColor(value) } as CSSProperties}>
                  <span className="dash-chip-dot" />
                  {rarityLabel(value)} <span className="dash-chip-count">{pool.filter((entry) => entry.rarity === value).length}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="dash-empty">No item in this case matches.</p>
            ) : (
              <div className="dash-items" role="group" aria-label="Items">
                {shown.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="dash-item"
                    aria-pressed={entry.id === itemId}
                    onClick={() => setItemId(entry.id === itemId ? "" : entry.id)}
                    style={{ "--rarity": rarityColor(entry.rarity) } as CSSProperties}
                  >
                    <span className="dash-item-name">{itemName(entry.id)}</span>
                    <span className="dash-item-meta">
                      {rarityLabel(entry.rarity)} · {itemType(entry.id)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {item && box ? (
            <div className="dash-pick" key={item.id} style={{ "--rarity": rarityColor(item.rarity) } as CSSProperties}>
              <span className="dash-label">Your next {lootCaseInfo(box.id).name} would reveal</span>
              <p className="dash-pick-name">{itemName(item.id)}</p>
              <p className="dash-pick-meta">
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
        <p className="dash-empty">Coin Slots is closed right now.</p>
      ) : (
        <>
          <div className="dash-step">
            <span className="dash-label">Quick picks</span>
            <div className="dash-presets">
              {presets.map((preset) => (
                <button key={preset.key} type="button" className="dash-preset" aria-pressed={same(preset.picks, picks)} onClick={() => setPicks(preset.picks)} title={preset.label}>
                  <MiniSymbols symbols={preset.picks} size="size-4" />
                  {preset.pays ? `×${preset.pays}` : "Miss"}
                </button>
              ))}
            </div>
          </div>
          <div className="dash-step">
            <span className="dash-label">Or pick each reel</span>
            <div className="dash-reels">
              {choices.map((list, i) => (
                <div key={i} className="dash-reel" role="radiogroup" aria-label={`Reel ${i + 1}`}>
                  <span className="dash-label">Reel {i + 1}</span>
                  <div className="dash-reel-symbols">
                    {list.map((symbol) => (
                      <button
                        key={symbol}
                        type="button"
                        role="radio"
                        aria-checked={picks[i] === symbol}
                        className="dash-symbol"
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
          <dl className="dash-summary">
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
      <ul className="dash-list">
        {state.admins.map((admin) => {
          const self = admin.id === state.me.id;
          const lastOwner = admin.role === "owner" && owners <= 1;
          const account = admin.account ?? { id: admin.id, name: null, email: null, avatarUrl: null };
          const locked = lastOwner ? "Amethyst needs at least one owner." : undefined;
          return (
            <li key={admin.id} className="dash-row">
              <div className="dash-row-main">
                <Avatar account={admin.account} id={admin.id} />
                <div className="dash-row-text">
                  <p className="dash-row-title">
                    {who(admin.account)}
                    {self ? <span className="font-normal text-muted-foreground">(you)</span> : null}
                  </p>
                  <p className="dash-row-meta" suppressHydrationWarning>
                    {admin.account?.email ?? admin.id} · since {when(admin.grantedAt)}
                    {admin.grantedBy ? ` · by ${who(admin.grantedBy)}` : ""}
                  </p>
                </div>
              </div>
              <span className="dash-pill" data-role={admin.role}>
                {admin.role === "owner" ? <Crown aria-hidden className="size-3" /> : null}
                {ROLE_LABEL[admin.role]}
              </span>
              {owner && !self ? (
                <div className="dash-row-actions">
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
    <div className="dash-step border-t border-border pt-4">
      <span className="dash-label">Grant access</span>
      <div className="dash-search">
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
      {q.length > 0 && q.length < 2 ? <p className="dash-hint">Type at least 2 characters.</p> : null}
      {searching ? (
        <p className="dash-hint flex items-center gap-2">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Searching…
        </p>
      ) : null}
      {results === null ? <p className="text-sm text-destructive">Accounts couldn’t be searched. Try again.</p> : null}
      {results && results.length === 0 ? <p className="dash-empty">No account matches. The person needs to sign in to Amethyst once before they can be granted access.</p> : null}
      {results && results.length > 0 && !picked ? (
        <ul className="dash-results">
          {results.map((account) => {
            const current = admins.find((admin) => admin.id === account.id);
            return (
              <li key={account.id}>
                <button type="button" onClick={() => setPicked(account)} className="dash-result w-full">
                  <Avatar account={account} id={account.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{who(account)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{account.email ?? account.id}</span>
                  </span>
                  {current ? (
                    <span className="dash-pill" data-role={current.role}>
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
        <div className="dash-chosen">
          <Avatar account={picked} id={picked.id} />
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-medium">{who(picked)}</p>
            <p className="truncate text-xs text-muted-foreground">{picked.email ?? picked.id}</p>
          </div>
          {picked.id === selfId ? (
            <p className="dash-hint">That’s you. Ask another owner to change your access.</p>
          ) : existing ? (
            <p className="dash-hint">Already {ROLE_LABEL[existing.role].toLowerCase()}; change it in the list above.</p>
          ) : (
            <>
              <div className="dash-segment" role="group" aria-label="Role">
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
        <p className="dash-empty">You haven’t queued any overrides yet.</p>
      ) : (
        <ul className="dash-list dash-scroll">
          {rows.map((row) => (
            <li key={row.id} className="dash-row">
              <div className="dash-row-main">
                <span className="dash-icon" data-kind={row.kind === "loot" ? "loot" : "slot"}>
                  {row.kind === "loot" ? <PackageOpen aria-hidden className="size-4" /> : <Coins aria-hidden className="size-4" />}
                </span>
                <div className="dash-row-text">
                  {row.kind === "loot" ? (
                    <p className="dash-row-title">
                      <span className="dash-chip-dot" style={{ "--rarity": rarityColor(row.rarity) } as CSSProperties} />
                      {itemName(row.item)}
                    </p>
                  ) : (
                    <p className="dash-row-title">
                      <MiniSymbols symbols={row.symbols} />
                      {row.status === "consumed" && row.bet !== null ? `bet ${row.bet.toLocaleString("en")} → ${(row.payout ?? 0).toLocaleString("en")}` : `×${row.multiplier}`}
                    </p>
                  )}
                  <p className="dash-row-meta" suppressHydrationWarning>
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
  const count = (key: string) => Number(details[key] ?? 0).toLocaleString("en");
  if (action.startsWith("season_premium_")) return [text("season"), Number(details.refund) > 0 ? `refunded ${count("refund")} coins` : ""].filter(Boolean).join(" · ");
  if (action.startsWith("coins_")) return [`${count("amount")} coins`, text("reason")].filter(Boolean).join(" · ");
  if (action.startsWith("cosmetic_")) return itemName(text("item") ?? "");
  if (action.startsWith("booster_")) return `${count("charges")} openings · ${text("booster") ?? ""}`;
  return "";
}

function AuditLog({ state }: { state: AdminDashboardState }) {
  const [filter, setFilter] = useState<(typeof AUDIT_FILTERS)[number]["id"]>("all");
  const entries = state.audit.filter((entry) => filter === "all" || auditGroup(entry.action) === filter);
  return (
    <Panel
      title="Audit log"
      icon={<ScrollText aria-hidden className="size-4" />}
      description="Every access change and override, newest first. Entries can’t be edited or deleted."
      actions={
        <div className="dash-chips" role="group" aria-label="Filter the audit log">
          {AUDIT_FILTERS.map((option) => (
            <button key={option.id} type="button" className="dash-chip" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      {entries.length === 0 ? (
        <p className="dash-empty">{state.audit.length ? "Nothing of this kind in the latest entries." : "Nothing recorded yet."}</p>
      ) : (
        <ol className="dash-list dash-scroll">
          {entries.map((entry) => {
            const kind = entry.action.split("_")[0];
            const self = entry.actor?.id && entry.actor.id === entry.target?.id;
            const detail = auditDetail(entry.action, entry.details);
            const symbols = Array.isArray(entry.details.symbols) ? entry.details.symbols.filter((s): s is string => typeof s === "string") : [];
            return (
              <li key={entry.id} className="dash-row">
                <div className="dash-row-main">
                  <span className="dash-icon" data-kind={kind}>
                    {kind === "admin" ? <ShieldCheck aria-hidden className="size-4" /> : kind === "loot" ? <PackageOpen aria-hidden className="size-4" /> : <Coins aria-hidden className="size-4" />}
                  </span>
                  <div className="dash-row-text">
                    <p className="dash-row-title font-normal">
                      <span className="font-semibold">{who(entry.actor, "Deleted account")}</span> {ACTION_LABEL[entry.action] ?? entry.action}
                      {!self && entry.target ? ` for ${who(entry.target)}` : ""}
                    </p>
                    <p className="dash-row-meta flex items-center gap-1.5" suppressHydrationWarning>
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

/* --------------------------------------------------------------------------- Flashy views */
/* Panels only the Flashy design shows: summaries of data the dashboard already has, in Code Admin's style. */

const DAY_MS = 86_400_000;
const SHORT_DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
type AuditEntry = AdminDashboardState["audit"][number];

/** Admin actions per day over the last two weeks, from the entries the dashboard loaded. */
function FxChart({ state }: { state: AdminDashboardState }) {
  const mounted = useMounted();
  const [hover, setHover] = useState(-1);
  // Days are the viewer's local days, so they're counted in the browser only.
  const days = useMemo(() => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const list = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(noon.getTime() - (13 - i) * DAY_MS);
      return { key: localDay(day), label: SHORT_DAY.format(day), count: 0 };
    });
    if (!mounted) return list;
    const index = new Map(list.map((day, i) => [day.key, i]));
    for (const entry of state.audit) {
      const i = index.get(localDay(new Date(entry.createdAt)));
      if (i !== undefined) list[i].count += 1;
    }
    return list;
  }, [mounted, state.audit]);
  const max = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const focus = hover >= 0 ? days[hover] : null;

  return (
    <FxPanel kicker={`Last 14 days · latest ${plural(state.audit.length, "entry", "entries")}`} title="Admin actions">
      <div className="geo-chart" aria-hidden onPointerLeave={() => setHover(-1)}>
        {days.map((day, i) => (
          <div key={day.key} className="geo-bar" data-hot={i === hover ? "" : undefined} style={{ "--h": `${(day.count / max) * 100}%` } as CSSProperties} onPointerEnter={() => setHover(i)}>
            <span className="geo-bar-fill" />
          </div>
        ))}
      </div>
      <div className="geo-axis" aria-hidden suppressHydrationWarning>
        <span suppressHydrationWarning>{days[0].label}</span>
        <span>Today</span>
      </div>
      <p className="geo-readout" suppressHydrationWarning>
        {focus ? (
          <>
            <strong>{focus.label}</strong> · {plural(focus.count, "action")}
          </>
        ) : (
          <>
            <strong>{total.toLocaleString("en")}</strong> {total === 1 ? "action" : "actions"} in 14 days. Point at a day for details.
          </>
        )}
      </p>
      {mounted ? (
        <table className="sr-only">
          <caption>Admin actions per day, last 14 days</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.key}>
                <th scope="row">{day.label}</th>
                <td>{day.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </FxPanel>
  );
}

function FxQueueRow({ row }: { row: AdminDashboardState["loot"][number] | AdminDashboardState["slots"][number] }) {
  const now = useNow(Date.parse(row.createdAt));
  const left = Date.parse(row.expiresAt) - now;
  return (
    <li className="geo-row">
      <span className="dash-icon" data-kind={row.kind === "loot" ? "loot" : "slot"}>
        {row.kind === "loot" ? <PackageOpen aria-hidden className="size-4" /> : <Coins aria-hidden className="size-4" />}
      </span>
      <span className="geo-row-main">
        {row.kind === "loot" ? (
          <span className="geo-row-title">
            <span className="dash-chip-dot" style={{ "--rarity": rarityColor(row.rarity) } as CSSProperties} />
            {itemName(row.item)}
          </span>
        ) : (
          <span className="geo-row-title">
            <MiniSymbols symbols={row.symbols} />×{row.multiplier}
          </span>
        )}
        <span className="geo-row-meta">{row.kind === "loot" ? lootCaseInfo(row.case).name : "Coin Slots"}</span>
      </span>
      <span className="geo-row-side" suppressHydrationWarning>
        {left > 0 ? `expires in ${countdown(left)}` : "expiring"}
      </span>
    </li>
  );
}

/** What's queued for the admin's own next opening and spin. */
function FxQueue({ state }: { state: AdminDashboardState }) {
  const rows = [...state.loot, ...state.slots].filter((row) => row.status === "queued").sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  return (
    <FxPanel
      kicker="Waiting for your next attempt"
      title="Queued for you"
      actions={
        <a href="#overrides" className="geo-link">
          {rows.length ? "Manage" : "Queue one"}
        </a>
      }
    >
      {rows.length ? (
        <ul className="geo-list">
          {rows.map((row) => (
            <FxQueueRow key={row.id} row={row} />
          ))}
        </ul>
      ) : (
        <p className="geo-empty">Nothing queued. Your next Lootbox opening and Coin Slots spin use the normal odds.</p>
      )}
    </FxPanel>
  );
}

function FxRoster({ state }: { state: AdminDashboardState }) {
  const owners = state.admins.filter((admin) => admin.role === "owner").length;
  const admins = [...state.admins].sort((a, b) => (a.role === b.role ? 0 : a.role === "owner" ? -1 : 1));
  return (
    <FxPanel
      kicker={`${plural(owners, "owner")} · ${plural(state.admins.length - owners, "admin")}`}
      title="Admins"
      actions={
        <a href="#access" className="geo-link">
          Manage
        </a>
      }
    >
      <ul className="geo-list">
        {admins.map((admin) => (
          <li key={admin.id} className="geo-row">
            <Avatar account={admin.account} id={admin.id} />
            <span className="geo-row-main">
              <span className="geo-row-title">
                {who(admin.account)}
                {admin.id === state.me.id ? <span className="font-normal text-muted-foreground">(you)</span> : null}
              </span>
              <span className="geo-row-meta" suppressHydrationWarning>
                since {when(admin.grantedAt)}
              </span>
            </span>
            <span className="dash-pill" data-role={admin.role}>
              {admin.role === "owner" ? <Crown aria-hidden className="size-3" /> : null}
              {ROLE_LABEL[admin.role]}
            </span>
          </li>
        ))}
      </ul>
    </FxPanel>
  );
}

/** Audit entries as Code Admin's activity feed: a diamond per entry on a fading thread. */
function FxFeed({ entries, empty }: { entries: AuditEntry[]; empty: string }) {
  if (!entries.length) return <p className="geo-empty">{empty}</p>;
  return (
    <ol className="geo-feed">
      {entries.map((entry) => {
        const self = entry.actor?.id && entry.actor.id === entry.target?.id;
        const detail = auditDetail(entry.action, entry.details);
        return (
          <li key={entry.id} className="geo-feed-item" data-kind={auditGroup(entry.action)} data-tone={/_(revoke|take|cancel|end)$/.test(entry.action) ? "take" : undefined}>
            <span aria-hidden className="geo-feed-mark" />
            <span className="geo-feed-text">
              <span>
                <strong>{who(entry.actor, "Deleted account")}</strong> {ACTION_LABEL[entry.action] ?? entry.action}
                {!self && entry.target ? ` for ${who(entry.target)}` : ""}
              </span>
              <span className="geo-row-meta" suppressHydrationWarning>
                {detail ? `${detail} · ` : ""}
                {when(entry.createdAt)}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function FxActivity({ state }: { state: AdminDashboardState }) {
  return (
    <FxPanel
      kicker="Audit log · latest"
      title="Activity"
      actions={
        <a href="#audit" className="geo-link">
          Full log
        </a>
      }
    >
      <FxFeed entries={state.audit.slice(0, 8)} empty="Nothing has happened yet." />
    </FxPanel>
  );
}

function FxAccessLog({ state }: { state: AdminDashboardState }) {
  return (
    <FxPanel kicker="From the audit log" title="Access changes">
      <FxFeed entries={state.audit.filter((entry) => auditGroup(entry.action) === "admin").slice(0, 10)} empty="No access changes in the latest entries." />
    </FxPanel>
  );
}

/** The loaded audit entries by kind, and who made the most of them. */
function FxKinds({ state }: { state: AdminDashboardState }) {
  const total = state.audit.length;
  const groups = AUDIT_FILTERS.filter((filter) => filter.id !== "all").map((filter) => ({ ...filter, count: state.audit.filter((entry) => auditGroup(entry.action) === filter.id).length }));
  const actors = new Map<string, { account: Account | null; count: number }>();
  for (const entry of state.audit) {
    const key = entry.actor?.id ?? "deleted";
    const current = actors.get(key) ?? { account: entry.actor, count: 0 };
    current.count += 1;
    actors.set(key, current);
  }
  const top = [...actors.entries()].sort(([, a], [, b]) => b.count - a.count).slice(0, 3);
  return (
    <FxPanel kicker={`Latest ${plural(total, "entry", "entries")}`} title="By kind">
      <ul className="geo-kinds">
        {groups.map((group) => (
          <li key={group.id}>
            <span className="geo-kind-head">
              <span>{group.label}</span>
              <span className="tabular-nums">{group.count.toLocaleString("en")}</span>
            </span>
            <span className="geo-meter" aria-hidden>
              <span style={{ width: `${total ? (group.count / total) * 100 : 0}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="geo-subtitle">Most active</p>
      {top.length ? (
        <ul className="geo-list">
          {top.map(([id, actor]) => (
            <li key={id} className="geo-row">
              <Avatar account={actor.account} id={id} />
              <span className="geo-row-main">
                <span className="geo-row-title">{who(actor.account, "Deleted account")}</span>
              </span>
              <span className="geo-row-side tabular-nums">{plural(actor.count, "action")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="geo-empty">Nothing recorded yet.</p>
      )}
    </FxPanel>
  );
}
