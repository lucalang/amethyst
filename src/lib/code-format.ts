/**
 * How Vault codes are normalized (see secret-codes.ts for hashing). Kept free of server-only imports so
 * the admin code builder can check a phrase exactly the way the server will before publishing it.
 */

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
