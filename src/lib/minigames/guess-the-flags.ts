import "server-only";
import { FLAG_POINTS, type FlagPrompt, type FlagResult } from "./guess-the";
import { FLAG_ART } from "./guess-the-flag-art";

/**
 * Guess the Flag's countries. The pool leaves out flags that are near-identical to another country's (Chad next to
 * Romania, Monaco next to Indonesia, Luxembourg, Côte d'Ivoire, New Zealand, Latvia) and flags that changed recently
 * (Syria, 2025), so every prompt has one fair answer. Names are the usual English short names; aliases are other
 * recognised names for the same country, never a demonym or a part of the country (so "England" isn't the UK).
 */
type Country = { code: string; name: string; aliases?: readonly string[] };

const COUNTRIES: readonly Country[] = [
  { code: "am", name: "Armenia", aliases: ["Hayastan"] },
  { code: "ar", name: "Argentina" },
  { code: "at", name: "Austria", aliases: ["Österreich"] },
  { code: "au", name: "Australia" },
  { code: "ba", name: "Bosnia and Herzegovina", aliases: ["Bosnia", "Bosnia & Herzegovina", "Bosnia-Herzegovina", "BiH"] },
  { code: "bd", name: "Bangladesh" },
  { code: "be", name: "Belgium", aliases: ["België", "Belgique"] },
  { code: "br", name: "Brazil", aliases: ["Brasil"] },
  { code: "bs", name: "Bahamas", aliases: ["The Bahamas"] },
  { code: "ca", name: "Canada" },
  { code: "ch", name: "Switzerland", aliases: ["Schweiz", "Suisse", "Svizzera", "Swiss Confederation"] },
  { code: "cl", name: "Chile" },
  { code: "cn", name: "China", aliases: ["People's Republic of China", "PRC"] },
  { code: "co", name: "Colombia" },
  { code: "cu", name: "Cuba" },
  { code: "cz", name: "Czechia", aliases: ["Czech Republic", "Česko"] },
  { code: "de", name: "Germany", aliases: ["Deutschland"] },
  { code: "dk", name: "Denmark", aliases: ["Danmark"] },
  { code: "dz", name: "Algeria" },
  { code: "eg", name: "Egypt" },
  { code: "es", name: "Spain", aliases: ["España"] },
  { code: "et", name: "Ethiopia" },
  { code: "fi", name: "Finland", aliases: ["Suomi"] },
  { code: "fr", name: "France" },
  { code: "gb", name: "United Kingdom", aliases: ["UK", "U.K.", "Great Britain", "Britain", "United Kingdom of Great Britain and Northern Ireland"] },
  { code: "ge", name: "Georgia", aliases: ["Sakartvelo"] },
  { code: "gh", name: "Ghana" },
  { code: "gr", name: "Greece", aliases: ["Hellas", "Ellada"] },
  { code: "hu", name: "Hungary", aliases: ["Magyarország"] },
  { code: "id", name: "Indonesia" },
  { code: "ie", name: "Ireland", aliases: ["Republic of Ireland", "Éire", "Eire"] },
  { code: "il", name: "Israel" },
  { code: "in", name: "India", aliases: ["Bharat"] },
  { code: "iq", name: "Iraq" },
  { code: "ir", name: "Iran", aliases: ["Persia"] },
  { code: "is", name: "Iceland", aliases: ["Ísland"] },
  { code: "it", name: "Italy", aliases: ["Italia"] },
  { code: "jm", name: "Jamaica" },
  { code: "jo", name: "Jordan" },
  { code: "jp", name: "Japan", aliases: ["Nippon", "Nihon"] },
  { code: "ke", name: "Kenya" },
  { code: "kh", name: "Cambodia", aliases: ["Kampuchea"] },
  { code: "kr", name: "South Korea", aliases: ["Korea", "Republic of Korea"] },
  { code: "kz", name: "Kazakhstan", aliases: ["Kazakstan"] },
  { code: "la", name: "Laos", aliases: ["Lao PDR"] },
  { code: "lb", name: "Lebanon" },
  { code: "lk", name: "Sri Lanka" },
  { code: "lt", name: "Lithuania", aliases: ["Lietuva"] },
  { code: "ma", name: "Morocco" },
  { code: "mk", name: "North Macedonia", aliases: ["Macedonia"] },
  { code: "mn", name: "Mongolia" },
  { code: "mx", name: "Mexico", aliases: ["México"] },
  { code: "my", name: "Malaysia" },
  { code: "ng", name: "Nigeria" },
  { code: "nl", name: "Netherlands", aliases: ["The Netherlands", "Holland", "Nederland"] },
  { code: "no", name: "Norway", aliases: ["Norge"] },
  { code: "np", name: "Nepal" },
  { code: "pa", name: "Panama" },
  { code: "pe", name: "Peru" },
  { code: "ph", name: "Philippines" },
  { code: "pk", name: "Pakistan" },
  { code: "pl", name: "Poland", aliases: ["Polska"] },
  { code: "pt", name: "Portugal" },
  { code: "qa", name: "Qatar" },
  { code: "ro", name: "Romania", aliases: ["România"] },
  { code: "ru", name: "Russia", aliases: ["Russian Federation"] },
  { code: "sa", name: "Saudi Arabia" },
  { code: "sc", name: "Seychelles" },
  { code: "se", name: "Sweden", aliases: ["Sverige"] },
  { code: "sg", name: "Singapore" },
  { code: "sk", name: "Slovakia", aliases: ["Slovak Republic"] },
  { code: "tn", name: "Tunisia" },
  { code: "tr", name: "Turkey", aliases: ["Türkiye", "Turkiye"] },
  { code: "tz", name: "Tanzania" },
  { code: "ua", name: "Ukraine" },
  { code: "us", name: "United States", aliases: ["USA", "U.S.A.", "US", "U.S.", "America", "United States of America"] },
  { code: "uy", name: "Uruguay" },
  { code: "uz", name: "Uzbekistan" },
  { code: "vn", name: "Vietnam", aliases: ["Viet Nam"] },
  { code: "za", name: "South Africa", aliases: ["RSA"] },
  { code: "zw", name: "Zimbabwe" },
];

/** Lowercase, no accents or punctuation, "&" as "and", without a leading "the" or "republic of". */
export function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/** Optimal string alignment distance (typos, missing or extra letters, swapped neighbours). */
export function editDistance(a: string, b: string) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Typos allowed for a name of this length: none for short names, where one letter often makes another country. */
const tolerance = (length: number) => (length <= 4 ? 0 : length <= 8 ? 1 : 2);

/**
 * Every recognised country or territory name, so a guess that names (or nearly names) a different place is never
 * read as a typo for the right one: "Niger" isn't Nigeria, "Iraq" isn't Iran, "Austria" isn't Australia.
 */
const OTHER_NAMES: ReadonlyMap<string, string> = (() => {
  const names = new Map<string, string>();
  const display = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      const name = display.of(code);
      if (name) names.set(normalizeName(name), code.toLowerCase());
    }
  }
  for (const country of COUNTRIES) for (const name of [country.name, ...(country.aliases ?? [])]) names.set(normalizeName(name), country.code);
  // Commonly typed names that don't match a display name exactly.
  for (const [name, code] of [
    ["england", "gb-eng"],
    ["scotland", "gb-sct"],
    ["wales", "gb-wls"],
    ["northern ireland", "gb-nir"],
    ["north korea", "kp"],
    ["congo", "cg"],
    ["ivory coast", "ci"],
  ] as const)
    names.set(name, code);
  return names;
})();

type Entry = Country & { id: string; keys: readonly string[] };

/** Opaque prompt ids, so the request for a flag never names the country. */
function opaqueId(code: string) {
  let h = 0x811c9dc5;
  for (const char of `amethyst-flag:${code}`) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return `f${(h >>> 0).toString(36)}`;
}

const ENTRIES: readonly Entry[] = COUNTRIES.filter((country) => FLAG_ART[country.code]).map((country) => ({
  ...country,
  id: opaqueId(country.code),
  keys: [country.name, ...(country.aliases ?? [])].map(normalizeName),
}));
const BY_ID = new Map(ENTRIES.map((entry) => [entry.id, entry]));
export const FLAG_IDS = ENTRIES.map((entry) => entry.id);

export function flagPrompt(id: string): FlagPrompt | null {
  const entry = BY_ID.get(id);
  return entry ? { id, image: FLAG_ART[entry.code] } : null;
}

/**
 * Whether a typed name is this country: an exact name or alias (accents, case, punctuation and "the" ignored), or
 * a close spelling of one, as long as it isn't as close to any other country's name.
 */
export function matchCountry(entry: { code: string; keys: readonly string[] }, typed: string): { correct: boolean; matched: string | null } {
  const guess = normalizeName(typed);
  if (!guess) return { correct: false, matched: null };
  if (entry.keys.includes(guess)) return { correct: true, matched: null };
  const named = OTHER_NAMES.get(guess);
  if (named && named !== entry.code) return { correct: false, matched: null };
  let best = Infinity;
  let bestKey = "";
  for (const key of entry.keys) {
    const distance = editDistance(guess, key);
    if (distance < best) {
      best = distance;
      bestKey = key;
    }
  }
  if (best > tolerance(bestKey.length)) return { correct: false, matched: null };
  for (const [name, code] of OTHER_NAMES) {
    if (code === entry.code) continue;
    if (Math.abs(name.length - guess.length) > best) continue;
    if (editDistance(guess, name) <= best) return { correct: false, matched: null };
  }
  return { correct: true, matched: bestKey };
}

export function revealFlag(id: string, typed: string): FlagResult | null {
  const entry = BY_ID.get(id);
  if (!entry) return null;
  const { correct, matched } = matchCountry(entry, typed);
  const shown = matched ? ([entry.name, ...(entry.aliases ?? [])].find((name) => normalizeName(name) === matched) ?? entry.name) : null;
  return { correct, answer: entry.name, matched: correct && shown ? shown : null, score: correct ? FLAG_POINTS : 0 };
}
