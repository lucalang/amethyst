import { createHash, randomInt } from "node:crypto";

/**
 * Secret code helpers shared by the redeem API and the operator script (`npm run codes`). Codes are
 * never stored or logged: the database only sees SHA-256 hashes of their normalized forms.
 *
 * Each code has one of two formats, fixed when it's created:
 * - phrase (chosen words such as "OPEN THE VAULT"): letter case doesn't matter, surrounding spaces are
 *   trimmed and runs of spaces count as one. Letters, numbers and spaces, 4–64 characters.
 * - compact (random codes and every code made before phrases): only letters and numbers count, so
 *   "k7qm-3xrp" and "K7QM 3XRP" are the same code.
 * Every code also stores its compact hash, which is unique: two codes never differ only in case,
 * spacing or punctuation, and whatever is typed matches at most one code.
 */

/** Letters and digits that can't be mistaken for one another (no 0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const CODE_LENGTH = { min: 4, max: 64 } as const;
export const CODE_RULES = "Codes are 4 to 64 letters, numbers and spaces.";

const fold = (input: string) => input.normalize("NFKC").toUpperCase();
const fits = (value: string, pattern: RegExp) => {
  const length = [...value].length;
  return length >= CODE_LENGTH.min && length <= CODE_LENGTH.max && pattern.test(value);
};

/** "  open   the vault " → "OPEN THE VAULT"; null unless it's words of letters and numbers. */
export function normalizePhrase(input: string): string | null {
  const phrase = fold(input).trim().replace(/\s+/g, " ");
  return fits(phrase, /^[\p{L}\p{M}\p{N}]+(?: [\p{L}\p{M}\p{N}]+)*$/u) ? phrase : null;
}

/** "k7qm-3xrp" → "K7QM3XRP": spaces, dashes, dots and underscores dropped (the original normalization). */
export function compactCode(input: string): string | null {
  const code = fold(input).replace(/[\s._-]+/g, "");
  return fits(code, /^[\p{L}\p{M}\p{N}]+$/u) ? code : null;
}

/** The hashes the database compares for a typed code, or null when it can't be any code. */
export function typedCodeHashes(input: string): { loose: string; phrase: string | null } | null {
  const compact = compactCode(input);
  if (!compact) return null;
  const phrase = normalizePhrase(input);
  return { loose: hashCode(compact), phrase: phrase ? hashCode(phrase) : null };
}

/** The SHA-256 of a normalized code as lowercase hex: the only form the database stores or compares. */
export function hashCode(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** A random code such as "K7QM-3XRP-W9TD-HN4C" (16 characters, about 79 bits of randomness). */
export function generateCode(): string {
  const chars = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return [0, 4, 8, 12].map((start) => chars.slice(start, start + 4).join("")).join("-");
}
