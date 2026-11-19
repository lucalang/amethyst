/**
 * Who Am I?: a turn-based deduction duel. Both players get a secret character from the same roster; each can see
 * the other's character but not their own. On your turn you ask a yes/no question about yourself (the opponent
 * answers) or guess who you are. The first correct guess wins the round.
 *
 * The roster and question cards are mirrored in the database (`whoami_characters`, `whoami_cards`, see the
 * 20261218000100_who_am_i migration), which validates every answer and guess in Wager matches. Keep both in sync.
 */

export const WHO_AM_I_GAME = "who-am-i" as const;

export const GEMS = ["amethyst", "emerald", "sapphire", "ruby", "topaz"] as const;
export type Gem = (typeof GEMS)[number];
export const HAIR_STYLES = ["none", "short", "long", "curly"] as const;
export const HAIR_COLORS = ["none", "dark", "gold", "red", "silver", "violet"] as const;
export const HEADWEAR = ["none", "crown", "wizard", "cap", "flowers"] as const;
type YesNo = "yes" | "no";

/** Every trait is a plain string so the database can compare it the same way (`traits ->> trait`). */
export type Traits = {
  gem: Gem;
  hair: (typeof HAIR_STYLES)[number];
  hairColor: (typeof HAIR_COLORS)[number];
  headwear: (typeof HEADWEAR)[number];
  glasses: YesNo;
  beard: YesNo;
  earrings: YesNo;
  smiling: YesNo;
  scarf: YesNo;
  companion: YesNo;
};
export type TraitKey = keyof Traits;

export type Character = { id: string; name: string; traits: Traits };

const c = (
  id: string,
  name: string,
  gem: Gem,
  hair: Traits["hair"],
  hairColor: Traits["hairColor"],
  headwear: Traits["headwear"],
  flags: { glasses?: true; beard?: true; earrings?: true; smiling?: true; scarf?: true; companion?: true },
): Character => ({
  id,
  name,
  traits: {
    gem,
    hair,
    hairColor,
    headwear,
    glasses: flags.glasses ? "yes" : "no",
    beard: flags.beard ? "yes" : "no",
    earrings: flags.earrings ? "yes" : "no",
    smiling: flags.smiling ? "yes" : "no",
    scarf: flags.scarf ? "yes" : "no",
    companion: flags.companion ? "yes" : "no",
  },
});

/** The Gemfolk: original Amethyst characters, drawn from their traits (see portrait.tsx). */
export const ROSTER: readonly Character[] = [
  c("aster", "Aster", "amethyst", "long", "violet", "none", { earrings: true, smiling: true }),
  c("bram", "Bram", "emerald", "short", "dark", "cap", { beard: true, smiling: true, companion: true }),
  c("cora", "Cora", "sapphire", "curly", "red", "none", { glasses: true, earrings: true }),
  c("dax", "Dax", "ruby", "none", "none", "none", { glasses: true, scarf: true }),
  c("elio", "Elio", "topaz", "short", "gold", "crown", { smiling: true }),
  c("fenna", "Fenna", "emerald", "long", "gold", "flowers", { earrings: true, smiling: true, companion: true }),
  c("gil", "Gil", "sapphire", "short", "silver", "wizard", { glasses: true, beard: true, companion: true }),
  c("hana", "Hana", "amethyst", "curly", "dark", "none", { smiling: true, scarf: true }),
  c("iris", "Iris", "ruby", "long", "silver", "crown", { earrings: true }),
  c("jory", "Jory", "topaz", "curly", "red", "cap", { smiling: true, scarf: true, companion: true }),
  c("kit", "Kit", "amethyst", "short", "red", "none", { glasses: true, smiling: true, companion: true }),
  c("luma", "Luma", "sapphire", "long", "dark", "flowers", { earrings: true, scarf: true }),
  c("milo", "Milo", "ruby", "short", "gold", "none", { beard: true, smiling: true, scarf: true }),
  c("nell", "Nell", "emerald", "curly", "silver", "none", { glasses: true, earrings: true }),
  c("orin", "Orin", "topaz", "none", "none", "wizard", { companion: true }),
  c("pip", "Pip", "amethyst", "short", "gold", "cap", { glasses: true, smiling: true }),
  c("quill", "Quill", "sapphire", "curly", "violet", "crown", { glasses: true, smiling: true }),
  c("rhea", "Rhea", "ruby", "long", "red", "none", { earrings: true, smiling: true, scarf: true }),
  c("sol", "Sol", "topaz", "short", "dark", "none", { scarf: true }),
  c("tamsin", "Tamsin", "emerald", "long", "violet", "wizard", { earrings: true }),
  c("uma", "Uma", "amethyst", "none", "none", "flowers", { earrings: true, smiling: true }),
  c("vale", "Vale", "sapphire", "short", "dark", "none", { beard: true, smiling: true }),
  c("wren", "Wren", "emerald", "short", "red", "none", { companion: true }),
  c("zed", "Zed", "ruby", "curly", "dark", "cap", { glasses: true, beard: true, smiling: true }),
];

export type CardGroup = "Gem" | "Hair" | "Hair color" | "Headwear" | "Look";
export type Card = {
  id: string;
  group: CardGroup;
  /** Asked about yourself: "Is my gem a ruby?" */
  prompt: string;
  /** Short chip label: "Ruby gem". */
  short: string;
  trait: TraitKey;
  /** `eq`: the trait equals `value`; `ne`: it doesn't (used for "wearing anything on my head?"). */
  op: "eq" | "ne";
  value: string;
};

const GEM_WORDS: Record<Gem, string> = { amethyst: "an amethyst (purple)", emerald: "an emerald (green)", sapphire: "a sapphire (blue)", ruby: "a ruby (red)", topaz: "a topaz (gold)" };
const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The predefined questions. Each one is answerable for every character from its traits alone. */
export const CARDS: readonly Card[] = [
  ...GEMS.map((gem): Card => ({ id: `gem-${gem}`, group: "Gem", prompt: `Is my gem ${GEM_WORDS[gem]}?`, short: `${cap(gem)} gem`, trait: "gem", op: "eq", value: gem })),
  { id: "hair-none", group: "Hair", prompt: "Am I bald?", short: "Bald", trait: "hair", op: "eq", value: "none" },
  { id: "hair-short", group: "Hair", prompt: "Is my hair short?", short: "Short hair", trait: "hair", op: "eq", value: "short" },
  { id: "hair-long", group: "Hair", prompt: "Is my hair long?", short: "Long hair", trait: "hair", op: "eq", value: "long" },
  { id: "hair-curly", group: "Hair", prompt: "Is my hair curly?", short: "Curly hair", trait: "hair", op: "eq", value: "curly" },
  ...(["dark", "gold", "red", "silver", "violet"] as const).map((color): Card => ({
    id: `color-${color}`,
    group: "Hair color",
    prompt: `Is my hair ${color}?`,
    short: `${cap(color)} hair`,
    trait: "hairColor",
    op: "eq",
    value: color,
  })),
  { id: "head-any", group: "Headwear", prompt: "Am I wearing anything on my head?", short: "Headwear", trait: "headwear", op: "ne", value: "none" },
  { id: "head-crown", group: "Headwear", prompt: "Am I wearing a crown?", short: "Crown", trait: "headwear", op: "eq", value: "crown" },
  { id: "head-wizard", group: "Headwear", prompt: "Am I wearing a pointed hat?", short: "Pointed hat", trait: "headwear", op: "eq", value: "wizard" },
  { id: "head-cap", group: "Headwear", prompt: "Am I wearing a cap?", short: "Cap", trait: "headwear", op: "eq", value: "cap" },
  { id: "head-flowers", group: "Headwear", prompt: "Am I wearing a flower wreath?", short: "Flower wreath", trait: "headwear", op: "eq", value: "flowers" },
  { id: "glasses", group: "Look", prompt: "Do I wear glasses?", short: "Glasses", trait: "glasses", op: "eq", value: "yes" },
  { id: "beard", group: "Look", prompt: "Do I have a beard?", short: "Beard", trait: "beard", op: "eq", value: "yes" },
  { id: "earrings", group: "Look", prompt: "Do I wear earrings?", short: "Earrings", trait: "earrings", op: "eq", value: "yes" },
  { id: "smiling", group: "Look", prompt: "Am I smiling?", short: "Smiling", trait: "smiling", op: "eq", value: "yes" },
  { id: "scarf", group: "Look", prompt: "Do I wear a scarf?", short: "Scarf", trait: "scarf", op: "eq", value: "yes" },
  { id: "companion", group: "Look", prompt: "Do I have a little companion?", short: "Companion", trait: "companion", op: "eq", value: "yes" },
];
export const CARD_GROUPS: readonly CardGroup[] = ["Gem", "Hair", "Hair color", "Headwear", "Look"];

const CARD_BY_ID = new Map(CARDS.map((card) => [card.id, card]));
export const cardById = (id: string | null | undefined) => (id ? CARD_BY_ID.get(id) : undefined);

/** The truthful answer to a card for a character. */
export function cardTruth(character: Character, card: Card) {
  const value = character.traits[card.trait];
  return card.op === "eq" ? value === card.value : value !== card.value;
}

const signature = (character: Character) => CARDS.map((card) => (cardTruth(character, card) ? 1 : 0)).join("");

/**
 * Fair play: only characters with every trait set and a card signature no other character shares can be dealt,
 * so the cards can always tell any two candidates apart and every answer is consistent.
 */
function fairRoster(roster: readonly Character[]) {
  const counts = new Map<string, number>();
  for (const character of roster) counts.set(signature(character), (counts.get(signature(character)) ?? 0) + 1);
  return roster.filter((character) => {
    const complete = (Object.keys(character.traits) as TraitKey[]).every((key) => typeof character.traits[key] === "string" && character.traits[key].length > 0);
    const bald = character.traits.hair === "none";
    // Hair color "none" exactly when bald, so the hair color cards never contradict the hair cards.
    const hairConsistent = bald === (character.traits.hairColor === "none");
    return complete && hairConsistent && counts.get(signature(character)) === 1;
  });
}

/** The characters that can be dealt and appear on the board. */
export const PLAYABLE: readonly Character[] = fairRoster(ROSTER);
const CHARACTER_BY_ID = new Map(PLAYABLE.map((character) => [character.id, character]));
export const characterById = (id: string | null | undefined) => (id ? CHARACTER_BY_ID.get(id) : undefined);

/** Plain-language trait sheet, used for answering about the character you can see (and for screen readers). */
export function describeTraits(t: Traits): string[] {
  const hair = t.hair === "none" ? "Bald" : `${cap(t.hair)} ${t.hairColor} hair`;
  const head = { none: "Nothing on their head", crown: "Crown", wizard: "Pointed hat", cap: "Cap", flowers: "Flower wreath" }[t.headwear];
  return [
    `${cap(t.gem)} gem`,
    hair,
    head,
    t.glasses === "yes" ? "Glasses" : "No glasses",
    t.beard === "yes" ? "Beard" : "No beard",
    t.earrings === "yes" ? "Earrings" : "No earrings",
    t.smiling === "yes" ? "Smiling" : "Not smiling",
    t.scarf === "yes" ? "Scarf" : "No scarf",
    t.companion === "yes" ? "Has a companion" : "No companion",
  ];
}

// --- Deduction helpers (the board's auto-cross and the bot) -------------------------------------------

/** What a player has learned about their own identity. */
export type Knowledge = {
  /** Card answers about yourself (card id → answer). Custom questions aren't machine-checkable and aren't here. */
  answers: Record<string, boolean>;
  /** Characters you guessed wrongly. */
  wrong: string[];
  /** The opponent's visible character: identities are always different, so it can't be yours. */
  exclude: string | null;
};

export const emptyKnowledge = (exclude: string | null = null): Knowledge => ({ answers: {}, wrong: [], exclude });

export function candidatesFor(knowledge: Knowledge, roster: readonly Character[] = PLAYABLE) {
  return roster.filter((character) => {
    if (character.id === knowledge.exclude || knowledge.wrong.includes(character.id)) return false;
    return Object.entries(knowledge.answers).every(([id, answer]) => {
      const card = cardById(id);
      return !card || cardTruth(character, card) === answer;
    });
  });
}

/** Cards that would still split the candidates (asking any other card can't teach anything). */
export function usefulCards(candidates: readonly Character[], asked: Iterable<string>) {
  const done = new Set(asked);
  return CARDS.filter((card) => {
    if (done.has(card.id)) return false;
    const yes = candidates.filter((character) => cardTruth(character, card)).length;
    return yes > 0 && yes < candidates.length;
  });
}

// --- The bot ------------------------------------------------------------------------------------------

export type BotLevel = "easy" | "normal" | "sharp";
export const BOT_LEVELS: { id: BotLevel; label: string; hint: string }[] = [
  { id: "easy", label: "Easy", hint: "Asks any useful card and guesses only when sure" },
  { id: "normal", label: "Normal", hint: "Asks the card that splits its options best" },
  { id: "sharp", label: "Sharp", hint: "Splits best and takes a 50/50 guess when it’s worth it" },
];

export type BotMove = { kind: "ask"; card: Card } | { kind: "guess"; character: Character };

/**
 * The bot's move from what it legitimately knows: its own answered cards, its wrong guesses and the player's
 * visible character. It never reads its own identity. `random` makes ties and Easy picks; pass a seeded one for
 * repeatable play.
 */
export function botMove(knowledge: Knowledge, level: BotLevel, random: () => number = Math.random): BotMove {
  const candidates = candidatesFor(knowledge);
  const pick = <T,>(list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
  if (candidates.length === 1) return { kind: "guess", character: candidates[0] };
  if (level === "sharp" && candidates.length === 2) return { kind: "guess", character: pick(candidates) };
  const cards = usefulCards(candidates, Object.keys(knowledge.answers));
  if (cards.length === 0) return { kind: "guess", character: pick(candidates) };
  if (level === "easy") return { kind: "ask", card: pick(cards) };
  const score = (card: Card) => Math.abs(candidates.filter((character) => cardTruth(character, card)).length * 2 - candidates.length);
  const best = Math.min(...cards.map(score));
  return { kind: "ask", card: pick(cards.filter((card) => score(card) === best)) };
}

// --- Wager rounds (server state as each player may see it) ---------------------------------------------

export const WHO_AM_I_TURN_SECONDS = 120;
export const WHO_AM_I_MAX_STRIKES = 2;
export const WHO_AM_I_MAX_TURNS = 80;
export const CUSTOM_QUESTION_MAX = 140;
export const CUSTOM_QUESTION_MIN = 3;

export type Side = "you" | "them";
export type CustomAnswer = "yes" | "no" | "unsure" | "none";

export type WhoAmIEvent = {
  seq: number;
  by: Side | "system";
  kind: "start" | "ask" | "answer" | "guess" | "timeout" | "end";
  card: string | null;
  text: string | null;
  answer: CustomAnswer | null;
  guess: string | null;
  correct: boolean | null;
  auto: boolean;
  at: string;
};

export type WhoAmIState = {
  now: string;
  round: number;
  wagerStatus: string;
  roundOutcome: "host" | "opponent" | "tie" | "void" | null;
  phase: "lobby" | "ask" | "answer" | "done";
  seq: number;
  joined: { you: boolean; them: boolean };
  names: { you: string; them: string };
  turn: Side | null;
  deadline: string | null;
  roundDeadline: string;
  /** Your own identity stays null until the round is over. */
  identity: { you: string | null; them: string | null };
  pending: { kind: "card" | "custom"; card: string | null; text: string | null } | null;
  custom: { you: boolean | null; them: boolean | null; enabled: boolean };
  strikes: { you: number; them: number };
  turns: number;
  winner: Side | null;
  reason: "guess" | "timeout" | "no_show" | "turn_limit" | null;
  events: WhoAmIEvent[];
};

const range = (from: number, to: number) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`;
/** Control, zero-width, bidi-override and line/paragraph separator characters. */
const INVISIBLE = new RegExp(`[${range(0x00, 0x1f)}${range(0x7f, 0x9f)}${range(0x200b, 0x200f)}${range(0x2028, 0x202e)}${range(0x2060, 0x206f)}${String.fromCharCode(0xfeff)}]`, "g");

/** Mirrors the database's cleanup: no control characters, single spaces, trimmed. */
export function cleanQuestion(text: string) {
  return text
    .replace(INVISIBLE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const WHO_AM_I_RULES = [
  "You and your opponent each get a secret character from the same board of Gemfolk. You can see theirs, but not your own. The two are always different.",
  "On your turn, ask one yes/no question about yourself, or make a guess. Your opponent answers questions about you; you answer theirs.",
  "Use the board to cross out characters who don’t fit what you’ve learned.",
  "Guess right and you win the round. Guess wrong and the turn simply passes.",
];
