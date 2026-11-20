/**
 * The Ascent: reverse rare-answer play. Seven questions; for each, give the answer you think MOST people would give.
 * The more common it is, the higher the beanstalk grows.
 *
 * It shares The Descent's question bank and answer matching (lib/minigames/blank-atlas.ts) without changing them:
 * the same 30 everyday questions, aliases, plural and typo tolerance, and explained near-misses.
 *
 * Commonness is a curated model, not measured data. No public dataset records how often people give each answer to
 * these prompts, so every accepted answer is placed by hand in one of four groups by how readily people think of it.
 * The "crowd favourite" is the answer listed first in the most-common group: Amethyst's pick for the single most
 * common answer. The game says so wherever commonness is shown and never shows a percentage of players.
 */

import { STOPS, newRound, questionById, type Round, type Stop, type Tier } from "./blank-atlas";

export { STOPS, judge, questionById } from "./blank-atlas";
export type { Round, Stop, Tier } from "./blank-atlas";

export const ASCENT_GAME = "the-ascent";

/** How an answer grows the beanstalk, from the crowd favourite down to a rare answer. */
export type Growth = "giant" | "sprout" | "vine" | "shoot" | "bud";

export const GROWTHS: Record<Growth, { name: string; commonness: string; points: number; level: number; blurb: string; motion: string; mark: string }> = {
  giant: { name: "Giant’s Leap", commonness: "Crowd favourite", points: 100, level: 5, blurb: "Our pick for the answer most people give.", motion: "a towering surge of golden growth", mark: "🟨" },
  sprout: { name: "Sky Sprout", commonness: "Very common", points: 80, level: 4, blurb: "One of the first answers on everyone’s lips.", motion: "a big, bounding climb", mark: "🟩" },
  vine: { name: "Steady Vine", commonness: "Common", points: 50, level: 3, blurb: "Plenty of people would say that.", motion: "a steady climb", mark: "🟦" },
  shoot: { name: "Little Shoot", commonness: "Uncommon", points: 20, level: 2, blurb: "Correct, but fewer people reach for it.", motion: "a small shoot", mark: "🟪" },
  bud: { name: "Tiny Bud", commonness: "Rare", points: 5, level: 1, blurb: "A real answer, but hardly anyone says it.", motion: "barely a bud", mark: "⬜" },
};
export const GROWTH_ORDER: Growth[] = ["bud", "shoot", "vine", "sprout", "giant"];
export const MISS_MARK = "⬛";

/** Every point grows the beanstalk 10 metres, so a perfect climb reaches 7,000 m. */
export const METRES_PER_POINT = 10;
export const MAX_SCORE = STOPS * GROWTHS.giant.points;
export const PREVIEW_MS = 3000;
export const ANSWER_MS = 25_000;

const TIER_GROWTH: Record<Tier, Growth> = { 1: "sprout", 2: "vine", 3: "shoot", 4: "bud" };

/** The crowd favourite: the first answer listed in a question's most-common group. */
export function favouriteOf(questionId: string) {
  return questionById(questionId)?.answers.find((answer) => answer.tier === 1)?.name ?? null;
}

export function growthOf(questionId: string, answer: string | null, tier: Tier | null): Growth | null {
  if (answer === null || tier === null) return null;
  if (answer === favouriteOf(questionId)) return "giant";
  return TIER_GROWTH[tier];
}
export const pointsFor = (questionId: string, answer: string | null, tier: Tier | null) => {
  const growth = growthOf(questionId, answer, tier);
  return growth ? GROWTHS[growth].points : 0;
};

/** The five zones of the climb, by height in metres; a round's verdict is the zone it reached. */
export const ZONES: { m: number; name: string; verdict: string }[] = [
  { m: 0, name: "The Cottage Garden", verdict: "Still among the cabbages of the Cottage Garden. The crowd wasn’t with you this time." },
  { m: 800, name: "The Whispering Canopy", verdict: "Up into the Whispering Canopy, where owls nest in leaves the size of sails." },
  { m: 2200, name: "The Cloud Meadows", verdict: "Above the Cloud Meadows, where the sheep are made of weather." },
  { m: 4000, name: "The High Winds", verdict: "Into the High Winds, past airships and the daytime moon." },
  { m: 5600, name: "The Giant’s Kingdom", verdict: "The Giant’s Kingdom. You climbed close enough to hear the golden harp play." },
];
export const zoneAt = (metres: number) => [...ZONES].reverse().find((zone) => metres >= zone.m) ?? ZONES[0];

export const roundScore = (round: Round) => round.stops.reduce((sum, stop) => sum + stop.points, 0);

/** A fresh round of seven questions, avoiding the last round's where possible. */
export const newAscent = (avoid: readonly string[] = []) => newRound(avoid);

/** A saved round, re-scored under The Ascent's rules; null when it is missing or no longer valid. */
export function restoreAscent(raw: unknown): Round | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<Round>;
  if (typeof value.id !== "string" || !Array.isArray(value.questions) || !Array.isArray(value.stops)) return null;
  if (value.questions.length !== STOPS || value.questions.some((id) => typeof id !== "string" || !questionById(id))) return null;
  if (value.stops.length > STOPS) return null;
  const stops: Stop[] = [];
  for (const [index, stop] of value.stops.entries()) {
    if (!stop || stop.question !== value.questions[index]) return null;
    const question = questionById(stop.question)!;
    const answer = stop.answer === null ? null : (question.answers.find((entry) => entry.name === stop.answer) ?? null);
    if (stop.answer !== null && !answer) return null;
    stops.push({
      question: stop.question,
      input: String(stop.input ?? "").slice(0, 80),
      answer: answer?.name ?? null,
      tier: answer?.tier ?? null,
      // Re-scored here, so a saved round can never claim more than its answer is worth.
      points: pointsFor(stop.question, answer?.name ?? null, answer?.tier ?? null),
      timedOut: answer ? undefined : Boolean(stop.timedOut) || undefined,
    });
  }
  return { id: value.id, questions: value.questions, stops, startedAt: typeof value.startedAt === "number" ? value.startedAt : Date.now() };
}

export function shareText(round: Round) {
  const score = roundScore(round);
  const marks = round.stops.map((stop) => {
    const growth = growthOf(stop.question, stop.answer, stop.tier);
    return growth ? GROWTHS[growth].mark : MISS_MARK;
  });
  return `The Ascent · ${score}/${MAX_SCORE} · ${(score * METRES_PER_POINT).toLocaleString("en")} m\n${marks.join("")}\n${zoneAt(score * METRES_PER_POINT).name}`;
}
