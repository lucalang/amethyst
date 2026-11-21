import "server-only";
import { ROUND_SIZE, roundGuessSchema, type RoundModeId, type RoundPrompt, type RoundResult } from "./guess-the";
import { FLAG_IDS, flagPrompt, revealFlag } from "./guess-the-flags";
import { PRICE_IDS, pricePrompt, revealPrice } from "./guess-the-prices";
import { SIZE_IDS, revealSize, sizePrompt } from "./guess-the-sizes";

/**
 * The round-based Guess The ... modes, served by /api/arcade/guess-the/<mode>. A mode is a set of prompts: how to
 * show one (never including its answer) and how to reveal and score a guess for it. Add a mode here, in
 * GUESS_THE_MODES and ROUND_MODES, and in the records constraint.
 */
type PromptSet<M extends RoundModeId> = {
  ids: readonly string[];
  prompt(id: string): RoundPrompt[M] | null;
  reveal(id: string, guess: unknown): RoundResult[M] | null;
};

const SETS: { [M in RoundModeId]: PromptSet<M> } = {
  flag: {
    ids: FLAG_IDS,
    prompt: flagPrompt,
    reveal: (id, guess) => {
      const parsed = roundGuessSchema.flag.safeParse(guess);
      return parsed.success ? revealFlag(id, parsed.data) : null;
    },
  },
  size: {
    ids: SIZE_IDS,
    prompt: sizePrompt,
    reveal: (id, guess) => {
      const parsed = roundGuessSchema.size.safeParse(guess);
      return parsed.success ? revealSize(id, parsed.data) : null;
    },
  },
  price: {
    ids: PRICE_IDS,
    prompt: pricePrompt,
    reveal: (id, guess) => {
      const parsed = roundGuessSchema.price.safeParse(guess);
      return parsed.success ? revealPrice(id, parsed.data) : null;
    },
  },
};

export const roundIds = (mode: RoundModeId) => SETS[mode].ids;

/** A fresh round: prompts not played recently first, topped up from the rest, in a random order. */
export function dealRound<M extends RoundModeId>(mode: M, recent: readonly string[], random: () => number = Math.random): RoundPrompt[M][] {
  const set = SETS[mode] as PromptSet<M>;
  const shuffle = (list: readonly string[]) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const fresh = shuffle(set.ids.filter((id) => !recent.includes(id)));
  const stale = shuffle(set.ids.filter((id) => recent.includes(id)));
  return [...fresh, ...stale].slice(0, ROUND_SIZE[mode]).map((id) => set.prompt(id)!);
}

/** Reveals one prompt; null for an unknown prompt or a guess of the wrong kind. */
export function revealPrompt<M extends RoundModeId>(mode: M, id: string, guess: unknown): RoundResult[M] | null {
  return (SETS[mode] as PromptSet<M>).reveal(id, guess);
}

/**
 * Re-scores a whole round on the server: exactly one guess for each of a full round of different prompts. The flag
 * round adds up its points (10 flags × 10); the others average their prompts' scores.
 */
export function scoreRound<M extends RoundModeId>(mode: M, answers: readonly { id: string; guess: unknown }[]): { score: number; results: RoundResult[M][] } | "invalid" {
  if (answers.length !== ROUND_SIZE[mode] || new Set(answers.map((answer) => answer.id)).size !== answers.length) return "invalid";
  const results: RoundResult[M][] = [];
  for (const answer of answers) {
    const result = revealPrompt(mode, answer.id, answer.guess);
    if (!result) return "invalid";
    results.push(result);
  }
  const total = results.reduce((sum, result) => sum + result.score, 0);
  const score = mode === "flag" ? total : Math.round(total / results.length);
  return { score: Math.max(0, Math.min(100, score)), results };
}
