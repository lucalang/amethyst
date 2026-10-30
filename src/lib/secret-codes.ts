import { createHash, randomInt } from "node:crypto";

/**
 * Secret code helpers shared by the redeem API and the operator script (`npm run codes`). Codes are
 * never stored or logged: the database only ever sees `hashCode(normalizeCode(code))`.
 */

/** Letters and digits that can't be mistaken for one another (no 0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Case, spaces, dashes, underscores and dots don't matter: "abcd-efgh" and "ABCD EFGH" are the same code. */
export function normalizeCode(input: string): string | null {
  const code = input.normalize("NFKC").toUpperCase().replace(/[\s._-]+/g, "");
  return /^[A-Z0-9]{4,40}$/.test(code) ? code : null;
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
