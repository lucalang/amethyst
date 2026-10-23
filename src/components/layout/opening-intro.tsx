"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Gem } from "lucide-react";
import type { IntroFrequency, MotionLevel } from "@/lib/preferences";

const STORAGE_PREFIX = "archive:intro:";
const SAFETY_MS = 2500;
/** Dispatched on window (Settings → Appearance) to play the intro once without counting it as seen. */
export const PREVIEW_INTRO_EVENT = "archive:preview-intro";

/**
 * Runs while the server HTML is parsed, before first paint, so the overlay never flashes in late.
 * Content stays visible unless this decides to play; the CSS animation then fades the overlay out
 * on its own, and the timeout is a last resort if animations do not run.
 *
 * A "visit" is a fresh load of the app. It plays when the last time it was seen (account date or
 * this browser's date, whichever is later) is before the start of the current period: today for
 * "daily", this week's Monday for "weekly"; "every" plays on every visit and "never" never does.
 */
const DECIDE_SCRIPT = `(function(){try{
var el=document.getElementById("opening-intro");if(!el||el.dataset.decided)return;el.dataset.decided="1";
var m=el.dataset.motion,f=el.dataset.frequency;if(m==="off"||f==="never")return;
var p=function(n){return String(n).padStart(2,"0")},ds=function(x){return x.getFullYear()+"-"+p(x.getMonth()+1)+"-"+p(x.getDate())};
var d=new Date(),t=ds(d),w=new Date(d.getFullYear(),d.getMonth(),d.getDate()-((d.getDay()+6)%7)),since=f==="weekly"?ds(w):t;
var k="${STORAGE_PREFIX}"+el.dataset.user,s="";try{s=localStorage.getItem(k)||""}catch(e){}
if(f!=="every"&&((el.dataset.last||"")>=since||s>=since))return;
try{localStorage.setItem(k,t)}catch(e){}
el.dataset.today=t;el.dataset.intro=m==="subtle"||matchMedia("(prefers-reduced-motion: reduce)").matches?"reduced":"play";
setTimeout(function(){el.dataset.intro="done"},${SAFETY_MS});
}catch(e){}})();`;

function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** First day of the current period, in local time (weeks start on Monday). */
function periodStart(frequency: IntroFrequency, now = new Date()) {
  if (frequency !== "weekly") return dateString(now);
  return dateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)));
}

const variant = (motion: MotionLevel) => (motion === "subtle" || matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "play");

// Per document: the layout can remount (signing out and back in) without a reload.
let playedKey: string | null = null;
let savedKey: string | null = null;

/** Client-side mounts (arriving from the sign-in page) never ran the inline script: decide here. */
function decide(el: HTMLElement, userId: string, motion: MotionLevel, frequency: IntroFrequency) {
  if (motion === "off" || frequency === "never") return;
  const today = dateString(new Date());
  const since = periodStart(frequency);
  let stored = "";
  try {
    stored = localStorage.getItem(STORAGE_PREFIX + userId) ?? "";
  } catch {}
  // One play per document at most: remounts within the same visit are not new visits.
  if (playedKey?.startsWith(`${userId}:`)) return;
  if (frequency !== "every" && ((el.dataset.last ?? "") >= since || stored >= since)) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, today);
  } catch {}
  el.dataset.today = today;
  el.dataset.intro = variant(motion);
}

/**
 * Plays the overlay that is already in its play/reduced state and cleans up when it ends.
 * Any key or pointer skips. Nothing is prevented, so a keystroke still reaches whatever has focus.
 */
function runIntro(el: HTMLElement, reduced: boolean) {
  let timer: ReturnType<typeof setTimeout>;
  const finish = () => {
    el.dataset.intro = "done";
    detach();
  };
  const skip = () => {
    if (el.dataset.intro === "skip" || el.dataset.intro === "done") return;
    el.dataset.intro = "skip";
    clearTimeout(timer);
    timer = setTimeout(finish, 220);
  };
  const onAnimationEnd = (event: AnimationEvent) => {
    if (event.target === el && event.animationName === "intro-out") finish();
  };
  function detach() {
    window.removeEventListener("pointerdown", skip, true);
    window.removeEventListener("keydown", skip, true);
    el.removeEventListener("animationend", onAnimationEnd);
  }
  window.addEventListener("pointerdown", skip, true);
  window.addEventListener("keydown", skip, true);
  el.addEventListener("animationend", onAnimationEnd);
  timer = setTimeout(finish, reduced ? 900 : 1400);
  return () => {
    clearTimeout(timer);
    detach();
  };
}

/** A short logo reveal when the app is opened, as often as Settings → Appearance says. */
export function OpeningIntro({
  userId,
  lastSeen,
  motion,
  frequency,
}: {
  userId: string;
  lastSeen: string | null;
  motion: MotionLevel;
  frequency: IntroFrequency;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const motionRef = useRef(motion);
  useEffect(() => {
    motionRef.current = motion;
  }, [motion]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.dataset.decided) {
      el.dataset.decided = "1";
      decide(el, userId, motion, frequency);
    }
    const state = el.dataset.intro;
    if (state !== "play" && state !== "reduced") return;
    const today = el.dataset.today ?? dateString(new Date());
    playedKey = `${userId}:${today}`;
    if (savedKey !== playedKey) {
      savedKey = playedKey;
      void fetch("/api/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ introSeenOn: today }),
        keepalive: true,
      }).catch(() => {});
    }
    return runIntro(el, state === "reduced");
  }, [userId, motion, frequency]);

  // Previews replay the overlay on request without touching the saved history or schedule.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cleanup: (() => void) | undefined;
    const onPreview = () => {
      const current = motionRef.current;
      if (current === "off" || (el.dataset.intro !== "idle" && el.dataset.intro !== "done")) return;
      cleanup?.();
      const reduced = variant(current) === "reduced";
      el.dataset.intro = reduced ? "reduced" : "play";
      // Attach after the triggering click or key press has finished, so it does not skip itself.
      const frame = requestAnimationFrame(() => {
        cleanup = runIntro(el, reduced);
      });
      cleanup = () => cancelAnimationFrame(frame);
    };
    window.addEventListener(PREVIEW_INTRO_EVENT, onPreview);
    return () => {
      window.removeEventListener(PREVIEW_INTRO_EVENT, onPreview);
      cleanup?.();
    };
  }, []);

  return <>
    <div
      ref={ref}
      id="opening-intro"
      className="opening-intro"
      data-intro="idle"
      data-user={userId}
      data-last={lastSeen ?? ""}
      data-motion={motion}
      data-frequency={frequency}
      aria-hidden
      suppressHydrationWarning
    >
      <div className="opening-intro-mark">
        <span className="opening-intro-gem">
          <Gem className="size-7" strokeWidth={1.75} />
        </span>
        <span className="opening-intro-word">
          <span className="opening-intro-text">Amethyst Archives</span>
        </span>
        <span className="opening-intro-line" />
      </div>
      <span className="opening-intro-skip">Skip</span>
    </div>
    <div hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `<script>${DECIDE_SCRIPT}</script>` }} />
  </>;
}
