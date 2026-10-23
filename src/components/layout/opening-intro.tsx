"use client";

import { useLayoutEffect, useRef } from "react";
import { Gem } from "lucide-react";

const STORAGE_PREFIX = "archive:intro:";
const SAFETY_MS = 2500;

/**
 * Runs while the server HTML is parsed, before first paint, so the overlay never flashes in late.
 * Content stays visible unless this decides to play; the CSS animation then fades the overlay out
 * on its own, and the timeout is a last resort if animations do not run.
 */
const DECIDE_SCRIPT = `(function(){try{
var el=document.getElementById("opening-intro");if(!el||el.dataset.decided)return;el.dataset.decided="1";
var d=new Date(),t=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
var k="${STORAGE_PREFIX}"+el.dataset.user,s="";try{s=localStorage.getItem(k)||""}catch(e){}
if((el.dataset.last||"")>=t||s>=t)return;
try{localStorage.setItem(k,t)}catch(e){}
el.dataset.today=t;el.dataset.intro=matchMedia("(prefers-reduced-motion: reduce)").matches?"reduced":"play";
setTimeout(function(){el.dataset.intro="done"},${SAFETY_MS});
}catch(e){}})();`;

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Per document: the layout can remount (signing out and back in) without a reload.
let playedKey: string | null = null;
let savedKey: string | null = null;

/** Client-side mounts (arriving from the sign-in page) never ran the inline script: decide here. */
function decide(el: HTMLElement, userId: string) {
  const today = localDate();
  const key = `${userId}:${today}`;
  let stored = "";
  try {
    stored = localStorage.getItem(STORAGE_PREFIX + userId) ?? "";
  } catch {}
  if (playedKey === key || (el.dataset.last ?? "") >= today || stored >= today) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, today);
  } catch {}
  el.dataset.today = today;
  el.dataset.intro = matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "play";
}

/** A short logo reveal on the first authenticated opening of each local calendar day. */
export function OpeningIntro({ userId, lastSeen }: { userId: string; lastSeen: string | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.dataset.decided) {
      el.dataset.decided = "1";
      decide(el, userId);
    }
    const state = el.dataset.intro;
    if (state !== "play" && state !== "reduced") return;
    const today = el.dataset.today ?? localDate();
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

    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      el.dataset.intro = "done";
      detach();
    };
    // Any key or pointer skips. Nothing is prevented, so a keystroke still reaches whatever has focus.
    const skip = () => {
      if (el.dataset.intro !== "play" && el.dataset.intro !== "reduced") return;
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
      el!.removeEventListener("animationend", onAnimationEnd);
    }
    window.addEventListener("pointerdown", skip, true);
    window.addEventListener("keydown", skip, true);
    el.addEventListener("animationend", onAnimationEnd);
    timer = setTimeout(finish, state === "play" ? 1400 : 900);
    return () => {
      clearTimeout(timer);
      detach();
    };
  }, [userId]);

  return <>
    <div
      ref={ref}
      id="opening-intro"
      className="opening-intro"
      data-intro="idle"
      data-user={userId}
      data-last={lastSeen ?? ""}
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
