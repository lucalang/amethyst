"use client";

import { useEffect, useRef, useState } from "react";
import { AchievementBadge } from "@/components/achievements/achievement-badge";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { kindLabel, RewardArt, rewardInfo, rewardSummary } from "@/components/vault/vault-reveal";
import type { SanctumSound } from "@/components/vault/vault-audio";
import { achievementDefinition } from "@/lib/achievements";
import { ApiError, apiFetch } from "@/lib/api-client";
import { codeStatus, needsRepeatConfirmation, type AdminCodeDetail, type CodeConfig } from "@/lib/vault-admin";
import { configOf, PayoutFacts, raisesPayout, RepeatConfirm, RulesFields, updateOf, validateConfig, type ConfigErrors } from "./admin-config";
import { RewardsEditor, type RewardContext } from "./admin-rewards";
import { Panel, useStage } from "./admin-stage";
import { accountName, ACTION_LABEL, ConfirmAction, countdown, FIELD_LABEL, formatWhen, number, PanelHead, plural, StatusBadge, useNow } from "./admin-ui";

type Load = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ready"; code: AdminCodeDetail };

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return key === "maxRedemptions" ? "no limit" : key === "expiresAt" ? "never" : key === "startsAt" ? "on publish" : "none";
  if (key === "startsAt" || key === "expiresAt") return formatWhen(String(value));
  if (Array.isArray(value)) {
    if (key === "allowlist") return plural(value.length, "account");
    if (!value.length) return "none";
    return value.map((id) => (key === "achievements" ? (achievementDefinition(String(id))?.name ?? String(id)) : rewardInfo(String(id)).name)).join(", ");
  }
  if (key === "audience") return value === "allowlist" ? "listed accounts" : "everyone";
  if (typeof value === "number") return number(value);
  return String(value);
}

const failure = (error: unknown, fallback: string) => (error instanceof ApiError && error.status > 0 && error.status < 500 ? error.message : fallback);

/** One code: its settings, who redeemed it and what changed, with editing, disabling and cloning. */
export function Detail({
  id,
  fallbackNow,
  context,
  sound,
  onChanged,
  onClone,
}: {
  id: string;
  fallbackNow: number;
  context: RewardContext;
  sound: (name: SanctumSound) => void;
  onChanged: () => void;
  onClone: (code: AdminCodeDetail) => void;
}) {
  const now = useNow(fallbackNow);
  const { engine } = useStage();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<CodeConfig | null>(null);
  const [confirmRepeat, setConfirmRepeat] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [serverErrors, setServerErrors] = useState<ConfigErrors>({});
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<{ code: AdminCodeDetail }>(`/api/admin/vault/codes/${id}`, { signal: controller.signal })
      .then(({ code }) => setLoad({ status: "ready", code }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoad({ status: error instanceof ApiError && error.status === 404 ? "missing" : "error" });
      });
    return () => controller.abort();
  }, [id, version]);

  const alertMain = () => {
    const panel = mainRef.current?.closest<HTMLElement>(".cs-panel");
    if (panel) engine?.alert(panel);
  };

  if (load.status !== "ready") {
    return (
      <Panel station="detail" slot="summary" label="Code">
        <div className="cs-panel-inner cs-empty-panel" aria-busy={load.status === "loading"}>
          <p className="cs-title">{load.status === "loading" ? "Reading the code…" : load.status === "missing" ? "This code doesn’t exist" : "The code couldn’t be loaded"}</p>
          {load.status === "error" ? (
            <button type="button" className="cs-button" onClick={() => setVersion(version + 1)}>
              Try again
            </button>
          ) : null}
        </div>
      </Panel>
    );
  }

  const code = load.code;
  const status = codeStatus(code, now);
  const original = configOf(code);
  const errors: ConfigErrors = editing && attempted ? { ...validateConfig(editing, { now, confirmRepeat, original }), ...serverErrors } : serverErrors;

  const change = (patch: Partial<CodeConfig>) => {
    setEditing((current) => (current ? { ...current, ...patch } : current));
    setServerErrors({});
  };

  const save = async () => {
    if (!editing) return;
    setAttempted(true);
    if (Object.keys(validateConfig(editing, { now, confirmRepeat, original })).length) {
      sound("error");
      alertMain();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/admin/vault/codes/${id}`, { method: "PATCH", json: { config: updateOf(editing), confirmRepeat } });
      sound("confirm");
      setEditing(null);
      setAttempted(false);
      setMessage({ tone: "ok", text: "Saved. Future redemptions use the new settings." });
      setVersion((value) => value + 1);
      onChanged();
    } catch (error) {
      sound("error");
      alertMain();
      if (error instanceof ApiError && error.code === "confirm_repeat") setServerErrors({ confirm: error.message });
      else setMessage({ tone: "error", text: failure(error, "The changes couldn’t be saved. Nothing was changed.") });
    } finally {
      setBusy(false);
    }
  };

  const setDisabled = async (disabled: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/admin/vault/codes/${id}`, { method: "PATCH", json: { disabled } });
      sound("confirm");
      setMessage({ tone: "ok", text: disabled ? "Disabled. Nobody can redeem it until you enable it again." : "Enabled again. Players can redeem it within its schedule and limits." });
      setVersion((value) => value + 1);
      onChanged();
    } catch (error) {
      sound("error");
      setMessage({ tone: "error", text: failure(error, disabled ? "The code couldn’t be disabled. Try again." : "The code couldn’t be enabled. Try again.") });
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setEditing(original);
    setConfirmRepeat(false);
    setAttempted(false);
    setServerErrors({});
    setMessage(null);
    sound("select");
  };

  const shown = editing ?? original;
  const needsConfirm = editing ? needsRepeatConfirmation(editing) && raisesPayout(editing, original) : false;

  return (
    <>
      <Panel station="detail" slot="summary" kind="panel" tone={status} label={`Code ${code.label}`}>
        <div className="cs-panel-inner">
          <PanelHead kicker={code.format === "phrase" ? "Phrase code" : "Code"} title={code.label}>
            <StatusBadge status={status} />
          </PanelHead>
          <p className="cs-hint">
            Published {formatWhen(code.createdAt)}
            {code.createdByName ? ` by ${code.createdByName}` : ""}. The code itself is stored only as a hash, so it can’t be shown again.
          </p>
          <div className="cs-stat-row">
            <div className="cs-stat">
              <span className="cs-kicker">Redeemed</span>
              <span className="cs-stat-value tabular-nums">
                {number(code.redemptionCount)}
                <small> / {code.maxRedemptions === null ? "∞" : number(code.maxRedemptions)}</small>
              </span>
              <span className="cs-meter" aria-hidden>
                <span style={{ width: code.maxRedemptions ? `${Math.min(100, (code.redemptionCount / code.maxRedemptions) * 100)}%` : "0%" }} />
              </span>
            </div>
            <div className="cs-stat">
              <span className="cs-kicker">{status === "scheduled" ? "Starts in" : "Expires"}</span>
              <span className="cs-stat-value tabular-nums">
                {status === "scheduled" && code.startsAt
                  ? countdown(Date.parse(code.startsAt) - now)
                  : code.expiresAt
                    ? Date.parse(code.expiresAt) > now
                      ? `in ${countdown(Date.parse(code.expiresAt) - now)}`
                      : "passed"
                    : "never"}
              </span>
            </div>
          </div>
          {message ? (
            <p className={message.tone === "ok" ? "cs-success" : "cs-error"} role={message.tone === "ok" ? "status" : "alert"}>
              {message.text}
            </p>
          ) : null}
          <div className="cs-actions">
            <button type="button" className="cs-button cs-button-primary" disabled={Boolean(editing) || busy} onClick={startEditing}>
              Edit
            </button>
            {code.disabledAt ? (
              <ConfirmAction
                trigger={
                  <button type="button" className="cs-button" disabled={busy}>
                    Enable again
                  </button>
                }
                title="Enable this code again?"
                description="Players can redeem it again within its schedule and limits."
                confirm="Enable"
                onConfirm={() => void setDisabled(false)}
              />
            ) : (
              <ConfirmAction
                trigger={
                  <button type="button" className="cs-button cs-button-quiet-danger" disabled={busy}>
                    Disable
                  </button>
                }
                title="Disable this code?"
                description="Nobody can redeem it while it’s disabled. What was already granted stays, and you can enable it again later."
                confirm="Disable code"
                danger
                onConfirm={() => void setDisabled(true)}
              />
            )}
            <button type="button" className="cs-button" onClick={() => onClone(code)}>
              Clone
            </button>
          </div>
        </div>
      </Panel>

      <Panel station="detail" slot="main" label={editing ? "Edit the code" : "Settings"}>
        <div ref={mainRef} className="cs-panel-inner">
          {editing ? (
            <form
              className="cs-form"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <PanelHead kicker="Editing" title="Settings" />
              <p className="cs-notice">Changes only affect future redemptions. Whatever players already redeemed stays theirs.</p>
              <h3 className="cs-subtitle">Rewards</h3>
              <RewardsEditor idPrefix="cs-edit" value={editing} onChange={change} context={context} error={errors.rewards} />
              <h3 className="cs-subtitle">Rules</h3>
              <RulesFields idPrefix="cs-edit" config={editing} onChange={change} errors={errors} accounts={code.allowlist} />
              <PayoutFacts config={editing} />
              {needsConfirm ? <RepeatConfirm id="cs-edit-confirm" config={editing} checked={confirmRepeat} onChange={setConfirmRepeat} error={errors.confirm} /> : null}
              <div className="cs-actions">
                <button type="submit" className="cs-button cs-button-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  className="cs-button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(null);
                    setServerErrors({});
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <PanelHead kicker="Configuration" title="Settings" />
              <h3 className="cs-subtitle">Rewards</h3>
              <ul className="cs-reward-grid">
                {shown.coins ? (
                  <li className="cs-reward">
                    <span className="cs-coin" aria-hidden />
                    <span>
                      <span className="cs-option-name">{plural(shown.coins, "coin")}</span>
                      <span className="cs-option-meta">Per redemption</span>
                    </span>
                  </li>
                ) : null}
                {shown.items.map((item) => {
                  const info = rewardInfo(item);
                  return (
                    <li key={item} className="cs-reward">
                      <span className="cs-option-art" aria-hidden>
                        <RewardArt id={item} size="slot" looks={context.looks} />
                      </span>
                      <span>
                        <span className="cs-option-name">{info.name}</span>
                        <span className="cs-option-meta">{kindLabel(info)}</span>
                      </span>
                    </li>
                  );
                })}
                {shown.achievements.map((item) => {
                  const definition = achievementDefinition(item);
                  return (
                    <li key={item} className="cs-reward">
                      <span className="cs-option-art" aria-hidden>
                        {definition ? <AchievementBadge achievement={definition} earned size={36} /> : null}
                      </span>
                      <span>
                        <span className="cs-option-name">{definition?.name ?? item}</span>
                        <span className="cs-option-meta">Achievement</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <dl className="cs-facts">
                <div>
                  <dt>Who</dt>
                  <dd>{code.audience === "allowlist" ? `Only ${plural(code.allowlist.length, "listed account")}` : "Every signed-in account"}</dd>
                </div>
                <div>
                  <dt>Start</dt>
                  <dd>{code.startsAt ? formatWhen(code.startsAt) : "When published"}</dd>
                </div>
                <div>
                  <dt>Expiry</dt>
                  <dd>{code.expiresAt ? formatWhen(code.expiresAt) : "Never"}</dd>
                </div>
                <div>
                  <dt>Total redemptions</dt>
                  <dd>{code.maxRedemptions === null ? "No limit" : number(code.maxRedemptions)}</dd>
                </div>
                <div>
                  <dt>Per account</dt>
                  <dd>{plural(code.perAccountLimit, "time")}</dd>
                </div>
              </dl>
              {code.audience === "allowlist" && code.allowlist.length ? (
                <ul className="cs-account-list">
                  {code.allowlist.map((account) => (
                    <li key={account.id} className="cs-account cs-account-static">
                      <ProfileAvatar name={account.name} src={account.avatarUrl} decoration={null} className="size-7 text-[0.6rem]" />
                      <span className="cs-account-text">{accountName(account)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <PayoutFacts config={original} />
            </>
          )}
        </div>
      </Panel>

      <Panel station="detail" slot="history" order={0} label="Redemptions">
        <div className="cs-panel-inner">
          <PanelHead kicker={plural(code.redemptions.length, "redemption")} title="Redeemed by" />
          {code.redemptions.length ? (
            <ol className="cs-list">
              {code.redemptions.map((redemption) => (
                <li key={redemption.id} className="cs-list-row cs-list-static">
                  <ProfileAvatar name={redemption.account?.name} src={redemption.account?.avatarUrl} decoration={null} className="size-8 text-[0.65rem]" />
                  <span className="cs-list-main">
                    <span className="cs-list-title">{accountName(redemption.account)}</span>
                    <span className="cs-option-meta">
                      {[rewardSummary(redemption.coins, redemption.items), redemption.achievementsNew.length ? plural(redemption.achievementsNew.length, "new achievement") : null].filter(Boolean).join(" · ") || "Nothing new"}
                    </span>
                  </span>
                  <span className="cs-list-side">{formatWhen(redemption.redeemedAt)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="cs-empty">Nobody has redeemed it yet.</p>
          )}
        </div>
      </Panel>

      <Panel station="detail" slot="history" order={1} label="Audit log">
        <div className="cs-panel-inner">
          <PanelHead kicker="Every change" title="Audit log" />
          <ol className="cs-feed">
            {code.audit.map((entry) => (
              <li key={entry.id} className="cs-feed-item" data-action={entry.action}>
                <span className="cs-feed-mark" aria-hidden />
                <span className="cs-feed-text">
                  <span>
                    {ACTION_LABEL[entry.action] ?? entry.action} by {entry.actor ? accountName(entry.actor) : "the command line"}
                  </span>
                  <span className="cs-option-meta">
                    {formatWhen(entry.at)}
                    {entry.via === "cli" ? " · from the command line" : ""}
                  </span>
                  {entry.changes ? (
                    <ul className="cs-diff">
                      {Object.entries(entry.changes).map(([key, diff]) => (
                        <li key={key}>
                          <span className="cs-diff-key">{FIELD_LABEL[key] ?? key}</span> {formatValue(key, diff.from)} <span aria-hidden>→</span>
                          <span className="sr-only">changed to</span> {formatValue(key, diff.to)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </Panel>
    </>
  );
}
