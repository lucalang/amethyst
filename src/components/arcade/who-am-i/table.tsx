"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, CircleHelp, Eraser, Hourglass, MessageSquareText, Sparkles, Target, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CARD_GROUPS,
  CARDS,
  CUSTOM_QUESTION_MAX,
  CUSTOM_QUESTION_MIN,
  PLAYABLE,
  candidatesFor,
  cardById,
  characterById,
  cleanQuestion,
  describeTraits,
  type CustomAnswer,
  type Side,
  type WhoAmIEvent,
  type WhoAmIState,
} from "@/lib/who-am-i";
import { cn } from "@/lib/utils";
import { useArcade } from "../game-shell";
import { MysteryPortrait, Portrait } from "./portrait";

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
};

const ANSWER_LABEL: Record<CustomAnswer, string> = { yes: "Yes", no: "No", unsure: "Not sure", none: "No answer" };

type LogItem =
  | { key: number; type: "qa"; by: Side; card: string | null; text: string | null; answer: CustomAnswer | null; auto: boolean }
  | { key: number; type: "guess"; by: Side; guess: string; correct: boolean }
  | { key: number; type: "timeout"; by: Side };

/** Questions paired with their answers, guesses and missed turns, oldest first. */
function logItems(events: WhoAmIEvent[]): LogItem[] {
  const items: LogItem[] = [];
  let open: Extract<LogItem, { type: "qa" }> | null = null;
  for (const e of events) {
    if (e.by === "system") continue;
    if (e.kind === "ask") {
      open = { key: e.seq, type: "qa", by: e.by, card: e.card, text: e.text, answer: null, auto: false };
      items.push(open);
    } else if (e.kind === "answer" && open) {
      open.answer = e.answer;
      open.auto = e.auto;
      open = null;
    } else if (e.kind === "guess" && e.guess) {
      items.push({ key: e.seq, type: "guess", by: e.by, guess: e.guess, correct: Boolean(e.correct) });
    } else if (e.kind === "timeout") {
      items.push({ key: e.seq, type: "timeout", by: e.by });
    }
  }
  return items;
}

/** What you've learned about yourself: card answers, wrong guesses, and the opponent's (different) identity. */
export function knowledgeOf(events: WhoAmIEvent[], them: string | null) {
  const answers: Record<string, boolean> = {};
  const wrong: string[] = [];
  for (const item of logItems(events)) {
    if (item.type === "qa" && item.by === "you" && item.card && (item.answer === "yes" || item.answer === "no")) answers[item.card] = item.answer === "yes";
    if (item.type === "guess" && item.by === "you" && !item.correct) wrong.push(item.guess);
  }
  return { answers, wrong, exclude: them };
}

const questionText = (card: string | null, text: string | null) => (card ? (cardById(card)?.prompt ?? card) : `“${text ?? ""}”`);

function announce(item: LogItem | undefined, names: TableView["names"]) {
  if (!item) return "";
  const who = item.by === "you" ? "You" : names.them;
  if (item.type === "timeout") return `${who} ran out of time and missed a turn.`;
  if (item.type === "guess") return `${who} guessed ${characterById(item.guess)?.name ?? item.guess}: ${item.correct ? "correct!" : "wrong."}`;
  if (item.answer) return `${item.by === "you" ? names.them : "You"} answered ${ANSWER_LABEL[item.answer]} to ${item.by === "you" ? "your" : `${names.them}’s`} question.`;
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

/** The whole table: both players, the move panel, the elimination board and the question log. */
export function WhoAmITable({ view, actions, storageKey, banner, footer }: {
  view: TableView;
  actions: TableActions;
  /** Where this round's board marks are kept (per tab), so a refresh keeps them. */
  storageKey: string;
  banner?: ReactNode;
  footer?: ReactNode;
}) {
  const { play } = useArcade();
  const [crossed, setCrossed] = useBoardMarks(storageKey);
  const [guessMode, setGuessing] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const items = useMemo(() => logItems(view.events), [view.events]);
  const knowledge = useMemo(() => knowledgeOf(view.events, view.identity.them), [view.events, view.identity.them]);
  const consistent = useMemo(() => new Set(candidatesFor(knowledge).map((c) => c.id)), [knowledge]);
  const them = characterById(view.identity.them);
  const you = characterById(view.identity.you);
  const yourMove = view.phase === "ask" && view.turn === "you";
  // Guess mode only lasts for your own move.
  const guessing = guessMode && yourMove;
  const toAnswer = view.phase === "answer" && view.turn === "them" && view.pending;
  const done = view.phase === "done";
  const left = PLAYABLE.filter((c) => !crossed.has(c.id) && c.id !== view.identity.them && !knowledge.wrong.includes(c.id)).length;
  const lastSeq = view.events.at(-1)?.seq ?? 0;
  const seen = useRef(lastSeq);

  // A sound for each new move from the other side.
  useEffect(() => {
    if (lastSeq > seen.current) {
      const latest = view.events.at(-1);
      if (latest && latest.by === "them") play(latest.kind === "guess" ? (latest.correct ? "over" : "miss") : "tap");
    }
    seen.current = lastSeq;
  }, [lastSeq, view.events, play]);

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
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <p aria-live="polite" className="sr-only">{announce(items.at(-1), view.names)}</p>
      <div className="grid min-w-0 content-start gap-3 lg:order-2">
        {banner}
        <div className="grid grid-cols-2 gap-2">
          <PlayerCard label="You" name={view.names.you} active={view.turn === "you" && !done} winner={view.winner === "you"}>
            {you ? <Portrait character={you} label={`You were ${you.name}`} /> : <MysteryPortrait />}
            <p className="mt-1 truncate text-center text-xs font-semibold">{you ? you.name : "Who am I?"}</p>
          </PlayerCard>
          <PlayerCard label="Opponent" name={view.names.them} active={view.turn === "them" && !done} winner={view.winner === "them"}>
            {them ? <Portrait character={them} label={`${view.names.them} is ${them.name}`} /> : <MysteryPortrait />}
            <p className="mt-1 truncate text-center text-xs font-semibold">{them ? them.name : "Not dealt yet"}</p>
          </PlayerCard>
        </div>
        {them && !done ? (
          <details className="rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm" open>
            <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted-foreground uppercase">{them.name}’s traits (you answer about these)</summary>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {describeTraits(them.traits).map((trait) => <li key={trait} className="rounded-full border border-border px-2 py-0.5">{trait}</li>)}
            </ul>
          </details>
        ) : null}
        <MovePanel
          view={view}
          actions={actions}
          yourMove={yourMove}
          toAnswer={Boolean(toAnswer)}
          asked={knowledge.answers}
          askedCards={new Set(items.flatMap((item) => (item.type === "qa" && item.by === "you" && item.card ? [item.card] : [])))}
          guessing={guessing}
          pick={pick}
          onGuessing={(next) => {
            setGuessing(next);
            setPick(null);
          }}
        />
        {footer}
      </div>

      <section aria-labelledby="wai-board" className="min-w-0 rounded-xl border border-border bg-surface/40 p-3 lg:order-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 id="wai-board" className="text-sm font-bold">
            {guessing ? "Pick who you think you are" : "Board"}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">{left} left</span>
          {!done && !guessing ? (
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
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          {guessing ? "Choose a character, then confirm your guess." : "Tap a character to cross them out or bring them back. It’s only your notes."}
        </p>
        <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2">
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
                    "group relative block w-full rounded-lg border border-transparent p-0.5 text-left outline-none transition-[opacity,transform,border-color] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring",
                    !disabled && "hover:-translate-y-0.5 hover:border-amethyst/60 motion-reduce:hover:translate-y-0",
                    (out || wrong || opponent) && !revealed && "opacity-35",
                    picked && "border-amethyst ring-2 ring-amethyst",
                    revealed && "border-emerald-400 ring-2 ring-emerald-400",
                  )}
                >
                  <span className="relative block aspect-square overflow-hidden rounded-md">
                    <Portrait character={character} />
                    {out || wrong ? (
                      <span aria-hidden className="absolute inset-0 grid place-items-center bg-background/30">
                        <X className="size-3/5 text-rose-400 drop-shadow" strokeWidth={3} />
                      </span>
                    ) : null}
                    {opponent ? <span aria-hidden className="absolute inset-x-0 bottom-0 bg-background/80 py-0.5 text-center text-[0.6rem] font-bold uppercase">Them</span> : null}
                  </span>
                  <span className="block truncate px-0.5 pt-0.5 text-center text-[0.7rem] font-medium">{character.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <QuestionLog items={items} names={view.names} />
    </div>
  );
}

function PlayerCard({ label, name, active, winner, children }: { label: string; name: string; active: boolean; winner: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface/60 p-2 transition-colors motion-reduce:transition-none",
        active ? "border-amethyst shadow-[0_0_0_1px_var(--amethyst)]" : "border-border",
        winner && "border-emerald-400 shadow-[0_0_0_1px_#34d399]",
      )}
    >
      <p className="mb-1 flex items-center justify-between gap-1 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
        <span className="truncate">{label === "You" ? "You" : name}</span>
        {active ? <span className="rounded-full bg-amethyst px-1.5 text-[0.6rem] text-amethyst-foreground">Turn</span> : null}
        {winner ? <span className="rounded-full bg-emerald-400 px-1.5 text-[0.6rem] text-black">Winner</span> : null}
      </p>
      <div className="mx-auto aspect-square w-full max-w-36 overflow-hidden rounded-lg">{children}</div>
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

function MovePanel({ view, actions, yourMove, toAnswer, asked, askedCards, guessing, pick, onGuessing }: {
  view: TableView;
  actions: TableActions;
  yourMove: boolean;
  toAnswer: boolean;
  asked: Record<string, boolean>;
  askedCards: Set<string>;
  guessing: boolean;
  pick: string | null;
  onGuessing: (next: boolean) => void;
}) {
  const [chosen, setCard] = useState<string | null>(null);
  const [chosenTab, setTab] = useState<"cards" | "custom">("cards");
  // A picked card only counts on your own move and until it has been asked; custom questions need consent.
  const card = yourMove && chosen && !askedCards.has(chosen) ? chosen : null;
  const tab = view.customEnabled ? chosenTab : "cards";
  const [text, setText] = useState("");
  const cleaned = cleanQuestion(text);
  const textValid = cleaned.length >= CUSTOM_QUESTION_MIN && cleaned.length <= CUSTOM_QUESTION_MAX;
  const pending = view.pending;
  const answerRef = useRef<HTMLDivElement>(null);


  // Y / N (and U for custom questions) answer from the keyboard, unless typing.
  const question = toAnswer ? `${pending?.card ?? ""}|${pending?.text ?? ""}` : null;
  useEffect(() => {
    if (question !== null) answerRef.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [question]);
  useEffect(() => {
    if (!toAnswer) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.closest("input, textarea, [contenteditable]")) return;
      const key = event.key.toLowerCase();
      if (key === "y") actions.answer("yes");
      else if (key === "n") actions.answer("no");
      else if (key === "u" && pending?.kind === "custom") actions.answer("unsure");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toAnswer, actions, pending?.kind]);

  const header = (title: string, icon: ReactNode) => (
    <div className="mb-2 flex items-center gap-2">
      {icon}
      <h2 className="text-sm font-bold">{title}</h2>
      <span className="ml-auto">{view.phase !== "done" ? <Countdown deadline={view.deadline} /> : null}</span>
    </div>
  );

  if (view.phase === "done") return null;

  if (toAnswer && pending) {
    const them = characterById(view.identity.them);
    return (
      <section aria-label="Answer the question" className="rounded-xl border border-amethyst/60 bg-amethyst/10 p-3">
        {header(`${view.names.them} asks`, <CircleHelp aria-hidden className="size-4 text-amethyst" />)}
        <p className="text-base font-semibold text-pretty">{pending.kind === "card" ? cardById(pending.card)?.prompt : <q className="break-words">{pending.text}</q>}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Answer about {them ? them.name : "their character"}, the card you can see.{" "}
          {pending.kind === "custom" ? "This is a custom question: answer honestly. Nobody can check it." : "Card answers are checked."}
        </p>
        <div ref={answerRef} className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Your answer">
          <Button onClick={() => actions.answer("yes")} disabled={actions.busy} aria-keyshortcuts="Y">
            <Check aria-hidden />
            Yes
          </Button>
          <Button variant="outline" onClick={() => actions.answer("no")} disabled={actions.busy} aria-keyshortcuts="N">
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
      </section>
    );
  }

  if (!yourMove) {
    const waitingAnswer = view.phase === "answer" && view.turn === "you" && pending;
    return (
      <section aria-label="Waiting" className="rounded-xl border border-border bg-surface/50 p-3">
        {header(waitingAnswer ? "Your question" : `${view.names.them}’s turn`, <Hourglass aria-hidden className="size-4 text-muted-foreground" />)}
        {waitingAnswer ? (
          <p className="text-sm">
            <span className="font-semibold">{pending.kind === "card" ? cardById(pending.card)?.prompt : <q className="break-words">{pending.text}</q>}</span>
            <span className="block text-muted-foreground">Waiting for {view.names.them} to answer…</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{view.names.them} is choosing a question or a guess…</p>
        )}
      </section>
    );
  }

  if (guessing) {
    const chosen = characterById(pick);
    return (
      <section aria-label="Make a guess" className="rounded-xl border border-amethyst/60 bg-amethyst/10 p-3">
        {header("Guess who you are", <Target aria-hidden className="size-4 text-amethyst" />)}
        <p className="text-sm text-muted-foreground">
          {chosen ? <>You’ll guess <span className="font-semibold text-foreground">{chosen.name}</span>. A wrong guess passes the turn.</> : "Pick a character on the board."}
        </p>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" disabled={!chosen || actions.busy} onClick={() => chosen && actions.guess(chosen.id)}>
            <Target aria-hidden />
            {chosen ? `Guess ${chosen.name}` : "Guess"}
          </Button>
          <Button variant="outline" onClick={() => onGuessing(false)}>Cancel</Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Your turn" className="rounded-xl border border-amethyst/60 bg-amethyst/5 p-3">
      {header("Your turn: ask about yourself", <MessageSquareText aria-hidden className="size-4 text-amethyst" />)}
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
            A yes/no question about yourself. Answers are reported by {view.names.them} and can’t be verified.
          </label>
          <Textarea
            id="wai-custom"
            value={text}
            maxLength={CUSTOM_QUESTION_MAX}
            onChange={(event) => setText(event.target.value)}
            rows={2}
            placeholder="Do I look like I’d win at chess?"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.7rem] text-muted-foreground tabular-nums">{cleaned.length}/{CUSTOM_QUESTION_MAX}</span>
            <Button type="submit" size="sm" disabled={!textValid || actions.busy}>Ask</Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-2">
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {CARD_GROUPS.map((group) => (
              <fieldset key={group}>
                <legend className="mb-1 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">{group}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {CARDS.filter((entry) => entry.group === group).map((entry) => {
                    const used = askedCards.has(entry.id);
                    const answer = asked[entry.id];
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        disabled={used || actions.busy}
                        aria-pressed={card === entry.id}
                        title={entry.prompt}
                        aria-label={used ? `${entry.prompt} Already asked: ${answer === undefined ? "no answer" : answer ? "yes" : "no"}.` : entry.prompt}
                        onClick={() => setCard((current) => (current === entry.id ? null : entry.id))}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring",
                          card === entry.id ? "border-amethyst bg-amethyst text-amethyst-foreground" : "border-border hover:border-amethyst/60",
                          used && "opacity-60",
                        )}
                      >
                        {entry.short}
                        {used ? (answer ? <Check aria-hidden className="size-3 text-emerald-400" /> : <X aria-hidden className="size-3 text-rose-400" />) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <p className="min-h-5 text-sm font-semibold">{card ? cardById(card)?.prompt : <span className="font-normal text-muted-foreground">Pick a card to ask.</span>}</p>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!card || actions.busy} onClick={() => card && actions.ask({ card })}>
              <CircleHelp aria-hidden />
              Ask
            </Button>
            <Button variant="outline" onClick={() => onGuessing(true)} disabled={actions.busy}>
              <Target aria-hidden />
              Guess
            </Button>
          </div>
        </div>
      )}
      {tab === "custom" && view.customEnabled ? (
        <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => onGuessing(true)} disabled={actions.busy}>
          <Target aria-hidden />
          Make a guess instead
        </Button>
      ) : null}
    </section>
  );
}

function QuestionLog({ items, names }: { items: LogItem[]; names: TableView["names"] }) {
  return (
    <section aria-labelledby="wai-log" className="rounded-xl border border-border bg-surface/40 p-3 lg:col-span-2 lg:order-3">
      <h2 id="wai-log" className="mb-2 text-sm font-bold">Questions and guesses</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing asked yet.</p>
      ) : (
        <ol className="grid gap-1.5 sm:grid-cols-2" reversed>
          {[...items].reverse().map((item) => {
            const who = item.by === "you" ? "You" : names.them;
            return (
              <li key={item.key} className={cn("rounded-lg border px-2.5 py-1.5 text-sm", item.by === "you" ? "border-amethyst/40 bg-amethyst/5" : "border-border")}>
                <span className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">{who}</span>
                {item.type === "qa" ? (
                  <p className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="min-w-0 break-words">{questionText(item.card, item.text)}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 text-xs font-bold",
                        item.answer === "yes" ? "bg-emerald-400/20 text-emerald-300" : item.answer === "no" ? "bg-rose-400/20 text-rose-300" : "bg-foreground/10 text-muted-foreground",
                      )}
                    >
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
