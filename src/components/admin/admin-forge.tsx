"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DecodeText } from "@/components/vault/vault-reveal";
import type { SanctumSound, startSanctumCharge } from "@/components/vault/vault-audio";
import { ApiError, apiFetch } from "@/lib/api-client";
import { compactCode, normalizePhrase } from "@/lib/code-format";
import type { MotionLevel } from "@/lib/preferences";
import { configFrom, EMPTY_CONFIG, needsRepeatConfirmation, type AdminCodeDetail, type AdminDraft, type CodeConfig } from "@/lib/vault-admin";
import { cloneConfig, draftable, effectiveConfig, PayoutFacts, RepeatConfirm, RulesFields, validateConfig, type ConfigErrors } from "./admin-config";
import { describeRewards, RewardsEditor, RewardTokens, type RewardContext } from "./admin-rewards";
import { Panel, useStage } from "./admin-stage";
import { PUBLISH } from "./admin-timing";
import { ConfirmAction, formatWhen, NavLink, PanelHead, plural, useNow } from "./admin-ui";

/** How a Forge session starts: empty, from a draft, or as a clone (config given, or fetched by id). */
export type ForgeSeed = { key: number; draft?: string; clone?: string; config?: CodeConfig };

type Phase = "edit" | "charging" | "publishing" | "done";
type Published = { id: string; code: string; format: "compact" | "phrase" };

const NO_ANSWER = "No answer from the server. Check the code list before publishing again.";
const SAVE_FAILED = "The draft couldn’t be saved. Your choices are still here; try again.";
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function Forge({
  seed,
  drafts,
  context,
  motion,
  fallbackNow,
  sound,
  startCharge,
  onNew,
  onDraftSaved,
  onPublished,
}: {
  seed: ForgeSeed;
  drafts: AdminDraft[];
  context: RewardContext;
  motion: MotionLevel;
  fallbackNow: number;
  sound: (name: SanctumSound) => void;
  startCharge: () => ReturnType<typeof startSanctumCharge>;
  onNew: () => void;
  onDraftSaved: () => void;
  onPublished: () => void;
}) {
  const now = useNow(fallbackNow);
  const { engine } = useStage();
  const [config, setConfig] = useState<CodeConfig>(() => {
    if (seed.config) return seed.config;
    const draft = seed.draft ? drafts.find((item) => item.id === seed.draft) : undefined;
    return draft ? configFrom(draft.config) : { ...EMPTY_CONFIG };
  });
  const [draftId, setDraftId] = useState<string | null>(() => (seed.draft && drafts.some((item) => item.id === seed.draft) ? seed.draft : null));
  const draftRef = useRef(draftId);
  const [code, setCode] = useState("");
  const [confirmRepeat, setConfirmRepeat] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<{ state: "idle" | "saving" | "saved" | "error"; at?: string }>({ state: "idle" });
  const [retry, setRetry] = useState(0);
  const [cloning, setCloning] = useState(Boolean(seed.clone && !seed.config));
  const [notice, setNotice] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("edit");
  const [charge, setCharge] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ConfigErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<Published | null>(null);
  const [copied, setCopied] = useState(false);
  const hold = useRef<{ frame: number; audio: ReturnType<typeof startSanctumCharge> } | null>(null);
  const sealRef = useRef<HTMLDivElement>(null);

  // A new session starts with a calm core.
  useEffect(() => {
    engine?.publish("idle");
  }, [engine]);

  useEffect(() => {
    if (!seed.clone || seed.config) return;
    const controller = new AbortController();
    apiFetch<{ code: AdminCodeDetail }>(`/api/admin/vault/codes/${seed.clone}`, { signal: controller.signal })
      .then(({ code: source }) => {
        setConfig(cloneConfig(source, Date.now()));
        setCloning(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setCloning(false);
        setNotice("The code to clone couldn’t be loaded. You can start from scratch here.");
      });
    return () => controller.abort();
  }, [seed.clone, seed.config]);

  // Drafts save themselves shortly after each change (the configuration only, never the code text).
  useEffect(() => {
    if (!dirty || phase === "publishing" || phase === "done") return;
    const timer = window.setTimeout(async () => {
      setSaving({ state: "saving" });
      try {
        const { id } = await apiFetch<{ id: string }>("/api/admin/vault/drafts", { method: "POST", json: { id: draftRef.current, config: draftable(effectiveConfig(config)) } });
        const first = !draftRef.current;
        draftRef.current = id;
        setDraftId(id);
        setSaving({ state: "saved", at: new Date().toISOString() });
        if (first) {
          sound("draft");
          onDraftSaved();
        }
        if (window.location.pathname === "/admin/new") window.history.replaceState(null, "", `/admin/new?draft=${id}`);
      } catch {
        setSaving({ state: "error" });
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [config, dirty, phase, retry, sound, onDraftSaved]);

  useEffect(
    () => () => {
      if (hold.current) {
        cancelAnimationFrame(hold.current.frame);
        hold.current.audio?.stop(false);
      }
    },
    [],
  );

  const change = (patch: Partial<CodeConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setDirty(true);
    setServerErrors({});
    if ("codeMode" in patch) setCode("");
  };

  const checkCode = config.codeMode === "random" ? undefined : code;
  const errors: ConfigErrors = attempted ? { ...validateConfig(config, { now, code: checkCode, confirmRepeat }), ...serverErrors } : serverErrors;
  const problems = Object.values(errors).filter(Boolean);

  const alertSeal = () => {
    const panel = sealRef.current?.closest<HTMLElement>(".cs-panel");
    if (panel) engine?.alert(panel);
  };

  const publish = async () => {
    setPhase("publishing");
    engine?.publish("implode");
    sound("implode");
    const started = performance.now();
    try {
      const published = await apiFetch<Published>("/api/admin/vault/codes", {
        method: "POST",
        json: { config: { ...effectiveConfig(config), label: config.label.trim() }, code: checkCode, confirmRepeat, draftId: draftRef.current },
      });
      await wait(Math.max(0, PUBLISH.implode - (performance.now() - started)));
      engine?.publish("success");
      sound("boom");
      setResult(published);
      setPhase("done");
      setCharge(0);
      onPublished();
    } catch (error) {
      engine?.publish("error");
      sound("error");
      alertSeal();
      setPhase("edit");
      setCharge(0);
      if (error instanceof ApiError && (error.code === "duplicate_code" || error.code === "invalid_code")) setServerErrors({ code: error.message });
      else if (error instanceof ApiError && error.code === "confirm_repeat") setServerErrors({ confirm: error.message });
      setFailure(error instanceof ApiError && error.status > 0 ? error.message : NO_ANSWER);
      window.setTimeout(() => engine?.publish("idle"), 1400);
    }
  };

  const begin = () => {
    if (phase !== "edit" || hold.current) return;
    setAttempted(true);
    setFailure(null);
    if (Object.keys(validateConfig(config, { now: Date.now(), code: checkCode, confirmRepeat })).length) {
      sound("error");
      alertSeal();
      return;
    }
    const audio = startCharge();
    const start = performance.now();
    const step = () => {
      if (!hold.current) return;
      const level = Math.min(1, (performance.now() - start) / PUBLISH.hold);
      engine?.setCharge(level);
      audio?.set(level);
      setCharge(level);
      if (level < 1) {
        hold.current.frame = requestAnimationFrame(step);
        return;
      }
      hold.current = null;
      audio?.stop(true);
      void publish();
    };
    hold.current = { frame: requestAnimationFrame(step), audio };
    setPhase("charging");
  };

  const release = () => {
    const current = hold.current;
    if (!current) return;
    cancelAnimationFrame(current.frame);
    current.audio?.stop(false);
    hold.current = null;
    engine?.setCharge(0);
    setCharge(0);
    setPhase("edit");
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      sound("copy");
    } catch {
      setFailure("Copying didn’t work. Select the code and copy it by hand.");
    }
  };

  const discard = async () => {
    const id = draftRef.current;
    if (!id) return onNew();
    try {
      await apiFetch(`/api/admin/vault/drafts/${id}`, { method: "DELETE" });
      onDraftSaved();
      onNew();
    } catch {
      setFailure("The draft couldn’t be deleted. Try again.");
    }
  };

  const preview =
    config.codeMode === "phrase"
      ? normalizePhrase(code) ?? (code.trim() ? code.trim().toUpperCase() : "YOUR PHRASE")
      : config.codeMode === "custom"
        ? code.trim()
          ? code.trim().toUpperCase()
          : "YOUR-CODE"
        : "????-????-????-????";
  const previewValid = config.codeMode === "random" || (config.codeMode === "phrase" ? Boolean(normalizePhrase(code)) : Boolean(compactCode(code)));
  const locked = phase !== "edit";

  return (
    <>
      <Panel station="forge" slot="plate" kind="plate" label={result ? "Your new code" : "Code preview"}>
        <div className="cs-plate" data-phase={phase} aria-live="polite">
          {result ? (
            <>
              <p className="cs-kicker">Published · {result.format === "phrase" ? "phrase" : "code"}</p>
              <p className="cs-plate-code" data-no-decode>
                <DecodeText text={result.code} animate={motion !== "off"} delay={120} />
              </p>
              <div className="cs-actions cs-actions-center">
                <button type="button" className="cs-button cs-button-primary cs-button-large" onClick={() => void copy()}>
                  {copied ? "Copied" : "Copy code"}
                </button>
                <NavLink href={`/admin/codes/${result.id}`} className="cs-button">
                  View the code
                </NavLink>
                <button type="button" className="cs-button" onClick={onNew}>
                  Forge another
                </button>
              </div>
              <p className="cs-warning">Shown only now. It’s stored as a hash and can’t be shown again.</p>
            </>
          ) : (
            <>
              <p className="cs-kicker">{config.codeMode === "random" ? "Drawn when you publish" : "Players will type"}</p>
              <p className="cs-plate-code" data-pending={previewValid ? undefined : ""} data-no-decode>
                {preview}
              </p>
              <p className="cs-hint">{config.label.trim() ? config.label.trim() : "An unnamed code"} · {describeRewards(config)}</p>
            </>
          )}
        </div>
      </Panel>

      <Panel station="forge" slot="rewards" label="Rewards">
        <div className="cs-panel-inner">
          <PanelHead kicker="Step 1" title="Rewards" />
          {cloning ? <p className="cs-hint">Copying the code’s settings…</p> : null}
          {notice ? <p className="cs-notice">{notice}</p> : null}
          <fieldset disabled={locked || cloning} className="cs-fieldset-plain">
            <RewardsEditor idPrefix="cs-forge" value={config} onChange={change} context={context} error={errors.rewards} />
          </fieldset>
          <RewardTokens value={config} context={context} hidden={phase === "done"} />
        </div>
      </Panel>

      <Panel station="forge" slot="rules" label="Rules">
        <div className="cs-panel-inner">
          <PanelHead kicker="Step 2" title="Rules" />
          <fieldset disabled={locked || cloning} className="cs-fieldset-plain">
            <RulesFields
              idPrefix="cs-forge"
              config={config}
              onChange={change}
              errors={errors}
              code={code}
              onCode={(value) => {
                setCode(value);
                setServerErrors({});
              }}
            />
          </fieldset>
        </div>
      </Panel>

      <Panel station="forge" slot="seal" label="Review and publish">
        <div ref={sealRef} className="cs-panel-inner">
          <PanelHead kicker="Step 3" title="Seal" />
          <dl className="cs-facts">
            <div>
              <dt>Label</dt>
              <dd>{config.label.trim() || "—"}</dd>
            </div>
            <div>
              <dt>Rewards</dt>
              <dd>{describeRewards(config)}</dd>
            </div>
            <div>
              <dt>Code</dt>
              <dd>{config.codeMode === "random" ? "Random, 16 characters" : config.codeMode === "phrase" ? "A phrase" : "Custom text"}</dd>
            </div>
            <div>
              <dt>Who</dt>
              <dd>{config.audience === "allowlist" ? `Only ${plural(config.allowlist.length, "listed account")}` : "Every signed-in account"}</dd>
            </div>
            <div>
              <dt>Runs</dt>
              <dd>
                {config.startsAt ? formatWhen(config.startsAt) : "From publishing"} → {config.expiresAt ? formatWhen(config.expiresAt) : "no expiry"}
              </dd>
            </div>
            <div>
              <dt>Limits</dt>
              <dd>
                {config.maxRedemptions === null ? "No total limit" : `${plural(config.maxRedemptions, "redemption")} in total`} · {plural(config.perAccountLimit || 0, "time")} per account
              </dd>
            </div>
          </dl>
          <PayoutFacts config={config} />
          {needsRepeatConfirmation(config) ? (
            <RepeatConfirm
              id="cs-forge-confirm"
              config={config}
              checked={confirmRepeat}
              onChange={(checked) => {
                setConfirmRepeat(checked);
                setServerErrors({});
              }}
              error={errors.confirm}
            />
          ) : null}
          {problems.length && phase === "edit" ? (
            <div className="cs-problems" role="alert">
              <p>Before publishing:</p>
              <ul>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {failure ? (
            <p className="cs-error" role="alert">
              {failure}
            </p>
          ) : null}
          {phase === "done" ? (
            <p className="cs-success" role="status">
              Published. The draft was cleared.
            </p>
          ) : (
            <button
              type="button"
              className="cs-hold"
              data-phase={phase}
              style={{ "--charge": charge } as CSSProperties}
              disabled={phase === "publishing" || cloning}
              aria-describedby="cs-hold-hint"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                begin();
              }}
              onPointerUp={release}
              onPointerCancel={release}
              onLostPointerCapture={release}
              onKeyDown={(event) => {
                if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                  event.preventDefault();
                  begin();
                }
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") release();
              }}
              onBlur={release}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className="cs-hold-ring" aria-hidden />
              <span className="cs-hold-label">{phase === "publishing" ? "Publishing…" : phase === "charging" ? "Keep holding…" : "Hold to publish"}</span>
            </button>
          )}
          <p id="cs-hold-hint" className="cs-hint">
            {phase === "done" ? "" : "Press and hold the seal (or hold Space) until it’s charged."}
          </p>
          <div className="cs-draft-row">
            <p className="cs-hint" aria-live="polite">
              {saving.state === "saving"
                ? "Saving the draft…"
                : saving.state === "saved" && saving.at
                  ? `Draft saved ${formatWhen(saving.at)}`
                  : saving.state === "error"
                    ? ""
                    : draftId
                      ? "Draft loaded. Changes save automatically."
                      : "Changes are saved as a draft automatically."}
            </p>
            {saving.state === "error" ? (
              <p className="cs-error" role="alert">
                {SAVE_FAILED}{" "}
                <button type="button" className="cs-link" onClick={() => setRetry(retry + 1)}>
                  Try again
                </button>
              </p>
            ) : null}
            {draftId && phase !== "done" ? (
              <ConfirmAction
                trigger={
                  <button type="button" className="cs-link cs-link-danger" disabled={locked}>
                    Discard draft
                  </button>
                }
                title="Discard this draft?"
                description="Its choices will be gone and the Forge starts empty."
                confirm="Discard draft"
                danger
                onConfirm={() => void discard()}
              />
            ) : null}
          </div>
        </div>
      </Panel>
    </>
  );
}
