"use client";

import { useEffect, useState } from "react";
import { Check, FastForward, Music } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LabProps } from ".";

/** One screen of a retention flow. Each subscription strings its own screens together. */
type Step =
  | { kind: "confirm"; title: string; body: string; keep: string; kept: string; go: string }
  | { kind: "choice"; title: string; options: readonly string[]; submit: string }
  | { kind: "offer"; title: string; body: string; accept: string; accepted: string; decline: string }
  | { kind: "pause"; title: string; options: readonly string[]; escape: string }
  | { kind: "checks"; title: string; body: string; items: readonly { label: string; want: boolean }[]; submit: string }
  | { kind: "quiz"; title: string; question: string; options: readonly string[]; answer: number; wrong: string }
  | { kind: "wait"; title: string; body: string; seconds: number; tune: string }
  | { kind: "chat"; from: string; lines: readonly string[]; keep: string; kept: string; go: string }
  | { kind: "type"; title: string; phrase: string; hint: string };

type Subscription = { id: string; name: string; detail: string; price: string; steps: readonly Step[] };

const SUBSCRIPTIONS: readonly Subscription[] = [
  {
    id: "air",
    name: "Premium Air",
    detail: "Breathing, now with 4% more oxygen.",
    price: "€0.00 / breath",
    steps: [
      { kind: "confirm", title: "Stop breathing premium?", body: "You’ll go back to regular air. It’s fine. People manage.", keep: "Keep breathing premium", kept: "Premium Air stays. Inhale deeply.", go: "switch to regular air" },
      { kind: "offer", title: "One last breath of fresh air", body: "Stay and get a free sigh of relief every Monday.", accept: "I could use a sigh", accepted: "Monday sighs activated. None of this exists.", decline: "No sighs, thanks" },
    ],
  },
  {
    id: "socks",
    name: "Socks Monthly+",
    detail: "One left sock a month. Right socks sold separately.",
    price: "€9.99 / foot",
    steps: [
      { kind: "confirm", title: "Are you absolutely, positively sure?", body: "Think of everything you’d lose. Mostly left socks, but think of it anyway.", keep: "Keep my wonderful socks", kept: "Socks Monthly+ stays. (It was never real.)", go: "continue cancelling, I suppose" },
      { kind: "choice", title: "Help us understand your betrayal", options: ["It’s too good and that scares me", "My socks achieved sentience", "I own too many left socks", "Other (we’ll pretend to read it)"], submit: "Submit feelings" },
      { kind: "offer", title: "Wait! A once-in-a-lifetime offer", body: "99% off, forever-ish. That’s practically free, if you squint at it from orbit.", accept: "Accept the deal of the century", accepted: "Offer accepted! Nothing was charged, because none of this exists.", decline: "No thanks" },
      { kind: "pause", title: "How about a little pause instead?", options: ["1 week", "1 month", "1 fiscal eon", "Until the heat death of the universe"], escape: "I want to cancel, not pause" },
      { kind: "type", title: "Final step, honestly", phrase: "CANCEL", hint: "In any font you like." },
    ],
  },
  {
    id: "clouds",
    name: "Cloud Storage for Clouds",
    detail: "A safe place for cumulus, stratus and the occasional nimbus.",
    price: "3 raindrops / month",
    steps: [
      { kind: "confirm", title: "Release your clouds into the wild?", body: "Your 14 stored clouds will drift away. One of them looks like a rabbit.", keep: "Keep the rabbit cloud", kept: "Your clouds stay stored. The rabbit thanks you.", go: "let them drift" },
      {
        kind: "checks",
        title: "Please review your preferences",
        body: "Set every box correctly to continue. Read carefully, as nobody intended.",
        items: [
          { label: "Uncheck this to not stop leaving.", want: false },
          { label: "Check this if you don’t want to keep not cancelling.", want: true },
          { label: "Leave this unchecked unless you’d rather not keep it unchecked.", want: false },
        ],
        submit: "Save preferences",
      },
      { kind: "quiz", title: "Security question", question: "To prove you’re a cloud owner: which of these is a cloud?", options: ["Cumulus", "Cumulonimbus’s cousin Gary", "A large sheep", "Steam from your tea"], answer: 0, wrong: "That’s not a cloud. Gary is offended." },
      { kind: "type", title: "Say goodbye properly", phrase: "LET THE CLOUDS GO", hint: "With feeling." },
    ],
  },
  {
    id: "thumbs",
    name: "Gym for Your Thumbs",
    detail: "Personal training for scrolling, texting and thumb wars.",
    price: "€4.99 / thumb",
    steps: [
      {
        kind: "chat",
        from: "Coach Brad",
        lines: ["Hey champ! Brad here. I heard you want to quit?", "Your thumbs were SO close to their personal best.", "Remember leg day? Neither do they. Thumb day though…"],
        keep: "You’re right, Brad",
        kept: "Brad is thrilled. Your thumbs are not.",
        go: "Brad, I still want to cancel",
      },
      { kind: "wait", title: "Please hold for the cancellations team", body: "You are caller number 1. Estimated wait: a few seconds, or one motivational song.", seconds: 6, tune: "♪ Eye of the Thumb ♪" },
      { kind: "offer", title: "Free upgrade: Pinky Pilates", body: "Six weeks of pinky strength training, absolutely free, if you stay.", accept: "Train my pinkies", accepted: "Pinky Pilates booked. It isn’t real, so your pinkies are safe.", decline: "My pinkies are fine" },
      { kind: "choice", title: "Where will your thumbs go now?", options: ["Retirement", "A competing gym", "Thumb wars, freelance", "They’ll just hang out"], submit: "That’s my answer" },
      { kind: "confirm", title: "Brad is crying a little", body: "Not a lot. A manly amount. Are you really doing this to Brad?", keep: "Stay for Brad", kept: "Brad stops crying. You stay subscribed.", go: "sorry, Brad" },
    ],
  },
  {
    id: "boxes",
    name: "Mystery Box of Smaller Boxes",
    detail: "Every month, a box. Inside: a smaller box. Inside that: you guessed it. Leaving takes a while.",
    price: "€19.99 / box (boxes included)",
    steps: [
      { kind: "confirm", title: "Stop the boxes?", body: "Next month’s box contains a box so small it’s basically a theory.", keep: "I need to see that box", kept: "The boxes keep coming. Clear some shelf space.", go: "stop the boxes" },
      { kind: "choice", title: "Why are you leaving the box family?", options: ["I ran out of room for boxes", "I found the last box was empty", "I’m more of a bag person", "The boxes started talking"], submit: "Submit reason" },
      { kind: "offer", title: "How about bigger boxes?", body: "Upgrade to Mystery Box XL: the same boxes, but each one comes in a bigger box.", accept: "Bigger boxes, please", accepted: "Upgraded to XL. No boxes will arrive, because none exist.", decline: "Smaller is enough" },
      { kind: "pause", title: "Maybe just pause the boxes?", options: ["1 box", "3 boxes", "A box-free summer", "Until boxes go out of style"], escape: "No pausing, cancel" },
      {
        kind: "chat",
        from: "Boxy (official mascot)",
        lines: ["Hi!! I’m Boxy! I’m a box!", "I heard you want to leave. That makes my corners droop.", "Did you know I have six sides? Six sides of LOVE?"],
        keep: "Aww, okay Boxy",
        kept: "Boxy is overjoyed. The boxes keep coming.",
        go: "Sorry Boxy, keep going",
      },
      {
        kind: "checks",
        title: "Confirm what you’re giving up",
        body: "Tick every box. Yes, the boxes are boxes too.",
        items: [
          { label: "I understand I will receive no further boxes.", want: true },
          { label: "I understand the boxes I have will remain boxes.", want: true },
          { label: "I will not tell the boxes it was personal.", want: true },
        ],
        submit: "I understand all of that",
      },
      { kind: "quiz", title: "Box knowledge check", question: "How many boxes are in a box of boxes?", options: ["One", "At least one more", "Zero", "It’s boxes all the way down"], answer: 3, wrong: "Close, but the boxes say otherwise." },
      { kind: "confirm", title: "Have you talked to your boxes about this?", body: "Studies show boxes cope better when the news comes from you.", keep: "I’ll stay and talk to them", kept: "A heart-to-heart with your boxes. You’re still subscribed.", go: "they’ll understand" },
      { kind: "wait", title: "Unpacking your account", body: "We’re opening every box to make sure there’s nothing left inside.", seconds: 5, tune: "♪ Box Me Gently ♪" },
      { kind: "choice", title: "Rate your box experience", options: ["★★★★★ Boxes!", "★★★★ Mostly boxes", "★★ Too many boxes", "★ I am now a box"], submit: "Send rating" },
      { kind: "offer", title: "Boxes every other month?", body: "Half the boxes. Twice the anticipation. Same tiny box at the end.", accept: "Every other month sounds nice", accepted: "Switched to bi-monthly boxes. Still subscribed!", decline: "No months at all" },
      {
        kind: "checks",
        title: "Communication preferences",
        body: "Before you go, set these exactly right.",
        items: [
          { label: "Uncheck to stop not receiving the Box Bulletin.", want: true },
          { label: "Check this to not opt out of not hearing from us.", want: false },
          { label: "Leave checked if you don’t want boxes. Or unchecked. No, checked.", want: true },
        ],
        submit: "Save my preferences",
      },
      { kind: "quiz", title: "Pop quiz", question: "Which of these is NOT a box?", options: ["A crate", "A carton", "A chest", "A circle"], answer: 3, wrong: "That is very much a box." },
      { kind: "type", title: "Just checking", phrase: "I AM SURE", hint: "This isn’t the last step. Sorry." },
      {
        kind: "chat",
        from: "The Box Council",
        lines: ["The Box Council has convened.", "We have reviewed your request and found it… unboxlike.", "You may proceed, but the Council will remember this."],
        keep: "I withdraw my request",
        kept: "The Council nods. The boxes continue.",
        go: "Proceed, Council",
      },
      { kind: "offer", title: "Try a Mystery Envelope instead?", body: "Flatter, cheaper, and inside there’s a smaller envelope.", accept: "Envelopes, why not", accepted: "Downgraded to envelopes. Still technically subscribed.", decline: "No envelopes either" },
      { kind: "wait", title: "Transferring you to a senior box specialist", body: "Your call is important to us. Your boxes are more important.", seconds: 6, tune: "♪ Thinking Outside the Box (Smooth Jazz Version) ♪" },
      { kind: "choice", title: "Which box will you miss most?", options: ["The first box", "The box inside the first box", "The really small one", "The one that rattled"], submit: "That one" },
      { kind: "confirm", title: "Are you sure you’re sure you’re sure?", body: "We asked a while ago, but a lot can change in eighteen steps.", keep: "Actually, I’m not sure", kept: "Doubt wins. The boxes stay.", go: "I’m sure³" },
      { kind: "offer", title: "Final offer: one free box", body: "Not a subscription. Just one box. With a tiny box inside. Think about it.", accept: "Okay, one box", accepted: "One box incoming, which means you’re still subscribed. Classic.", decline: "No more boxes" },
      {
        kind: "checks",
        title: "Last legal stuff, promise",
        body: "Tick the true ones only.",
        items: [
          { label: "I made it through twenty screens to get here.", want: true },
          { label: "I would like to start over from step one.", want: false },
          { label: "I deserve a medal.", want: true },
        ],
        submit: "Agree and continue",
      },
      { kind: "type", title: "Seal it shut", phrase: "NO MORE BOXES", hint: "Then we’ll tape it. This one is really the last step." },
    ],
  },
  {
    id: "newsletter",
    name: "Newsletter About Newsletters",
    detail: "A weekly roundup of the best weekly roundups.",
    price: "Free (costs one inbox)",
    steps: [{ kind: "type", title: "Unsubscribe", phrase: "UNSUBSCRIBE", hint: "We just need you to really mean it." }],
  },
  {
    id: "ghosts",
    name: "Ghost Hunting Club",
    detail: "Monthly haunted outings. Ghosts not guaranteed, vibes guaranteed.",
    price: "€6.66 / month",
    steps: [
      { kind: "confirm", title: "Leave the club?", body: "The ghosts were just starting to like you. Well, one of them.", keep: "I’ll stay for the ghost", kept: "Membership kept. Something in the attic approves.", go: "leave anyway" },
      {
        kind: "chat",
        from: "Gerald (a ghost)",
        lines: ["Ooooooh. Oh, hello. Sorry, force of habit.", "I heard you’re leaving. Nobody ever stays for me.", "I learned to rattle chains. For you. It took ninety years."],
        keep: "Fine, Gerald, I’ll stay",
        kept: "Gerald is delighted. He rattles something.",
        go: "Gerald, I’m sorry",
      },
      { kind: "quiz", title: "Exit exam", question: "What should you do if you meet a ghost?", options: ["Scream", "Offer it a snack", "Politely ask about its day", "Run in a circle"], answer: 2, wrong: "Rude. Gerald would never." },
      { kind: "pause", title: "Pause your haunting instead?", options: ["Until Halloween", "A full moon cycle", "Until you stop being scared", "Forever (spooky)"], escape: "No, I want out" },
      { kind: "type", title: "Say the words", phrase: "I AM NOT AFRAID", hint: "Even if you are a little." },
    ],
  },
  {
    id: "ducks",
    name: "Duck Pond Pro",
    detail: "Access to a premium pond. The ducks are the same, but they look premium.",
    price: "4 bread crumbs / day",
    steps: [
      { kind: "offer", title: "Leaving? Here’s 50% off", body: "Half the price for twice the quacks.", accept: "Take the deal", accepted: "Deal accepted. The ducks are pleased.", decline: "No thanks" },
      { kind: "offer", title: "Okay, 75% off", body: "Plus a duck will follow you around for a day. Just a little bit.", accept: "I want a follower", accepted: "A duck now follows you. Imaginary, but loyal.", decline: "Still no" },
      { kind: "offer", title: "Fine. 100% off and a tiny hat", body: "It’s free and the ducks get hats. This is our final offer. Probably.", accept: "Ducks in hats? Yes", accepted: "The ducks wear hats now. You’re staying, obviously.", decline: "Not even for hats" },
      { kind: "offer", title: "We’ll pay YOU to stay", body: "One imaginary euro per duck per day. We have a lot of ducks.", accept: "Show me the money", accepted: "You’re rich in imaginary euros. And still subscribed.", decline: "I just want to leave" },
      { kind: "type", title: "The ducks need to hear it", phrase: "NO MORE DUCKS", hint: "Loud enough for the back of the pond." },
    ],
  },
];

const same = (typed: string, phrase: string) => typed.trim().replace(/\s+/g, " ").toUpperCase() === phrase;

function Hold({ step, onDone }: { step: Extract<Step, { kind: "wait" }>; onDone: () => void }) {
  const [left, setLeft] = useState(step.seconds);
  useEffect(() => {
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <h2 className="text-lg font-semibold">{step.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
      <p className="mt-4 flex items-center gap-2 text-sm">
        <Music aria-hidden className="size-4 text-(--lab-accent-text)" />
        Now playing: {step.tune}
      </p>
      <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--lab-line)">
        <div className="h-full bg-(--lab-accent) transition-[width] duration-1000 ease-linear" style={{ width: `${((step.seconds - left) / step.seconds) * 100}%` }} />
      </div>
      <button type="button" disabled={left > 0} onClick={onDone} className="lab-btn mt-4">
        {left > 0 ? `Please hold… ${left}s` : "Talk to someone"}
      </button>
    </>
  );
}

export function CancelMaze({ assist, celebrate }: LabProps) {
  const [cancelled, setCancelled] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [checks, setChecks] = useState<boolean[]>([]);
  const [wrong, setWrong] = useState(false);
  const [note, setNote] = useState("");
  const sub = SUBSCRIPTIONS.find((item) => item.id === active);

  function open(at: number, target = sub) {
    const step = target?.steps[at];
    setIndex(at);
    setAnswer("");
    setWrong(false);
    setChecks(step?.kind === "checks" ? step.items.map((item) => !item.want) : []);
  }
  function start(id: string) {
    const target = SUBSCRIPTIONS.find((item) => item.id === id)!;
    if (assist) {
      setCancelled((list) => [...list, id]);
      setNote(`${target.name} cancelled in one click. Refreshing, isn’t it?`);
      celebrate();
      return;
    }
    setActive(id);
    setNote("");
    open(0, target);
  }
  function keep(message: string) {
    setActive(null);
    setNote(message);
  }
  function finish() {
    if (sub && !cancelled.includes(sub.id)) setCancelled((list) => [...list, sub.id]);
    setIndex(sub ? sub.steps.length : 0);
    celebrate();
  }
  function next() {
    if (!sub) return;
    if (index + 1 >= sub.steps.length) finish();
    else open(index + 1);
  }

  if (sub) {
    const step = sub.steps[index];
    const total = sub.steps.length;
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Cancelling <strong className="text-foreground">{sub.name}</strong> (pretend)
          </span>
          <span className="lab-mono tabular-nums">{step ? `Step ${index + 1} of ${total}${total > 3 ? "ish" : ""}` : "Done"}</span>
        </div>
        <div aria-hidden className="flex gap-1">
          {sub.steps.map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= index ? "bg-(--lab-accent-text)" : "bg-(--lab-line)")} />
          ))}
        </div>
        <div aria-live="polite" className="lab-box p-5">
          <div key={index} className="lab-stage-body">
            {!step ? (
              <>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Check aria-hidden className="size-5 text-(--lab-good)" />
                  Cancelled. We’ll miss you (fictionally).
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You escaped {sub.name} in {total} {total === 1 ? "step" : "steps"}. A real service should let you do this in one click.
                </p>
                <button type="button" onClick={() => setActive(null)} className="lab-btn mt-4">
                  Back to my subscriptions
                </button>
              </>
            ) : step.kind === "confirm" ? (
              <>
                <h2 className="text-lg font-semibold">{step.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                <div className="mt-4 flex flex-col gap-2">
                  <button type="button" onClick={() => keep(step.kept)} className="lab-btn lab-btn-primary lab-btn-lg">
                    {step.keep}
                  </button>
                  <button type="button" onClick={next} className="lab-link self-center">
                    {step.go}
                  </button>
                </div>
              </>
            ) : step.kind === "choice" ? (
              <>
                <h2 className="text-lg font-semibold">{step.title}</h2>
                <fieldset className="mt-3 space-y-1.5">
                  <legend className="sr-only">{step.title}</legend>
                  {step.options.map((option) => (
                    <label key={option} className="flex items-center gap-2 text-sm">
                      <input type="radio" name="maze-choice" value={option} checked={answer === option} onChange={() => setAnswer(option)} className="accent-(--lab-accent-text)" />
                      {option}
                    </label>
                  ))}
                </fieldset>
                <button type="button" disabled={!answer} onClick={next} className="lab-btn mt-4">
                  {step.submit}
                </button>
              </>
            ) : step.kind === "offer" ? (
              <>
                <h2 className="text-lg font-semibold">{step.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => keep(step.accepted)} className="lab-btn lab-btn-primary">
                    {step.accept}
                  </button>
                  <button type="button" onClick={next} className="lab-btn">
                    {step.decline}
                  </button>
                </div>
              </>
            ) : step.kind === "pause" ? (
              <>
                <h2 className="text-lg font-semibold">{step.title}</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {step.options.map((option) => (
                    <button key={option} type="button" onClick={() => keep(`${sub.name} paused: ${option.toLowerCase()}. See you then (not really).`)} className="lab-btn lab-btn-wrap">
                      Pause: {option.toLowerCase()}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={next} className="lab-link mt-3">
                  {step.escape}
                </button>
              </>
            ) : step.kind === "checks" ? (
              <>
                <h2 className="text-lg font-semibold">{step.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                <div className="mt-3 space-y-2">
                  {step.items.map((item, i) => (
                    <label key={item.label} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checks[i] ?? false}
                        onChange={(event) => setChecks((list) => list.map((value, j) => (j === i ? event.target.checked : value)))}
                        className="mt-0.5 accent-(--lab-accent-text)"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
                {wrong ? <p className="mt-3 text-sm text-(--lab-bad)">Some boxes are still set the wrong way. Read them once more, slowly.</p> : null}
                <button type="button" onClick={() => (step.items.every((item, i) => checks[i] === item.want) ? next() : setWrong(true))} className="lab-btn mt-4">
                  {step.submit}
                </button>
              </>
            ) : step.kind === "quiz" ? (
              <>
                <h2 className="text-lg font-semibold">{step.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{step.question}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {step.options.map((option, i) => (
                    <button key={option} type="button" onClick={() => (i === step.answer ? next() : setWrong(true))} className="lab-btn lab-btn-wrap">
                      {option}
                    </button>
                  ))}
                </div>
                {wrong ? <p className="mt-3 text-sm text-(--lab-bad)">{step.wrong} Try again.</p> : null}
              </>
            ) : step.kind === "wait" ? (
              <Hold step={step} onDone={next} />
            ) : step.kind === "chat" ? (
              <>
                <p className="text-xs font-semibold text-muted-foreground">{step.from}</p>
                <ul className="mt-2 space-y-1.5">
                  {step.lines.map((line) => (
                    <li key={line} className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-(--lab-sunken) px-3 py-2 text-sm">
                      {line}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-col items-end gap-2">
                  <button type="button" onClick={() => keep(step.kept)} className="lab-btn lab-btn-primary">
                    {step.keep}
                  </button>
                  <button type="button" onClick={next} className="lab-link">
                    {step.go}
                  </button>
                </div>
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (same(answer, step.phrase)) next();
                }}
              >
                <h2 className="text-lg font-semibold">{step.title}</h2>
                <label htmlFor="maze-confirm" className="mt-1 block text-sm text-muted-foreground">
                  Type {step.phrase} to confirm. {step.hint}
                </label>
                <input id="maze-confirm" value={answer} onChange={(event) => setAnswer(event.target.value)} autoComplete="off" className="lab-input mt-3" />
                <button type="submit" disabled={!same(answer, step.phrase)} className="lab-btn lab-btn-primary mt-3">
                  Confirm cancellation
                </button>
              </form>
            )}
          </div>
        </div>
        {step ? (
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => keep("")} className="lab-btn lab-btn-ghost">
              Back to the list
            </button>
            <button type="button" onClick={finish} className="lab-btn lab-btn-ghost">
              <FastForward aria-hidden className="size-4" />
              Skip to the end
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <p className="text-sm text-muted-foreground">Your totally made-up subscriptions. No money, account or real service is involved. Every one has its own way of not letting go.</p>
      <ul className="lab-box divide-y divide-border">
        {SUBSCRIPTIONS.map((item) => {
          const gone = cancelled.includes(item.id);
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className={cn("font-medium", gone && "text-muted-foreground line-through")}>{item.name}</p>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
                <p className="lab-mono mt-0.5 text-xs text-muted-foreground">{gone ? "Cancelled" : item.price}</p>
              </div>
              {gone ? (
                <Check aria-label="Cancelled" className="size-5 shrink-0 text-(--lab-good)" />
              ) : (
                <button type="button" onClick={() => start(item.id)} className="lab-btn shrink-0">
                  Cancel
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="min-h-5 text-sm">
        {note || (cancelled.length === SUBSCRIPTIONS.length ? "All cancelled. You are free. Free as unstored clouds." : "")}
      </p>
    </div>
  );
}
