"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { codeStatus, type AdminCode, type AdminSnapshot } from "@/lib/vault-admin";
import { describeRewards } from "./admin-rewards";
import { Panel, useStage } from "./admin-stage";
import { ACTION_LABEL, FIELD_LABEL, accountName, countdown, CountUp, formatDay, NavLink, number, PanelHead, plural, timeAgo, useNow } from "./admin-ui";

const WEEK = 7 * 86_400_000;

/** Codes that run out soon: active or scheduled, expiring within a week. */
const expiringSoon = (codes: AdminCode[], now: number) =>
  codes
    .filter((code) => code.expiresAt && ["active", "scheduled"].includes(codeStatus(code, now)) && Date.parse(code.expiresAt) - now < WEEK)
    .sort((a, b) => Date.parse(a.expiresAt!) - Date.parse(b.expiresAt!));

/** Active codes with at least 80% of their redemptions used, or at most 5 left. */
const nearlyUsedUp = (codes: AdminCode[], now: number) =>
  codes
    .filter((code) => code.maxRedemptions !== null && codeStatus(code, now) === "active" && (code.redemptionCount / code.maxRedemptions >= 0.8 || code.maxRedemptions - code.redemptionCount <= 5))
    .sort((a, b) => a.maxRedemptions! - a.redemptionCount - (b.maxRedemptions! - b.redemptionCount));

export function Overview({ snapshot, animate, current }: { snapshot: AdminSnapshot; animate: boolean; current: boolean }) {
  const now = useNow(snapshot.now);
  const { engine } = useStage();
  const { codes, stats } = snapshot;
  const [hover, setHover] = useState(-1);
  const statuses = codes.map((code) => codeStatus(code, now));
  const active = statuses.filter((status) => status === "active").length;
  const scheduled = statuses.filter((status) => status === "scheduled").length;
  const values = useMemo(() => stats.timeline.map((day) => day.redemptions), [stats.timeline]);
  const max = Math.max(1, ...values);
  const monthTotal = values.reduce((sum, value) => sum + value, 0);
  const expiring = expiringSoon(codes, now);
  const nearly = nearlyUsedUp(codes, now);
  const counting = animate && current;

  useEffect(() => {
    engine?.setTimeline(values, hover);
  }, [engine, values, hover]);

  const counters = [
    { key: "active", label: "Active codes", value: active, note: scheduled ? `${plural(scheduled, "code")} scheduled` : "None scheduled" },
    { key: "redemptions", label: "Total redemptions", value: stats.totals.redemptions, note: `by ${plural(stats.totals.accounts, "account")}` },
    { key: "coins", label: "Coins granted", value: stats.totals.coins, note: "through codes, all time" },
    { key: "week", label: "Redemptions this week", value: stats.totals.week, note: "the last 7 days" },
  ];
  const focus = hover >= 0 ? stats.timeline[hover] : null;

  return (
    <>
      {counters.map((counter, index) => (
        <Panel key={counter.key} station="overview" slot="counters" order={index} kind="counter" label={counter.label}>
          <div className="cs-counter">
            <p className="cs-kicker">{counter.label}</p>
            <p className="cs-counter-value">
              <CountUp value={counter.value} animate={counting} delay={250 + index * 120} />
            </p>
            <p className="cs-counter-note">{counter.note}</p>
          </div>
        </Panel>
      ))}

      <Panel station="overview" slot="timeline" kind="timeline" label="Redemptions over the last 30 days">
        <div className="cs-panel-inner">
          <PanelHead kicker={`Last 30 days · ${stats.timeZone}`} title="Redemptions" />
          <div className="cs-chart" data-chart aria-hidden onPointerLeave={() => setHover(-1)}>
            {stats.timeline.map((day, index) => (
              <div
                key={day.day}
                className="cs-bar"
                data-hot={index === hover ? "" : undefined}
                style={{ "--h": `${(day.redemptions / max) * 100}%` } as CSSProperties}
                onPointerEnter={() => setHover(index)}
              >
                <span className="cs-bar-fill" />
              </div>
            ))}
          </div>
          <div className="cs-chart-axis" aria-hidden>
            <span>{stats.timeline[0] ? formatDay(stats.timeline[0].day) : ""}</span>
            <span>Today</span>
          </div>
          <p className="cs-chart-readout">
            {focus ? (
              <>
                <strong>{formatDay(focus.day)}</strong> · {plural(focus.redemptions, "redemption")} · {plural(focus.coins, "coin")}
              </>
            ) : (
              <>
                <strong>{number(monthTotal)}</strong> {monthTotal === 1 ? "redemption" : "redemptions"} in 30 days. Point at a day for details.
              </>
            )}
          </p>
          <table className="sr-only">
            <caption>Redemptions per day, last 30 days</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Redemptions</th>
                <th scope="col">Coins</th>
              </tr>
            </thead>
            <tbody>
              {stats.timeline.map((day) => (
                <tr key={day.day}>
                  <th scope="row">{formatDay(day.day)}</th>
                  <td>{day.redemptions}</td>
                  <td>{day.coins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel station="overview" slot="lists" order={0} label="Expiring soon">
        <div className="cs-panel-inner">
          <PanelHead kicker="Within 7 days" title="Expiring soon" />
          {expiring.length ? (
            <ul className="cs-list">
              {expiring.map((code) => (
                <li key={code.id}>
                  <NavLink href={`/admin/codes/${code.id}`} className="cs-list-row" data-card>
                    <span className="cs-list-main">
                      <span className="cs-list-title">{code.label}</span>
                      <span className="cs-option-meta">{describeRewards(code)}</span>
                    </span>
                    <span className="cs-list-side cs-warn tabular-nums">in {countdown(Date.parse(code.expiresAt!) - now)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cs-empty">No code expires in the next 7 days.</p>
          )}
        </div>
      </Panel>

      <Panel station="overview" slot="lists" order={1} label="Nearly used up">
        <div className="cs-panel-inner">
          <PanelHead kicker="80% used or 5 left" title="Nearly used up" />
          {nearly.length ? (
            <ul className="cs-list">
              {nearly.map((code) => (
                <li key={code.id}>
                  <NavLink href={`/admin/codes/${code.id}`} className="cs-list-row" data-card>
                    <span className="cs-list-main">
                      <span className="cs-list-title">{code.label}</span>
                      <span className="cs-meter" aria-hidden>
                        <span style={{ width: `${Math.min(100, (code.redemptionCount / code.maxRedemptions!) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="cs-list-side tabular-nums">
                      {number(code.redemptionCount)} / {number(code.maxRedemptions!)}
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cs-empty">No active code is close to its limit.</p>
          )}
        </div>
      </Panel>

      <Panel station="overview" slot="activity" label="Recent activity">
        <div className="cs-panel-inner">
          <PanelHead kicker="Audit log" title="Activity" />
          {stats.activity.length ? (
            <ol className="cs-feed">
              {stats.activity.map((item) => (
                <li key={item.id} className="cs-feed-item" data-action={item.action}>
                  <span className="cs-feed-mark" aria-hidden />
                  <span className="cs-feed-text">
                    <span>
                      {ACTION_LABEL[item.action] ?? item.action}{" "}
                      <NavLink href={`/admin/codes/${item.codeId}`} className="cs-link">
                        {item.label}
                      </NavLink>
                      {item.changed?.length ? ` (${item.changed.map((key) => FIELD_LABEL[key] ?? key).join(", ")})` : ""}
                    </span>
                    <span className="cs-option-meta">
                      {accountName(item.actor)} · {timeAgo(item.at, now)}
                      {item.via === "cli" ? " · from the command line" : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="cs-empty">Nothing has happened yet. Publish a code in the Forge.</p>
          )}
        </div>
      </Panel>
    </>
  );
}
