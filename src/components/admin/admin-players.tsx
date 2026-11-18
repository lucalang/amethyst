"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Coins, Crown, Loader2, Search, Sparkles, UserRound, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { playerSchema, type AdminPlayer, type PlayerActionResult } from "@/lib/admin-players";
import { describeItem, inventoryItemLabel } from "@/lib/inventory";
import { RARITIES, isRarity } from "@/lib/rarities";
import { createRequestId } from "@/lib/request-id";
import type { AdminAccount } from "@/lib/vault-admin";
import type { GeodeMoment } from "./admin-dashboard-moments";

type Ask = (confirm: { title: string; body: ReactNode; label: string; destructive?: boolean; moment?: GeodeMoment; run: () => Promise<string> }) => void;
type Change = (title: string, label: string, body: ReactNode, action: Record<string, unknown>, done: (result: PlayerActionResult) => string, destructive?: boolean) => void;
type Tool = { player: AdminPlayer; name: string; change: Change };
type Account = AdminPlayer["account"] | AdminAccount;

const WHEN = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const when = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : "—");
const coins = (value: number) => `${value.toLocaleString("en")} ${Math.abs(value) === 1 ? "coin" : "coins"}`;
const who = (account: Account | null) => account?.name?.trim() || account?.email || account?.id || "Unknown account";
const itemName = (id: string) => describeItem(id)?.name ?? id;
const itemType = (id: string) => {
  const item = describeItem(id);
  return item ? inventoryItemLabel(item) : "Cosmetic";
};
const matches = (id: string, term: string) => !term || id.includes(term) || itemName(id).toLowerCase().includes(term) || itemType(id).toLowerCase().includes(term);
/** How the Flashy dashboard celebrates a player change, read from the action it sends. */
function momentFor(action: Record<string, unknown>, player: AdminPlayer | null): GeodeMoment | undefined {
  const name = player ? who(player.account) : "";
  switch (action.action) {
    case "premium":
      return action.premium ? { kind: "crown", kicker: `${name} · Season Pass`, title: "Premium" } : { kind: "fracture", kicker: `${name} · Season Pass`, title: "Premium revoked" };
    case "coins":
      return { kind: "coins", amount: Number(action.amount) || 0 };
    case "cosmetic": {
      const id = String(action.item);
      if (!action.owned) return { kind: "fracture", kicker: `Taken from ${name}`, title: itemName(id) };
      const rarity = player?.catalog.find((item) => item.id === id)?.rarity;
      return { kind: "gift", kicker: `Given to ${name}`, title: itemName(id), color: rarity && isRarity(rarity) ? RARITIES[rarity].color : "#c9a2ff" };
    }
    case "booster":
      if (action.op === "give") return { kind: "surge", kicker: "Boosted openings", title: `+${Number(action.charges).toLocaleString("en")}` };
      return { kind: "fracture", kicker: "Boosted openings", title: action.op === "end" ? "Booster ended" : `−${Number(action.charges).toLocaleString("en")}` };
  }
  return undefined;
}

const outcome = (result: PlayerActionResult, done: string) =>
  result.status === "unchanged" ? "Nothing changed. It was already that way." : result.status === "repeat" ? "That change was already made." : done;

/** Player lookup and tools: Season Pass Premium, coins, cosmetics and luck boosters. */
export function PlayerTools({ ask }: { ask: Ask }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; accounts: AdminAccount[] | null } | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [player, setPlayer] = useState<AdminPlayer | null>(null);
  const [loadError, setLoadError] = useState(false);
  const current = useRef<string | null>(null);
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

  async function load(id: string) {
    current.current = id;
    setLoadError(false);
    try {
      const parsed = playerSchema.safeParse(await apiFetch<unknown>(`/api/admin/dashboard/players/${id}`));
      if (current.current !== id) return;
      if (!parsed.success) throw new Error("unreadable");
      setPlayer(parsed.data);
    } catch {
      if (current.current === id) setLoadError(true);
    }
  }

  function pick(account: AdminAccount) {
    setPlayerId(account.id);
    setPlayer(null);
    setQuery("");
    void load(account.id);
  }

  function close() {
    current.current = null;
    setPlayerId(null);
    setPlayer(null);
    setLoadError(false);
  }

  // The request id is fixed per confirmation, so a retry from the same dialog is never applied twice.
  const change: Change = (title, label, body, action, done, destructive = false) => {
    if (!playerId) return;
    const id = playerId;
    const request = createRequestId();
    ask({
      title,
      label,
      body,
      destructive,
      moment: momentFor(action, player),
      run: async () => {
        const result = await apiFetch<PlayerActionResult>(`/api/admin/dashboard/players/${id}`, { method: "POST", json: { ...action, id: request } });
        void load(id);
        return outcome(result, done(result));
      },
    });
  };

  const searching = q.length >= 2 && found?.q !== q;
  const results = q.length >= 2 && found?.q === q ? found.accounts : undefined;

  return (
    <section className="dash-panel">
      <header className="dash-panel-head">
        <span className="dash-panel-icon">
          <UserRound aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="dash-panel-title">Players</h2>
          <p className="dash-panel-desc">Look up a player to see and change their Season Pass Premium, coins, cosmetics and luck boosters. Every change is recorded in the audit log.</p>
        </div>
      </header>
      <div className="dash-search">
        <Search aria-hidden />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email or account id" aria-label="Search players" />
      </div>
      {q.length > 0 && q.length < 2 ? <p className="dash-hint">Type at least 2 characters.</p> : null}
      {searching ? (
        <p className="dash-hint flex items-center gap-2">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Searching…
        </p>
      ) : null}
      {results === null ? <p className="text-sm text-destructive">Players couldn’t be searched. Try again.</p> : null}
      {results && results.length === 0 ? <p className="dash-empty">No player matches.</p> : null}
      {results && results.length > 0 ? (
        <ul className="dash-results">
          {results.map((account) => (
            <li key={account.id}>
              <button type="button" onClick={() => pick(account)} className="dash-result w-full">
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{who(account)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{account.email ?? account.id}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {playerId && !player && !loadError ? (
        <p className="dash-hint flex items-center gap-2">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Loading the player…
        </p>
      ) : null}
      {playerId && loadError ? (
        <p role="alert" className="text-sm text-destructive">
          The player couldn’t be loaded.{" "}
          <button type="button" className="underline" onClick={() => void load(playerId)}>
            Try again
          </button>
        </p>
      ) : null}
      {player ? <PlayerDetail player={player} change={change} onClose={close} /> : null}
    </section>
  );
}

function PlayerDetail({ player, change, onClose }: { player: AdminPlayer; change: Change; onClose: () => void }) {
  const name = who(player.account);
  const unused = player.boosters.reduce((sum, booster) => sum + booster.quantity, 0);
  const stats = [
    { key: "coins", label: "Coins", value: player.wallet.balance.toLocaleString("en"), note: `${player.wallet.earned.toLocaleString("en")} earned in total`, icon: <Coins aria-hidden className="size-4" /> },
    {
      key: "season",
      label: "Season tier",
      value: player.season ? String(player.season.tier) : "—",
      note: player.season ? (player.season.premium ? "Premium" : "free track") : "no season running",
      icon: <Crown aria-hidden className="size-4" />,
    },
    { key: "cosmetics", label: "Cosmetics", value: player.cosmetics.length.toLocaleString("en"), note: "owned", icon: <Sparkles aria-hidden className="size-4" /> },
    { key: "boosters", label: "Boosted openings", value: unused.toLocaleString("en"), note: "unused", icon: <Zap aria-hidden className="size-4" /> },
  ];
  const tool = { player, name, change };
  return (
    <div className="grid gap-4 border-t border-border pt-4">
      <div className="dash-chosen">
        <div className="mr-auto min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-medium">
            {name}
            {player.admin ? (
              <span className="dash-pill" data-role={player.admin}>
                {player.admin === "owner" ? "Owner" : "Admin"}
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {player.account?.email ?? player.account?.id} · member since {when(player.memberSince)}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close player">
          <X aria-hidden />
        </Button>
      </div>
      <div className="dash-stats">
        {stats.map((stat) => (
          <div key={stat.key} className="dash-stat">
            <p className="dash-label">{stat.label}</p>
            <span className="dash-stat-icon">{stat.icon}</span>
            <p className="dash-stat-value">{stat.value}</p>
            <p className="dash-stat-note">{stat.note}</p>
          </div>
        ))}
      </div>
      <PremiumTool {...tool} />
      <CoinTool {...tool} />
      <CosmeticTool {...tool} />
      <BoosterTool {...tool} />
    </div>
  );
}

function PremiumTool({ player, name, change }: Tool) {
  const season = player.season;
  if (!season) {
    return (
      <div className="dash-step">
        <span className="dash-label">Season Pass Premium</span>
        <p className="dash-empty">No season is running right now.</p>
      </div>
    );
  }
  const paid = season.premiumSource === "purchase" ? (season.premiumPaid ?? 0) : 0;

  function grant() {
    change(
      "Grant Season Pass Premium?",
      "Grant Premium",
      <p>{name} gets the Premium track for this season right away and can claim premium rewards for tiers they’ve already reached. No coins are charged.</p>,
      { action: "premium", premium: true, refund: false },
      () => `${name} now has Premium.`,
    );
  }

  function revoke(refund: boolean) {
    change(
      refund ? "Revoke Premium and refund?" : "Revoke Season Pass Premium?",
      refund ? "Revoke and refund" : "Revoke Premium",
      <p>
        {name} loses the Premium track for this season. Premium rewards they already claimed are kept.
        {refund ? ` They get ${coins(paid)} back.` : paid ? ` The ${coins(paid)} they paid aren’t refunded.` : ""}
      </p>,
      { action: "premium", premium: false, refund },
      (result) => (result.refund ? `Revoked Premium and refunded ${coins(result.refund)}.` : `Revoked Premium for ${name}.`),
      true,
    );
  }

  return (
    <div className="dash-step">
      <span className="dash-label">Season Pass Premium</span>
      <div className="dash-row">
        <div className="dash-row-main">
          <div className="dash-row-text">
            <p className="dash-row-title">
              {season.premium ? "Premium" : "Free track only"}
              {season.premium ? (
                <span className="dash-pill" data-status="consumed">
                  <span className="dash-pill-dot" />
                  {season.premiumSource === "purchase" ? `Bought for ${coins(paid)}` : "Granted"}
                </span>
              ) : null}
            </p>
            <p className="dash-row-meta">
              Tier {season.tier}
              {season.tiers ? ` of ${season.tiers}` : ""} · season ends {when(season.endsAt)}
              {season.premiumAt ? ` · Premium since ${when(season.premiumAt)}` : ""}
            </p>
          </div>
        </div>
        <div className="dash-row-actions">
          {season.premium ? (
            <>
              <Button variant="outline" size="sm" onClick={() => revoke(false)}>
                Revoke
              </Button>
              {paid > 0 ? (
                <Button variant="outline" size="sm" onClick={() => revoke(true)}>
                  Revoke and refund
                </Button>
              ) : null}
            </>
          ) : (
            <Button size="sm" onClick={grant}>
              Grant Premium
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CoinTool({ player, name, change }: Tool) {
  const [mode, setMode] = useState<"give" | "take">("give");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const value = Number(amount);
  const text = reason.trim();
  const validAmount = Number.isInteger(value) && value >= 1 && value <= 1_000_000;
  const tooMuch = mode === "take" && validAmount && value > player.wallet.balance;
  const ready = validAmount && text.length >= 3 && text.length <= 200 && !tooMuch;

  function review() {
    if (!ready) return;
    const signed = mode === "give" ? value : -value;
    const verb = mode === "give" ? "Gave" : "Took";
    change(
      mode === "give" ? "Give coins?" : "Take coins?",
      mode === "give" ? "Give coins" : "Take coins",
      <dl className="dash-summary">
        <div>
          <dt>Player</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt>{mode === "give" ? "Give" : "Take"}</dt>
          <dd>{coins(value)}</dd>
        </div>
        <div>
          <dt>Balance</dt>
          <dd>
            {coins(player.wallet.balance)} → {coins(player.wallet.balance + signed)}
          </dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{text}</dd>
        </div>
      </dl>,
      { action: "coins", amount: signed, reason: text },
      (result) => {
        setAmount("");
        setReason("");
        return `${verb} ${coins(value)}.${typeof result.balance === "number" ? ` New balance: ${coins(result.balance)}.` : ""}`;
      },
      mode === "take",
    );
  }

  return (
    <div className="dash-step">
      <span className="dash-label">Coins</span>
      <div className="flex flex-wrap items-center gap-2">
        <div className="dash-segment" role="group" aria-label="Give or take">
          {(["give", "take"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)}>
              {option === "give" ? "Give" : "Take"}
            </button>
          ))}
        </div>
        <Input className="w-32" type="number" inputMode="numeric" min={1} max={1000000} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" aria-label="Amount of coins" />
        <Input className="min-w-48 flex-1" maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (required)" aria-label="Reason" />
        <Button size="sm" onClick={review} disabled={!ready}>
          Review
        </Button>
      </div>
      {tooMuch ? <p className="dash-hint">They only have {coins(player.wallet.balance)}.</p> : null}
      {player.transactions.length ? (
        <ul className="dash-list dash-scroll" aria-label="Recent coin history">
          {player.transactions.map((row) => (
            <li key={row.id} className="dash-row">
              <div className="dash-row-main">
                <div className="dash-row-text">
                  <p className="dash-row-title">
                    {row.amount > 0 ? "+" : ""}
                    {coins(row.amount)}
                    <span className="font-normal text-muted-foreground">{row.kind}</span>
                  </p>
                  <p className="dash-row-meta">
                    {row.reason ? `${row.reason} · ` : ""}
                    {when(row.createdAt)} · balance {row.balanceAfter.toLocaleString("en")}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dash-hint">No coin history yet.</p>
      )}
    </div>
  );
}

function CosmeticTool({ player, name, change }: Tool) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const owned = new Set(player.cosmetics.map((item) => item.id));
  const ownedShown = player.cosmetics.filter((item) => matches(item.id, term));
  const giveable = term ? player.catalog.filter((item) => !owned.has(item.id) && matches(item.id, term)).slice(0, 24) : [];

  function give(id: string) {
    change(
      "Give this cosmetic?",
      "Give item",
      <p>
        {name} gets {itemName(id)} ({itemType(id)}). No coins are charged.
      </p>,
      { action: "cosmetic", item: id, owned: true },
      () => `Gave ${itemName(id)} to ${name}.`,
    );
  }

  function take(id: string) {
    change(
      "Take this cosmetic?",
      "Take item",
      <p>
        {itemName(id)} is removed from {name}’s inventory and taken off anywhere it’s worn or used. No coins are refunded.
      </p>,
      { action: "cosmetic", item: id, owned: false },
      () => `Took ${itemName(id)} from ${name}.`,
      true,
    );
  }

  return (
    <div className="dash-step">
      <span className="dash-label">Cosmetics</span>
      <div className="dash-search">
        <Search aria-hidden />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cosmetics to give or take" aria-label="Search cosmetics" />
      </div>
      {term ? (
        giveable.length ? (
          <ul className="dash-list dash-scroll" aria-label="Not owned">
            {giveable.map((item) => (
              <li key={item.id} className="dash-row">
                <div className="dash-row-main">
                  <div className="dash-row-text">
                    <p className="dash-row-title">{itemName(item.id)}</p>
                    <p className="dash-row-meta">
                      {itemType(item.id)} · not owned
                    </p>
                  </div>
                </div>
                <div className="dash-row-actions">
                  <Button variant="outline" size="sm" onClick={() => give(item.id)}>
                    Give
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dash-hint">No unowned item matches.</p>
        )
      ) : (
        <p className="dash-hint">Search to give an item they don’t own yet.</p>
      )}
      <span className="dash-label">Owned ({player.cosmetics.length})</span>
      {ownedShown.length ? (
        <ul className="dash-list dash-scroll" aria-label="Owned">
          {ownedShown.map((item) => (
            <li key={item.id} className="dash-row">
              <div className="dash-row-main">
                <div className="dash-row-text">
                  <p className="dash-row-title">{itemName(item.id)}</p>
                  <p className="dash-row-meta">
                    {itemType(item.id)} · since {when(item.acquiredAt)}
                  </p>
                </div>
              </div>
              <div className="dash-row-actions">
                <Button variant="outline" size="sm" onClick={() => take(item.id)}>
                  Take
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dash-empty">{player.cosmetics.length ? "No owned item matches." : "They don’t own any cosmetics yet."}</p>
      )}
    </div>
  );
}

function BoosterTool({ player, name, change }: Tool) {
  const [count, setCount] = useState("10");
  const charges = Number(count);
  const valid = Number.isInteger(charges) && charges >= 1 && charges <= 10_000;

  function adjust(booster: AdminPlayer["boosters"][number], op: "give" | "take" | "end") {
    const label = `×${booster.multiplier} luck booster`;
    const text =
      op === "give"
        ? `${name} gets ${charges.toLocaleString("en")} unused boosted openings of the ${label}.`
        : op === "take"
          ? `${charges.toLocaleString("en")} unused boosted openings of the ${label} are removed. No coins are refunded.`
          : `The ${booster.active.toLocaleString("en")} active boosted openings of the ${label} end now. No coins are refunded.`;
    change(
      op === "give" ? "Give boosted openings?" : op === "take" ? "Take boosted openings?" : "End the active booster?",
      op === "give" ? "Give" : op === "take" ? "Take" : "End booster",
      <p>{text}</p>,
      { action: "booster", booster: booster.id, op, charges: op === "end" ? null : charges },
      () => (op === "give" ? `Gave ${charges.toLocaleString("en")} boosted openings.` : op === "take" ? `Took ${charges.toLocaleString("en")} boosted openings.` : `Ended the ${label}.`),
      op !== "give",
    );
  }

  return (
    <div className="dash-step">
      <span className="dash-label">Luck boosters</span>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-32" type="number" inputMode="numeric" min={1} max={10000} value={count} onChange={(event) => setCount(event.target.value)} aria-label="Boosted openings to give or take" />
        <span className="dash-hint">boosted openings to give or take</span>
      </div>
      {player.boosters.length ? (
        <ul className="dash-list">
          {player.boosters.map((booster) => (
            <li key={booster.id} className="dash-row">
              <div className="dash-row-main">
                <div className="dash-row-text">
                  <p className="dash-row-title">×{booster.multiplier} luck booster</p>
                  <p className="dash-row-meta">
                    {booster.quantity.toLocaleString("en")} unused · {booster.active.toLocaleString("en")} active openings
                  </p>
                </div>
              </div>
              <div className="dash-row-actions">
                <Button variant="outline" size="sm" disabled={!valid} onClick={() => adjust(booster, "give")}>
                  Give
                </Button>
                <Button variant="outline" size="sm" disabled={!valid || booster.quantity < charges} onClick={() => adjust(booster, "take")}>
                  Take
                </Button>
                <Button variant="outline" size="sm" disabled={booster.active === 0} onClick={() => adjust(booster, "end")}>
                  End active
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dash-empty">No boosters exist.</p>
      )}
    </div>
  );
}
