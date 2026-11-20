"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, CircleHelp, Eraser, Eye, Hourglass, Lock, MessageSquareText, Minus, Sparkles, Target, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOM_QUESTION_MAX,
  CUSTOM_QUESTION_MIN,
  PLAYABLE,
  candidatesFor,
  cardById,
  cardTruth,
  characterById,
  cleanQuestion,
  describeTraits,
  type Character,
  type CustomAnswer,
  type Knowledge,
  type Side,
  type WhoAmIEvent,
  type WhoAmIState,
} from "@/lib/who-am-i";
import { cn } from "@/lib/utils";
import { useArcade } from "../game-shell";
import { MysteryPortrait, Portrait } from "./portrait";
import { QuestionPicker } from "./question-picker";
import "./who-am-i.css";

/** What the table shows, whether the opponent is the bot or a Wager rival. */
export type TableView = {
  phase: "ask" | "answer" | "done";
  /** In "ask" the player to move; in "answer" the player who asked. */
  turn: Side | null;
  names: { you: string; them: string };
  identity: { you: string | null; them: string | null };
  pending: { kind: "card" | "custom"; card: string | null; text: string | null } | null;
  events: WhoAmIEvent[];
  winner: Side | null;
  reason: WhoAmIState["reason"];
  customEnabled: boolean;
  /** Local-clock deadline (ms) of the move the game waits for; null without a clock. */
  deadline: number | null;
};

export type TableActions = {
  busy: boolean;
  ask: (question: { card: string } | { text: string }) => void;
  answer: (answer: "yes" | "no" | "unsure") => void;
  guess: (character: string) => void;
  /** Called when the player continues past the answer to their question or their wrong guess. */
  acknowledge?: () => void;
};

const ANSWER_LABEL: Record<CustomAnswer, string> = { yes: "Yes", no: "No", unsure: "Not sure", none: "No answer" };

type QaItem = { key: number; type: "qa"; by: Side; card: string | null; text: string | null; answer: CustomAnswer | null; auto: boolean; answerSeq: number | null };
type GuessItem = { key: number; type: "guess"; by: Side; guess: string; correct: boolean };
type LogItem = QaItem | GuessItem | { key: number; type: "timeout"; by: Side };

/** Questions paired with their answers, guesses and missed turns, oldest first. */
function logItems(events: WhoAmIEvent[]): LogItem[] {
  const items: LogItem[] = [];
  let open: QaItem | null = null;
  for (const e of events) {
    if (e.by === "system") continue;
    if (e.kind === "ask") {
      open = { key: e.seq, type: "qa", by: e.by, card: e.card, text: e.text, answer: null, auto: false, answerSeq: null };
      items.push(open);
    } else if (e.kind === "answer" && open) {
      open.answer = e.answer;
      open.auto = e.auto;
      open.answerSeq = e.seq;
      open = null;
    } else if (e.kind === "guess" && e.guess) {
      items.push({ key: e.seq, type: "guess", by: e.by, guess: e.guess, correct: Boolean(e.correct) });
    } else if (e.kind === "timeout") {
      items.push({ key: e.seq, type: "timeout", by: e.by });
    }
  }
  return items;
}

/** The same events seen from the other side (who asked, who answered). */
export const mirrorEvents = (events: WhoAmIEvent[]) =>
  events.map((e) => ({ ...e, by: e.by === "you" ? "them" : e.by === "them" ? "you" : e.by }) as WhoAmIEvent);

/** What you've learned about yourself: card answers, wrong guesses, and the opponent's (different) identity. */
export function knowledgeOf(events: WhoAmIEvent[], them: string | null): Knowledge {
  const answers: Record<string, boolean> = {};
  const wrong: string[] = [];
  for (const item of logItems(events)) {
    if (item.type === "qa" && item.by === "you" && item.card && (item.answer === "yes" || item.answer === "no")) answers[item.card] = item.answer === "yes";
    if (item.type === "guess" && item.by === "you" && !item.correct) wrong.push(item.guess);
  }
  return { answers, wrong, exclude: them };
}

/** Why a character no longer fits what a player learned, in a few words (or null if they still fit). */
function ruledOut(character: Character, knowledge: Knowledge) {
  if (knowledge.wrong.includes(character.id)) return "guessed wrong";
  for (const [id, answer] of Object.entries(knowledge.answers)) {
    const card = cardById(id);
    if (card && cardTruth(character, card) !== answer) return `${card.short}: ${answer ? "yes" : "no"}`;
  }
  return null;
}

/**
 * The moment to show after your own move resolves: the answer to your question, or your wrong guess. The player
 * continues past it explicitly, so the opponent's next move never covers it.
 */
function latestReveal(items: LogItem[]): { seq: number; item: QaItem | GuessItem } | null {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item.by !== "you") continue;
    if (item.type === "qa" && item.answerSeq !== null) return { seq: item.answerSeq, item };
    if (item.type === "guess" && !item.correct) return { seq: item.key, item };
    return null;
  }
  return null;
}

const questionText = (card: string | null, text: string | null) => (card ? (cardById(card)?.prompt ?? card) : `“${text ?? ""}”`);

function announce(item: LogItem | undefined, names: TableView["names"]) {
  if (!item) return "";
  const who = item.by === "you" ? "You" : names.them;
  if (item.type === "timeout") return `${who} ran out of time and missed a turn.`;
  if (item.type === "guess") return `${who} guessed ${characterById(item.guess)?.name ?? item.guess}: ${item.correct ? "correct!" : "wrong."}`;
  if (item.answer) return `${item.by === "you" ? names.them : "You"} answered ${ANSWER_LABEL[item.answer]} to ${item.by === "you" ? "your" : `${names.them}’s`} question: ${questionText(item.card, item.text)}`;
  return `${who} asked: ${questionText(item.card, item.text)}`;
}

function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

function useBoardMarks(storageKey: string) {
  const [crossed, setCrossed] = useState<Set<string>>(() => {
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      return new Set(saved ? (JSON.parse(saved) as string[]) : []);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify([...crossed]));
    } catch {
      // Marks are a convenience; the board works without storage.
    }
  }, [crossed, storageKey]);
  return [crossed, setCrossed] as const;
}

const typing = (target: EventTarget | null) => Boolean((target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]"));

/** The whole table: both players, the turn stage, the boards and the question log. */
export function WhoAmITable({ view, actions, storageKey, banner, footer }: {
  view: TableView;
  actions: TableActions;
  /** Where this round's board marks are kept (per tab), so a refresh keeps them. */
  storageKey: string;
  banner?: ReactNode;
  footer?: ReactNode;
}) {
  const { play, effects } = useArcade();
  const [crossed, setCrossed] = useBoardMarks(storageKey);
  const [guessMode, setGuessing] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [boardChoice, setBoard] = useState<"you" | "them">("you");
  const items = useMemo(() => logItems(view.events), [view.events]);
  // Moments already on the table when it opens (a refresh mid-round) aren't replayed.
  const [acked, setAcked] = useState(() => latestReveal(logItems(view.events))?.seq ?? 0);
  const knowledge = useMemo(() => knowledgeOf(view.events, view.identity.them), [view.events, view.identity.them]);
  const consistent = useMemo(() => new Set(candidatesFor(knowledge).map((c) => c.id)), [knowledge]);
  // The opponent's progress from what they have legitimately learned. Their knowledge that your card isn't theirs
  // is left out on purpose: marking it would show you your own identity.
  const theirKnowledge = useMemo(() => knowledgeOf(mirrorEvents(view.events), null), [view.events]);
  const them = characterById(view.identity.them);
  const you = characterById(view.identity.you);
  const done = view.phase === "done";
  const reveal = latestReveal(items);
  const showReveal = !done && reveal !== null && reveal.seq > acked;
  const yourMove = view.phase === "ask" && view.turn === "you" && !showReveal;
  // Guess mode only lasts for your own move.
  const guessing = guessMode && yourMove;
  const board = guessing ? "you" : boardChoice;
  const toAnswer = view.phase === "answer" && view.turn === "them" && view.pending;
  const left = PLAYABLE.filter((c) => !crossed.has(c.id) && c.id !== view.identity.them && !knowledge.wrong.includes(c.id)).length;
  const theirLeft = PLAYABLE.filter((c) => !ruledOut(c, theirKnowledge)).length;
  const lastSeq = view.events.at(-1)?.seq ?? 0;
  const seen = useRef(lastSeq);
  const stageRef = useRef<HTMLDivElement>(null);
  const fx = effects !== "off";

  // A sound for each new move from the other side.
  useEffect(() => {
    if (lastSeq > seen.current) {
      const latest = view.events.at(-1);
      if (latest && latest.by === "them") {
        if (latest.kind === "guess") play(latest.correct ? "over" : "waiWrong");
        else if (latest.kind === "ask") play("waiAsk");
        else if (latest.kind === "answer") play(latest.answer === "yes" ? "waiYes" : latest.answer === "no" ? "waiNo" : "tap");
      }
    }
    seen.current = lastSeq;
  }, [lastSeq, view.events, play]);

  // Bring the stage into view when something needs the player: an answer to read or a question to answer.
  const attention = showReveal ? `r${reveal?.seq}` : toAnswer ? `a${lastSeq}` : null;
  useEffect(() => {
    if (attention === null) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) stage.scrollIntoView({ block: "nearest", behavior: fx ? "smooth" : "auto" });
  }, [attention, fx]);

  function acknowledge() {
    if (!reveal) return;
    setAcked(reveal.seq);
    actions.acknowledge?.();
    play("waiTurn");
  }

  function toggle(id: string) {
    if (guessing) {
      setPick((current) => (current === id ? null : id));
      play("tap");
      return;
    }
    setCrossed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      play(next.has(id) ? "check" : "uncheck");
      return next;
    });
  }

  function applyAnswers() {
    setCrossed((current) => new Set([...current, ...PLAYABLE.filter((c) => !consistent.has(c.id)).map((c) => c.id)]));
    play("erase");
  }

  return (
    <div className={cn("wai-table grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start", fx && "wai-fx", effects === "full" && "wai-fx-full")}>
      <p aria-live="polite" className="sr-only">{announce(items.at(-1), view.names)}</p>

      {/* Players and the turn stage: on top on phones; a column that stays in view beside the board on desktop */}
      <div className="wai-scroll-y grid min-w-0 content-start gap-3 lg:sticky lg:top-[4.5rem] lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-0.5">
        <div className="grid grid-cols-2 gap-2">
          <PlayerCard label="You" name={you ? you.name : "Who am I?"} active={view.turn === "you" && !done} winner={view.winner === "you"} loser={done && view.winner === "them"}>
            {you ? <span className={cn("block size-full", fx && "wai-flip-in")}><Portrait character={you} label={`You were ${you.name}`} /></span> : <MysteryPortrait />}
            {you ? null : <span className="sr-only">Your card is hidden</span>}
          </PlayerCard>
          <PlayerCard label={view.names.them} name={them ? them.name : "Not dealt yet"} active={view.turn === "them" && !done} winner={view.winner === "them"} loser={done && view.winner === "you"}>
            {them ? <Portrait character={them} label={`${view.names.them} is ${them.name}`} /> : <MysteryPortrait />}
          </PlayerCard>
        </div>
        {banner}
        <div ref={stageRef} className="scroll-mt-20">
          <Stage
            view={view}
            actions={actions}
            items={items}
            yourMove={yourMove}
            toAnswer={Boolean(toAnswer)}
            reveal={showReveal ? reveal : null}
            stillFit={consistent.size}
            onContinue={acknowledge}
            guessing={guessing}
            pick={pick}
            onGuessing={(next) => {
              setGuessing(next);
              setPick(null);
              if (next) setBoard("you");
            }}
          />
        </div>
      </div>

      {/* The boards and the log */}
      <div className="grid min-w-0 content-start gap-3 lg:col-start-1 lg:row-start-1">
        <section
          aria-labelledby="wai-board"
          className={cn("wai-board min-w-0 rounded-xl border p-3 transition-colors motion-reduce:transition-none", board === "them" ? "border-sky-400/50 bg-sky-400/[0.05]" : "border-border bg-surface/40")}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 id="wai-board" className="sr-only">{board === "you" ? "Your board" : `${view.names.them}’s board`}</h2>
            <div role="tablist" aria-label="Whose board" className="inline-flex rounded-lg bg-foreground/[0.07] p-0.5 text-xs font-semibold">
              {(["you", "them"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  role="tab"
                  id={`wai-tab-${side}`}
                  aria-selected={board === side}
                  aria-controls="wai-board-panel"
                  disabled={guessing && side === "them"}
                  onClick={() => {
                    setBoard(side);
                    play("tap");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                      event.preventDefault();
                      const other = side === "you" ? "them" : "you";
                      if (!guessing) {
                        setBoard(other);
                        document.getElementById(`wai-tab-${other}`)?.focus();
                      }
                    }
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                    board === side ? (side === "you" ? "bg-amethyst text-amethyst-foreground shadow-sm" : "bg-sky-400 text-sky-950 shadow-sm") : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {side === "you" ? <Target aria-hidden className="size-3.5" /> : <Eye aria-hidden className="size-3.5" />}
                  {side === "you" ? "Your board" : `${view.names.them}’s board`}
                  <span className="tabular-nums opacity-75">{side === "you" ? left : theirLeft}</span>
                </button>
              ))}
            </div>
            {board === "you" && !done && !guessing ? (
              <div className="ml-auto flex gap-1.5">
                <Button variant="outline" size="sm" onClick={applyAnswers} title="Cross out everyone your card answers rule out">
                  <Sparkles aria-hidden />
                  Apply answers
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCrossed(new Set())} disabled={crossed.size === 0}>
                  <Eraser aria-hidden />
                  Clear
                </Button>
              </div>
            ) : null}
            {board === "them" ? (
              <span className="ml-auto inline-flex items-center gap-1 text-xs text-sky-300">
                <Lock aria-hidden className="size-3.5" />
                View only
              </span>
            ) : null}
          </div>
          <div id="wai-board-panel" role="tabpanel" aria-labelledby={`wai-tab-${board}`}>
            {board === "you" ? (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  {guessing ? (
                    <span className="font-semibold text-foreground">Pick who you think you are, then confirm your guess above.</span>
                  ) : (
                    <>Who could you be? Tap to cross someone out or bring them back; these are your own notes. <span className="tabular-nums">{left}</span> left.</>
                  )}
                </p>
                <ul className={cn("grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2", guessing && "wai-guessing")}>
                  {PLAYABLE.map((character) => {
                    const opponent = character.id === view.identity.them;
                    const wrong = knowledge.wrong.includes(character.id);
                    const out = crossed.has(character.id);
                    const revealed = done && character.id === view.identity.you;
                    const disabled = done || opponent || (guessing && wrong);
                    const picked = guessing && pick === character.id;
                    const status = opponent ? `${view.names.them}’s character, so not you` : wrong ? "guessed wrong" : out ? "crossed out" : "possible";
                    return (
                      <li key={character.id}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => toggle(character.id)}
                          aria-pressed={guessing ? picked : out}
                          aria-label={`${character.name}, ${status}. ${describeTraits(character.traits).join(", ")}.`}
                          className={cn(
                            "wai-tile group relative block w-full rounded-lg border border-transparent p-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            !disabled && "hover:-translate-y-0.5 hover:border-amethyst/60 motion-reduce:hover:translate-y-0",
                            (out || wrong || opponent) && !revealed && "wai-tile-out",
                            picked && "wai-tile-picked border-amethyst ring-2 ring-amethyst",
                            revealed && "wai-tile-revealed border-emerald-400 ring-2 ring-emerald-400",
                          )}
                        >
                          <span className="relative block aspect-square overflow-hidden rounded-md">
                            <Portrait character={character} />
                            {out || wrong ? (
                              <span aria-hidden className="wai-cross absolute inset-0 grid place-items-center bg-background/25">
                                <svg viewBox="0 0 24 24" className="size-3/5 text-rose-400 drop-shadow" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
                                  <path d="M5 5 L19 19" />
                                  <path d="M19 5 L5 19" />
                                </svg>
                              </span>
                            ) : null}
                            {opponent ? <span aria-hidden className="absolute inset-x-0 bottom-0 bg-background/80 py-0.5 text-center text-[0.6rem] font-bold uppercase">Them</span> : null}
                            {picked ? <span aria-hidden className="absolute inset-x-0 bottom-0 bg-amethyst py-0.5 text-center text-[0.6rem] font-bold text-amethyst-foreground uppercase">Guess</span> : null}
                            {revealed ? <span aria-hidden className="absolute inset-x-0 bottom-0 bg-emerald-400 py-0.5 text-center text-[0.6rem] font-bold text-black uppercase">You</span> : null}
                          </span>
                          <span className="block truncate px-0.5 pt-0.5 text-center text-[0.7rem] font-medium">{character.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {guessing ? (
                  <div className="sticky bottom-2 z-10 mt-2 flex items-center gap-2 rounded-lg border border-amethyst/60 bg-surface-raised/95 p-2 shadow-lg backdrop-blur lg:hidden">
                    <p className="min-w-0 flex-1 truncate text-sm">{characterById(pick) ? <>Guess <span className="font-semibold">{characterById(pick)?.name}</span>?</> : <span className="text-muted-foreground">Pick a character.</span>}</p>
                    <Button size="sm" disabled={!pick || actions.busy} onClick={() => pick && actions.guess(pick)}>
                      <Target aria-hidden />
                      Guess
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setGuessing(false)}>Cancel</Button>
                  </div>
                ) : null}
              </>
            ) : (
              <TheirBoard view={view} knowledge={theirKnowledge} left={theirLeft} />
            )}
          </div>
        </section>
        {footer}
        <QuestionLog items={items} names={view.names} />
      </div>
    </div>
  );
}

/** The opponent's board, from what they've learned only. Read-only. */
function TheirBoard({ view, knowledge, left }: { view: TableView; knowledge: Knowledge; left: number }) {
  const name = view.names.them;
  return (
    <>
      <p className="mb-2 text-xs text-muted-foreground">
        What {name} has worked out from your answers and their guesses: <span className="font-semibold text-foreground tabular-nums">{left}</span> could still be {name}’s card. You can’t change it, and it never shows your own card.
      </p>
      <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2">
        {PLAYABLE.map((character) => {
          const reason = ruledOut(character, knowledge);
          const theirs = character.id === view.identity.them;
          return (
            <li
              key={character.id}
              aria-label={`${character.name}: ${reason ? `ruled out (${reason})` : "still possible"}${theirs ? `. This is ${name}’s card.` : ""}`}
              className={cn("wai-tile relative rounded-lg border border-transparent p-0.5", reason && "wai-tile-out", theirs && "border-sky-400/80")}
            >
              <span aria-hidden className="relative block aspect-square overflow-hidden rounded-md">
                <Portrait character={character} />
                {reason ? (
                  <span className="wai-cross absolute inset-0 grid place-items-center bg-background/25">
                    <svg viewBox="0 0 24 24" className="size-3/5 text-sky-300 drop-shadow" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
                      <path d="M5 5 L19 19" />
                      <path d="M19 5 L5 19" />
                    </svg>
                  </span>
                ) : null}
                {theirs ? <span className="absolute inset-x-0 bottom-0 bg-sky-400 py-0.5 text-center text-[0.6rem] font-bold text-sky-950 uppercase">Their card</span> : null}
              </span>
              <span aria-hidden className="block truncate px-0.5 pt-0.5 text-center text-[0.7rem] font-medium">{character.name}</span>
              {reason ? <span aria-hidden className="block truncate text-center text-[0.6rem] text-muted-foreground">{reason}</span> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function PlayerCard({ label, name, active, winner, loser, children }: { label: string; name: string; active: boolean; winner: boolean; loser: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "wai-player flex min-w-0 items-center gap-2 rounded-xl border bg-surface/60 p-1.5 transition-[border-color,box-shadow,opacity] motion-reduce:transition-none",
        active ? "wai-player-active border-amethyst shadow-[0_0_0_1px_var(--amethyst)]" : "border-border",
        winner && "border-emerald-400 shadow-[0_0_0_1px_#34d399]",
        loser && "opacity-80",
      )}
    >
      <div className="size-14 shrink-0 overflow-hidden rounded-lg">{children}</div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-muted-foreground">{label}</p>
        <p aria-hidden className="truncate text-sm font-bold">{name}</p>
        {active ? <span className="mt-0.5 inline-block rounded-full bg-amethyst px-1.5 text-[0.6rem] font-semibold text-amethyst-foreground uppercase">Turn</span> : null}
        {winner ? <span className="mt-0.5 inline-block rounded-full bg-emerald-400 px-1.5 text-[0.6rem] font-semibold text-black uppercase">Winner</span> : null}
      </div>
    </div>
  );
}

function Countdown({ deadline }: { deadline: number | null }) {
  const seconds = useCountdown(deadline);
  if (seconds === null) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs tabular-nums", seconds <= 20 ? "text-amber-400" : "text-muted-foreground")}>
      <Timer aria-hidden className="size-3.5" />
      <span>
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        <span className="sr-only"> left for this move</span>
      </span>
    </span>
  );
}

/** A big Yes / No / Not sure stamp: icon and word, so it never relies on color alone. */
function AnswerStamp({ answer, auto }: { answer: CustomAnswer; auto?: boolean }) {
  const Icon = answer === "yes" ? Check : answer === "no" ? X : answer === "unsure" ? CircleHelp : Minus;
  return (
    <span className={cn("wai-stamp inline-flex items-center gap-2 rounded-2xl border-2 px-4 py-2", `wai-stamp-${answer}`)}>
      <span className="grid size-9 place-items-center wai-stamp-icon rounded-full">
        <Icon aria-hidden className="size-6" strokeWidth={3} />
      </span>
      <span className="text-3xl leading-none font-black tracking-tight uppercase">{ANSWER_LABEL[answer]}</span>
      {auto ? <span className="self-end text-xs font-semibold opacity-80">(auto)</span> : null}
    </span>
  );
}

function Dots() {
  return (
    <span aria-hidden className="wai-dots inline-flex gap-1 align-middle">
      <span />
      <span />
      <span />
    </span>
  );
}

function StageCard({ tone = "plain", label, icon, aside, children, stageKey }: {
  tone?: "plain" | "accent" | "yes" | "no" | "warn";
  label: string;
  icon: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  stageKey: string;
}) {
  return (
    <section
      key={stageKey}
      aria-label={label}
      className={cn(
        "wai-stage rounded-xl border p-3 sm:p-4",
        tone === "accent" && "border-amethyst/60 bg-amethyst/[0.08]",
        tone === "plain" && "border-border bg-surface/50",
        tone === "yes" && "border-emerald-400/60 bg-emerald-400/[0.07]",
        tone === "no" && "border-rose-400/60 bg-rose-400/[0.07]",
        tone === "warn" && "border-amber-400/60 bg-amber-400/[0.07]",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-bold">{label}</h2>
        <span className="ml-auto">{aside}</span>
      </div>
      {children}
    </section>
  );
}

/** What just happened on the other side, shown above your own move. */
function lastMoveNote(items: LogItem[], names: TableView["names"]) {
  const last = items.at(-1);
  if (!last || last.by !== "them") return null;
  if (last.type === "guess" && !last.correct) return `${names.them} guessed ${characterById(last.guess)?.name ?? "someone"}: wrong. Your turn.`;
  if (last.type === "timeout") return `${names.them} ran out of time. Your turn.`;
  if (last.type === "qa" && last.answer) return `You answered ${ANSWER_LABEL[last.answer]}${last.auto ? " (auto)" : ""}. Your turn.`;
  return null;
}

function Stage({ view, actions, items, yourMove, toAnswer, reveal, stillFit, onContinue, guessing, pick, onGuessing }: {
  view: TableView;
  actions: TableActions;
  items: LogItem[];
  yourMove: boolean;
  toAnswer: boolean;
  reveal: ReturnType<typeof latestReveal>;
  stillFit: number;
  onContinue: () => void;
  guessing: boolean;
  pick: string | null;
  onGuessing: (next: boolean) => void;
}) {
  const [chosen, setCard] = useState<string | null>(null);
  const [chosenTab, setTab] = useState<"cards" | "custom">("cards");
  const askedCards = useMemo(() => {
    const map = new Map<string, boolean | undefined>();
    for (const item of items) {
      if (item.type === "qa" && item.by === "you" && item.card) map.set(item.card, item.answer === "yes" ? true : item.answer === "no" ? false : undefined);
    }
    return map;
  }, [items]);
  // A picked card only counts on your own move and until it has been asked; custom questions need consent.
  const card = yourMove && chosen && !askedCards.has(chosen) ? chosen : null;
  const tab = view.customEnabled ? chosenTab : "cards";
  const [text, setText] = useState("");
  const cleaned = cleanQuestion(text);
  const textValid = cleaned.length >= CUSTOM_QUESTION_MIN && cleaned.length <= CUSTOM_QUESTION_MAX;
  const pending = view.pending;
  const focusRef = useRef<HTMLDivElement>(null);
  const name = view.names.them;
  const countdown = view.phase !== "done" ? <Countdown deadline={view.deadline} /> : null;

  // Focus the main control of each new moment (Continue, Yes) without scrolling the page.
  const moment = reveal ? `r${reveal.seq}` : toAnswer ? `a${pending?.card ?? ""}|${pending?.text ?? ""}` : null;
  useEffect(() => {
    if (moment !== null) focusRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [moment]);

  // Keys: Y / N (and U for custom questions) to answer; Enter to continue past an answer.
  const answering = toAnswer && !reveal;
  useEffect(() => {
    if (!answering && !reveal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      const key = event.key.toLowerCase();
      if (reveal) {
        if (key === "enter" && !(event.target as HTMLElement | null)?.closest?.("button, a")) {
          event.preventDefault();
          onContinue();
        }
        return;
      }
      if (key === "y") actions.answer("yes");
      else if (key === "n") actions.answer("no");
      else if (key === "u" && pending?.kind === "custom") actions.answer("unsure");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answering, reveal, actions, pending?.kind, onContinue]);

  if (view.phase === "done") return null;

  // 1. The result of your own move, until you continue.
  if (reveal) {
    const theyAsked = toAnswer;
    if (reveal.item.type === "qa") {
      const answer = reveal.item.answer ?? "none";
      return (
        <StageCard
          stageKey={`reveal-${reveal.seq}`}
          tone={answer === "yes" ? "yes" : answer === "no" ? "no" : "plain"}
          label={`${name} answers`}
          icon={<MessageSquareText aria-hidden className="size-4 text-muted-foreground" />}
          aside={theyAsked ? countdown : null}
        >
          <div ref={focusRef} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">You asked</p>
              <p className="text-lg leading-snug font-bold text-pretty break-words sm:text-xl">{questionText(reveal.item.card, reveal.item.text)}</p>
              {reveal.item.card && (answer === "yes" || answer === "no") ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground tabular-nums">{stillFit}</span> {stillFit === 1 ? "character still fits" : "characters still fit"} everything you’ve learned.
                </p>
              ) : reveal.item.text ? (
                <p className="text-sm text-muted-foreground">A custom question: {name}’s answer can’t be checked.</p>
              ) : null}
            </div>
            <div className="justify-self-start sm:justify-self-end">
              <AnswerStamp answer={answer} auto={reveal.item.auto} />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <Button onClick={onContinue} className="wai-continue">
                Continue
                <ArrowRight aria-hidden />
              </Button>
              <span className="text-xs text-muted-foreground">
                {theyAsked ? <span className="font-semibold text-amber-300">{name} has asked you a question.</span> : `Then it’s ${name}’s turn.`} <kbd className="rounded border border-border px-1 font-sans">Enter</kbd>
              </span>
            </div>
          </div>
        </StageCard>
      );
    }
    const guessed = characterById(reveal.item.guess);
    return (
      <StageCard stageKey={`reveal-${reveal.seq}`} tone="no" label="Not quite" icon={<Target aria-hidden className="size-4 text-rose-300" />} aside={theyAsked ? countdown : null}>
        <div ref={focusRef} className="flex flex-wrap items-center gap-3">
          {guessed ? (
            <span className="wai-shake relative size-20 shrink-0 overflow-hidden rounded-lg">
              <Portrait character={guessed} />
              <span aria-hidden className="absolute inset-0 grid place-items-center bg-background/30">
                <X className="size-3/4 text-rose-400 drop-shadow" strokeWidth={3} />
              </span>
            </span>
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-lg font-bold">You’re not {guessed?.name ?? "them"}.</p>
            <AnswerStamp answer="no" />
            <p className="text-sm text-muted-foreground">A wrong guess passes the turn. {guessed?.name ?? "They"} {guessed ? "is" : "are"} crossed off your board.</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2">
            <Button onClick={onContinue} className="wai-continue">
              Continue
              <ArrowRight aria-hidden />
            </Button>
            <span className="text-xs text-muted-foreground">{theyAsked ? <span className="font-semibold text-amber-300">{name} has asked you a question.</span> : `Then it’s ${name}’s turn.`}</span>
          </div>
        </div>
      </StageCard>
    );
  }

  // 2. The opponent asks about their card: you answer.
  if (toAnswer && pending) {
    const theirs = characterById(view.identity.them);
    return (
      <StageCard stageKey={`answer-${pending.card ?? pending.text}`} tone="accent" label={`${name} asks`} icon={<CircleHelp aria-hidden className="size-4 text-amethyst" />} aside={countdown}>
        <div className="flex gap-3">
          {theirs ? (
            <span className="size-16 shrink-0 overflow-hidden rounded-lg ring-2 ring-amethyst/50">
              <Portrait character={theirs} label={`${name}’s card: ${theirs.name}`} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="wai-question text-lg leading-snug font-bold text-pretty break-words">{pending.kind === "card" ? cardById(pending.card)?.prompt : <q>{pending.text}</q>}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Answer about {theirs ? <span className="font-semibold text-foreground">{theirs.name}</span> : "their character"}, the card you can see.{" "}
              {pending.kind === "custom" ? "This is a custom question: answer honestly. Nobody can check it." : "Card answers are checked."}
            </p>
          </div>
        </div>
        {theirs ? (
          <ul aria-label={`${theirs.name}’s traits`} className="mt-2 flex flex-wrap gap-1 text-[0.7rem]">
            {describeTraits(theirs.traits).map((trait) => <li key={trait} className="rounded-full border border-border bg-background/40 px-2 py-0.5">{trait}</li>)}
          </ul>
        ) : null}
        <div ref={focusRef} className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Your answer">
          <Button size="lg" onClick={() => actions.answer("yes")} disabled={actions.busy} aria-keyshortcuts="Y">
            <Check aria-hidden />
            Yes
          </Button>
          <Button size="lg" variant="outline" onClick={() => actions.answer("no")} disabled={actions.busy} aria-keyshortcuts="N">
            <X aria-hidden />
            No
          </Button>
          {pending.kind === "custom" ? (
            <Button variant="ghost" className="col-span-2" onClick={() => actions.answer("unsure")} disabled={actions.busy} aria-keyshortcuts="U">
              Not sure
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-[0.7rem] text-muted-foreground">Keys: Y yes · N no{pending.kind === "custom" ? " · U not sure" : ""}</p>
      </StageCard>
    );
  }

  // 3. Waiting: for the answer to your question, or for the opponent's move.
  if (!yourMove) {
    const waitingAnswer = view.phase === "answer" && view.turn === "you" && pending;
    if (waitingAnswer) {
      return (
        <StageCard stageKey={`asked-${pending.card ?? pending.text}`} tone="accent" label="You asked" icon={<MessageSquareText aria-hidden className="size-4 text-amethyst" />} aside={countdown}>
          <p className="wai-question text-lg leading-snug font-bold text-pretty break-words sm:text-xl">{pending.kind === "card" ? cardById(pending.card)?.prompt : <q>{pending.text}</q>}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {name} is answering <Dots />
          </p>
        </StageCard>
      );
    }
    return (
      <StageCard stageKey="their-turn" label={`${name}’s turn`} icon={<Hourglass aria-hidden className="wai-hourglass size-4 text-muted-foreground" />} aside={countdown}>
        <p className="text-sm text-muted-foreground">
          {name} is choosing a question or a guess <Dots />
        </p>
      </StageCard>
    );
  }

  // 4. Your move: guess…
  if (guessing) {
    const target = characterById(pick);
    return (
      <StageCard stageKey="guess" tone="accent" label="Guess who you are" icon={<Target aria-hidden className="size-4 text-amethyst" />} aside={countdown}>
        <div className="flex items-center gap-3">
          <span className={cn("size-14 shrink-0 overflow-hidden rounded-lg", target ? "ring-2 ring-amethyst" : "")}>{target ? <Portrait key={target.id} character={target} className="wai-pop" /> : <MysteryPortrait />}</span>
          <p className="min-w-0 text-sm text-muted-foreground">
            {target ? <>You’ll guess <span className="font-semibold text-foreground">{target.name}</span>. Right wins the round; wrong passes the turn.</> : "Pick a character on your board below."}
          </p>
        </div>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" disabled={!target || actions.busy} onClick={() => target && actions.guess(target.id)}>
            <Target aria-hidden />
            {target ? `Guess ${target.name}` : "Guess"}
          </Button>
          <Button variant="outline" onClick={() => onGuessing(false)}>Cancel</Button>
        </div>
      </StageCard>
    );
  }

  // …or ask.
  const note = lastMoveNote(items, view.names);
  const selected = cardById(card);
  return (
    <StageCard stageKey="your-turn" tone="accent" label="Your turn: ask about yourself" icon={<MessageSquareText aria-hidden className="size-4 text-amethyst" />} aside={countdown}>
      {note ? <p className="mb-2 rounded-lg bg-foreground/[0.06] px-2.5 py-1.5 text-xs text-muted-foreground">{note}</p> : null}
      {view.customEnabled ? (
        <div role="tablist" aria-label="Question type" className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-foreground/5 p-1 text-xs font-semibold">
          {(["cards", "custom"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("rounded-md px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === id ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {id === "cards" ? "Question cards" : "Custom question"}
            </button>
          ))}
        </div>
      ) : null}
      {tab === "custom" && view.customEnabled ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (textValid) {
              actions.ask({ text: cleaned });
              setText("");
            }
          }}
          className="grid gap-2"
        >
          <label htmlFor="wai-custom" className="text-xs text-muted-foreground">
            A yes/no question about yourself. Answers are reported by {name} and can’t be verified.
          </label>
          <Textarea id="wai-custom" value={text} maxLength={CUSTOM_QUESTION_MAX} onChange={(event) => setText(event.target.value)} rows={2} placeholder="Do I look like I’d win at chess?" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.7rem] text-muted-foreground tabular-nums">{cleaned.length}/{CUSTOM_QUESTION_MAX}</span>
            <Button type="submit" size="sm" disabled={!textValid || actions.busy}>Ask</Button>
          </div>
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => onGuessing(true)} disabled={actions.busy}>
            <Target aria-hidden />
            Make a guess instead
          </Button>
        </form>
      ) : (
        <div className="grid gap-3">
          <QuestionPicker selected={card} onSelect={setCard} onAsk={(id) => actions.ask({ card: id })} asked={askedCards} disabled={actions.busy} />
          <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-raised/95 p-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-surface-raised/80">
            <p className="min-w-0 flex-1 basis-48 text-sm">
              {selected ? <span key={selected.id} className="wai-pop inline-block font-semibold">{selected.prompt}</span> : <span className="text-muted-foreground">Pick a question card, or guess.</span>}
            </p>
            <div className="flex gap-2">
              <Button disabled={!card || actions.busy} onClick={() => card && actions.ask({ card })}>
                <CircleHelp aria-hidden />
                Ask
              </Button>
              <Button variant="outline" onClick={() => onGuessing(true)} disabled={actions.busy}>
                <Target aria-hidden />
                Guess
              </Button>
            </div>
          </div>
        </div>
      )}
    </StageCard>
  );
}

function QuestionLog({ items, names }: { items: LogItem[]; names: TableView["names"] }) {
  return (
    <section aria-labelledby="wai-log" className="rounded-xl border border-border bg-surface/40 p-3">
      <h2 id="wai-log" className="mb-2 text-sm font-bold">Questions and guesses</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing asked yet.</p>
      ) : (
        <ol className="grid max-h-80 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2" reversed>
          {[...items].reverse().map((item) => {
            const who = item.by === "you" ? "You" : names.them;
            return (
              <li key={item.key} className={cn("wai-log-item rounded-lg border px-2.5 py-1.5 text-sm", item.by === "you" ? "border-amethyst/40 bg-amethyst/5" : "border-border")}>
                <span className="text-xs font-semibold text-muted-foreground">{who}</span>
                {item.type === "qa" ? (
                  <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="min-w-0 break-words">{questionText(item.card, item.text)}</span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 text-xs font-bold",
                        item.answer === "yes" ? "bg-emerald-400/20 text-emerald-300" : item.answer === "no" ? "bg-rose-400/20 text-rose-300" : "bg-foreground/10 text-muted-foreground",
                      )}
                    >
                      {item.answer === "yes" ? <Check aria-hidden className="size-3" strokeWidth={3} /> : item.answer === "no" ? <X aria-hidden className="size-3" strokeWidth={3} /> : null}
                      {item.answer ? ANSWER_LABEL[item.answer] : "…"}
                      {item.auto && item.answer !== "none" ? <span className="font-normal"> (auto)</span> : null}
                    </span>
                  </p>
                ) : item.type === "guess" ? (
                  <p>
                    Guessed {characterById(item.guess)?.name ?? item.guess}:{" "}
                    <span className={item.correct ? "font-bold text-emerald-300" : "font-bold text-rose-300"}>{item.correct ? "correct" : "wrong"}</span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">Ran out of time and missed a turn.</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The rules, shown before a first game and on request. */
export function RulesList({ rules }: { rules: readonly string[] }) {
  return (
    <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-pretty marker:font-bold marker:text-amethyst">
      {rules.map((rule) => <li key={rule}>{rule}</li>)}
    </ol>
  );
}
