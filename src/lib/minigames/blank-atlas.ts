/**
 * The Descent (game id "blank-atlas", kept so records and saved rounds carry over): seven questions per round,
 * each a dive deeper into the fog. Any correct answer counts; rarer correct answers score more and dive harder.
 *
 * Rarity is a curated model, not measured data. No public dataset records how often people give each answer to
 * these prompts, so every answer is placed by hand in one of four tiers by how readily people tend to think of
 * it. The game says so wherever rarity is shown, and never presents a tier as a percentage of players.
 *
 * Every question has a closed, complete set of correct answers (countries on a border, the noble gases, the
 * Apollo moonwalkers…), so a correct answer is never rejected for being missing from the list.
 */

export const BLANK_ATLAS_GAME = "blank-atlas";
export const STOPS = 7;

/** 1 = Familiar, 2 = Uncommon, 3 = Rare, 4 = Exceptional (the curated rarity tiers; points per tier). */
export type Tier = 1 | 2 | 3 | 4;

export const TIERS: Record<Tier, { name: string; points: number; blurb: string }> = {
  1: { name: "Familiar", points: 10, blurb: "an answer most people reach for first" },
  2: { name: "Uncommon", points: 35, blurb: "a solid answer that fewer people think of" },
  3: { name: "Rare", points: 70, blurb: "an answer few people come up with" },
  4: { name: "Exceptional", points: 100, blurb: "an answer almost nobody thinks of" },
};

/**
 * How hard an answer dives. The first four follow the tiers one to one. "Extraordinary" is an Exceptional
 * answer that stands alone in its question's rarest tier (Luxembourg, Oganesson, Hestia…): read straight from
 * the answer list, worth the same 100 points, it just plunges harder.
 */
export type Dive = "familiar" | "uncommon" | "rare" | "exceptional" | "extraordinary";
export const DIVES: Record<Dive, { name: string; motion: string; level: number }> = {
  familiar: { name: "Familiar", motion: "a short, gentle descent", level: 1 },
  uncommon: { name: "Uncommon", motion: "a deeper glide with a trail of light", level: 2 },
  rare: { name: "Rare", motion: "a fast plunge as the fog parts", level: 3 },
  exceptional: { name: "Exceptional", motion: "a forceful dive with rippling light", level: 4 },
  extraordinary: { name: "Extraordinary", motion: "a dramatic plunge through the fog", level: 5 },
};
export const MAX_SCORE = STOPS * TIERS[4].points;

/**
 * One question. `tiers[n]` lists the answers of tier n + 1; each answer is "Canonical|alias|alias". `misses`
 * explains tempting answers that aren't correct (keys are written like answers, values are shown to the player).
 */
type QuestionSource = {
  id: string;
  prompt: string;
  /** A short clarification under the prompt. */
  note?: string;
  tiers: [string[], string[], string[], string[]];
  misses?: Record<string, string>;
  /** Exact answers only: no spelling tolerance (numbers, where one letter can make a different, wrong answer). */
  strict?: boolean;
};

const SOURCES: QuestionSource[] = [
  {
    id: "germany-borders",
    prompt: "Name a country that shares a land border with Germany.",
    tiers: [
      ["France", "Austria", "Poland", "Switzerland"],
      ["Netherlands|the netherlands|holland", "Belgium", "Denmark"],
      ["Czechia|czech republic|czech"],
      ["Luxembourg|luxemburg"],
    ],
    misses: { italy: "Italy doesn't touch Germany; Austria and Switzerland sit in between.", hungary: "Hungary doesn't border Germany." },
  },
  {
    id: "planets",
    prompt: "Name a planet or dwarf planet in our solar system.",
    note: "The eight planets and the five recognised dwarf planets.",
    tiers: [
      ["Mars", "Jupiter", "Saturn", "Earth"],
      ["Venus", "Mercury", "Neptune", "Uranus", "Pluto"],
      ["Ceres", "Eris"],
      ["Haumea", "Makemake"],
    ],
    misses: { sun: "The Sun is a star.", moon: "The Moon is a moon, not a planet.", sedna: "Sedna isn't a recognised dwarf planet (yet)." },
  },
  {
    id: "noble-gases",
    prompt: "Name a noble gas.",
    tiers: [["Helium", "Neon"], ["Argon"], ["Krypton", "Xenon", "Radon"], ["Oganesson"]],
    misses: { hydrogen: "Hydrogen is reactive, so it isn't a noble gas.", nitrogen: "Nitrogen isn't a noble gas." },
  },
  {
    id: "greek-letters",
    prompt: "Name a letter of the Greek alphabet.",
    tiers: [
      ["Alpha", "Beta", "Gamma", "Delta", "Omega", "Pi"],
      ["Sigma", "Theta", "Lambda", "Epsilon", "Mu", "Zeta"],
      ["Eta", "Iota", "Kappa", "Rho", "Tau", "Phi", "Chi", "Psi"],
      ["Nu", "Xi", "Omicron", "Upsilon"],
    ],
  },
  {
    id: "south-america",
    prompt: "Name a country in South America.",
    tiers: [
      ["Brazil", "Argentina", "Chile", "Peru", "Colombia"],
      ["Venezuela", "Bolivia", "Ecuador", "Uruguay"],
      ["Paraguay"],
      ["Guyana", "Suriname|surinam"],
    ],
    misses: {
      "french guiana": "French Guiana is part of France, not a country of its own.",
      panama: "Panama is in Central America.",
      mexico: "Mexico is in North America.",
      "falkland islands": "The Falkland Islands are a British overseas territory, not a country.",
    },
  },
  {
    id: "china-borders",
    prompt: "Name a country that shares a land border with China.",
    tiers: [
      ["Russia", "India", "Mongolia", "North Korea|dprk"],
      ["Vietnam|viet nam", "Pakistan", "Nepal", "Kazakhstan"],
      ["Laos", "Myanmar|burma", "Afghanistan", "Bhutan"],
      ["Kyrgyzstan|kirgizstan|kyrgyz republic", "Tajikistan"],
    ],
    misses: { "south korea": "South Korea doesn't border China; North Korea does.", japan: "Japan is across the sea from China.", thailand: "Thailand doesn't quite reach China; Laos and Myanmar sit between them." },
  },
  {
    id: "shakespeare",
    prompt: "Name a play by William Shakespeare.",
    tiers: [
      ["Hamlet", "Romeo and Juliet|romeo & juliet", "Macbeth", "Othello", "King Lear", "A Midsummer Night's Dream|midsummer nights dream"],
      ["Much Ado About Nothing", "The Tempest", "Julius Caesar", "Twelfth Night", "The Merchant of Venice", "The Taming of the Shrew"],
      [
        "As You Like It",
        "Richard III|richard 3|richard the third",
        "Henry V|henry 5|henry the fifth",
        "Antony and Cleopatra",
        "The Winter's Tale",
        "Coriolanus",
        "Titus Andronicus",
        "Measure for Measure",
        "The Comedy of Errors",
        "Richard II|richard 2|richard the second",
        "Henry IV|henry 4|henry the fourth",
        "The Merry Wives of Windsor",
      ],
      [
        "Timon of Athens",
        "Pericles|pericles prince of tyre",
        "Cymbeline",
        "Troilus and Cressida",
        "All's Well That Ends Well",
        "Love's Labour's Lost|loves labors lost",
        "The Two Gentlemen of Verona",
        "King John",
        "Henry VI|henry 6|henry the sixth",
        "Henry VIII|henry 8|henry the eighth",
        "The Two Noble Kinsmen",
      ],
    ],
    misses: { "doctor faustus": "Doctor Faustus is by Christopher Marlowe." },
  },
  {
    id: "seven-wonders",
    prompt: "Name one of the Seven Wonders of the Ancient World.",
    tiers: [
      ["Great Pyramid of Giza|pyramids of giza|pyramid of giza|great pyramid|pyramids|the pyramids", "Hanging Gardens of Babylon|hanging gardens"],
      ["Colossus of Rhodes|colossus", "Lighthouse of Alexandria|pharos of alexandria|pharos|lighthouse"],
      ["Statue of Zeus at Olympia|statue of zeus", "Temple of Artemis at Ephesus|temple of artemis"],
      ["Mausoleum at Halicarnassus|mausoleum of halicarnassus|mausoleum|tomb of mausolus"],
    ],
    misses: { "great wall of china": "The Great Wall is on modern wonder lists, not the ancient seven.", colosseum: "The Colosseum is on modern lists, not the ancient seven.", "machu picchu": "Machu Picchu is on modern lists, not the ancient seven." },
  },
  {
    id: "olympians",
    prompt: "Name a Greek god or goddess of Mount Olympus.",
    note: "The Twelve Olympians, with Hades and Hestia welcome too.",
    tiers: [
      ["Zeus", "Poseidon", "Athena|athene", "Apollo", "Aphrodite", "Hades"],
      ["Hera", "Ares", "Hermes", "Artemis", "Dionysus|dionysos"],
      ["Demeter", "Hephaestus|hephaistos"],
      ["Hestia"],
    ],
    misses: { jupiter: "Jupiter is Zeus's Roman counterpart; this stop wants the Greek names.", mars: "Mars is Roman; the Greek god is Ares.", venus: "Venus is Roman; the Greek goddess is Aphrodite.", hercules: "Heracles was a hero who joined Olympus late; he isn't one of the Olympians here." },
  },
  {
    id: "moonwalkers",
    prompt: "Name an astronaut who walked on the Moon.",
    note: "Surnames are enough.",
    tiers: [
      ["Neil Armstrong|armstrong", "Buzz Aldrin|aldrin|edwin aldrin|buzz"],
      ["Alan Shepard|shepard"],
      ["Pete Conrad|conrad|charles conrad", "Gene Cernan|cernan|eugene cernan", "Harrison Schmitt|schmitt|jack schmitt", "John Young|young", "David Scott|scott|dave scott"],
      ["Alan Bean|bean", "Edgar Mitchell|mitchell", "James Irwin|irwin|jim irwin", "Charlie Duke|duke|charles duke"],
    ],
    misses: { "michael collins": "Michael Collins flew Apollo 11 but stayed in orbit.", collins: "Michael Collins flew Apollo 11 but stayed in orbit.", "yuri gagarin": "Yuri Gagarin was the first person in space, not on the Moon.", gagarin: "Yuri Gagarin was the first person in space, not on the Moon." },
  },
  {
    id: "moons",
    prompt: "Name a moon in our solar system, other than Earth's Moon.",
    tiers: [
      ["Titan", "Europa", "Io", "Ganymede"],
      ["Phobos", "Callisto", "Triton", "Charon", "Enceladus"],
      ["Deimos", "Miranda", "Titania", "Oberon", "Mimas", "Rhea"],
      ["Iapetus", "Dione", "Tethys", "Hyperion", "Phoebe", "Ariel", "Umbriel", "Nereid", "Proteus", "Amalthea", "Nix", "Hydra"],
    ],
    misses: { moon: "Earth's own Moon is the one moon that doesn't count here.", luna: "Earth's own Moon is the one moon that doesn't count here." },
  },
  {
    id: "one-letter-elements",
    prompt: "Name a chemical element whose symbol is a single letter.",
    note: "The element's name or its symbol both work.",
    tiers: [
      ["Hydrogen|h", "Oxygen|o", "Carbon|c", "Nitrogen|n"],
      ["Sulfur|sulphur|s", "Potassium|k", "Iodine|i", "Fluorine|f", "Phosphorus|p", "Uranium|u"],
      ["Boron|b", "Tungsten|w|wolfram"],
      ["Vanadium|v", "Yttrium|y"],
    ],
    misses: { helium: "Helium's symbol is He.", iron: "Iron's symbol is Fe.", sodium: "Sodium's symbol is Na.", calcium: "Calcium's symbol is Ca." },
  },
  {
    id: "zodiac",
    prompt: "Name a sign of the Western zodiac.",
    tiers: [["Leo", "Aries", "Gemini", "Scorpio", "Virgo", "Taurus"], ["Cancer", "Libra", "Pisces", "Sagittarius", "Capricorn"], ["Aquarius"], []],
    misses: { ophiuchus: "Ophiuchus is a constellation, but not one of the twelve signs." },
  },
  {
    id: "clouds",
    prompt: "Name one of the ten main cloud types.",
    note: "The ten cloud genera meteorologists use.",
    tiers: [["Cumulus", "Cirrus", "Stratus"], ["Cumulonimbus", "Nimbostratus"], ["Altocumulus", "Stratocumulus", "Cirrostratus"], ["Altostratus", "Cirrocumulus"]],
    misses: { nimbus: "Nimbus on its own isn't one of the ten; try nimbostratus or cumulonimbus.", mammatus: "Mammatus is a cloud feature, not one of the ten main types." },
  },
  {
    id: "france-borders",
    prompt: "Name a country that shares a land border with France.",
    note: "Borders of France's overseas regions count too.",
    tiers: [
      ["Spain", "Italy", "Germany", "Belgium", "Switzerland"],
      ["Luxembourg|luxemburg", "Monaco", "Andorra"],
      ["Brazil"],
      ["Suriname|surinam", "Netherlands|the netherlands|holland"],
    ],
    misses: { "united kingdom": "France and the UK are joined by a tunnel, not a land border.", uk: "France and the UK are joined by a tunnel, not a land border.", portugal: "Spain sits between France and Portugal." },
  },
  {
    id: "primes",
    prompt: "Name a prime number below 50.",
    note: "Digits or words both work.",
    strict: true,
    tiers: [
      ["2|two", "3|three", "5|five", "7|seven", "11|eleven", "13|thirteen"],
      ["17|seventeen", "19|nineteen", "23|twenty three|twentythree"],
      ["29|twenty nine", "31|thirty one", "37|thirty seven"],
      ["41|forty one", "43|forty three", "47|forty seven"],
    ],
    misses: { "1": "1 isn't prime: a prime needs exactly two divisors.", one: "1 isn't prime: a prime needs exactly two divisors.", "9": "9 is 3 × 3.", "27": "27 is 3 × 9.", "39": "39 is 3 × 13.", "49": "49 is 7 × 7.", "51": "51 is 3 × 17, and above 50 anyway." },
  },
  {
    id: "stans",
    prompt: "Name a country whose name ends in “-stan”.",
    tiers: [["Pakistan", "Afghanistan", "Kazakhstan"], ["Uzbekistan"], ["Turkmenistan", "Tajikistan"], ["Kyrgyzstan|kirgizstan"]],
    misses: { kurdistan: "Kurdistan is a region, not a sovereign country.", tatarstan: "Tatarstan is a republic within Russia.", balochistan: "Balochistan is a province, not a country." },
  },
  {
    id: "great-lakes",
    prompt: "Name one of the Great Lakes of North America.",
    tiers: [["Superior|lake superior", "Michigan|lake michigan"], ["Erie|lake erie", "Huron|lake huron"], ["Ontario|lake ontario"], []],
    misses: { "lake champlain": "Lake Champlain isn't one of the five Great Lakes.", "great salt lake": "The Great Salt Lake is in Utah, not one of the five." },
  },
  {
    id: "us-canada",
    prompt: "Name a US state that borders Canada.",
    note: "Borders across the Great Lakes count.",
    tiers: [
      ["Alaska", "Washington|washington state", "Montana", "Michigan", "Maine", "New York|new york state"],
      ["Minnesota", "North Dakota", "Vermont", "Idaho", "New Hampshire"],
      ["Ohio", "Pennsylvania"],
      [],
    ],
    misses: { "south dakota": "South Dakota stops short of Canada; North Dakota is in between.", wisconsin: "Wisconsin's lakeshore faces Michigan, not Canada.", massachusetts: "Massachusetts doesn't reach Canada." },
  },
  {
    id: "mediterranean",
    prompt: "Name a country with a coastline on the Mediterranean Sea.",
    note: "Its arms, like the Adriatic and Aegean, count.",
    tiers: [
      ["Italy", "Spain", "Greece", "France", "Turkey|turkiye", "Egypt"],
      ["Croatia", "Israel", "Morocco", "Tunisia", "Cyprus", "Malta", "Libya", "Lebanon", "Algeria"],
      ["Albania", "Montenegro", "Syria", "Monaco", "Slovenia"],
      ["Bosnia and Herzegovina|bosnia|bosnia herzegovina", "Palestine|gaza", "United Kingdom|uk|britain|great britain|gibraltar"],
    ],
    misses: { portugal: "Portugal faces the Atlantic only.", jordan: "Jordan reaches the Red Sea, not the Mediterranean." },
  },
  {
    id: "world-cup",
    prompt: "Name a country that has won the men's FIFA World Cup.",
    tiers: [["Brazil", "Germany|west germany", "Argentina", "France", "Italy"], ["Spain", "England"], ["Uruguay"], []],
    misses: { netherlands: "The Netherlands have reached three finals but never won.", "united kingdom": "Only England has won; the UK doesn't play as one team.", uk: "Only England has won; the UK doesn't play as one team." },
  },
  {
    id: "central-america",
    prompt: "Name a country in Central America.",
    tiers: [["Costa Rica", "Panama", "Guatemala"], ["Honduras", "Nicaragua", "El Salvador|salvador"], ["Belize"], []],
    misses: { mexico: "Mexico is usually counted as North America, not Central America.", cuba: "Cuba is in the Caribbean." },
  },
  {
    id: "orchestra",
    prompt: "Name an instrument found in a symphony orchestra.",
    tiers: [
      ["Violin", "Cello|violoncello", "Flute", "Trumpet", "Clarinet", "Harp"],
      ["Viola", "Double bass|contrabass|string bass|bass", "Oboe", "Bassoon", "Trombone", "French horn|horn", "Tuba", "Timpani|kettledrum|kettle drum", "Piano"],
      ["Piccolo", "Cymbals|cymbal", "Triangle", "Xylophone", "Glockenspiel", "Snare drum", "Bass drum", "Celesta|celeste", "English horn|cor anglais"],
      ["Contrabassoon|double bassoon", "Bass clarinet", "Tam-tam|tam tam|gong", "Tubular bells|chimes", "Castanets", "Wood block|woodblock"],
    ],
    misses: { guitar: "Guitars aren't part of a standard symphony orchestra.", saxophone: "Saxophones appear now and then, but aren't standard in a symphony orchestra.", drum: "Which one? Try snare drum, bass drum or timpani." },
  },
  {
    id: "russia-borders",
    prompt: "Name a country that shares a land border with Russia.",
    note: "The Kaliningrad exclave counts.",
    tiers: [
      ["China", "Ukraine", "Finland", "Kazakhstan", "Mongolia", "Belarus"],
      ["Norway", "Estonia", "Latvia", "Georgia", "North Korea|dprk"],
      ["Poland", "Lithuania"],
      ["Azerbaijan"],
    ],
    misses: { "united states": "Russia and the US face each other across the Bering Strait, but share no land border.", usa: "Russia and the US face each other across the Bering Strait, but share no land border.", japan: "Japan and Russia are separated by sea." },
  },
  {
    id: "south-american-capitals",
    prompt: "Name the capital city of a South American country.",
    tiers: [
      ["Buenos Aires", "Lima", "Santiago", "Bogotá", "Brasília"],
      ["Caracas", "Quito", "Montevideo", "La Paz"],
      ["Asunción", "Sucre"],
      ["Georgetown", "Paramaribo"],
    ],
    misses: { "rio de janeiro": "Rio was Brazil's capital until 1960; it's Brasília now.", "sao paulo": "São Paulo is Brazil's largest city, but the capital is Brasília.", cusco: "Cusco was the Inca capital; Peru's capital is Lima." },
  },
  {
    id: "long-months",
    prompt: "Name a month that has 31 days.",
    tiers: [["January", "December", "July", "August"], ["March", "May", "October"], [], []],
    misses: { june: "June has 30 days.", september: "September has 30 days.", april: "April has 30 days.", november: "November has 30 days.", february: "February has 28, or 29 in a leap year." },
  },
  {
    id: "swiss-languages",
    prompt: "Name an official national language of Switzerland.",
    tiers: [["German|swiss german", "French"], ["Italian"], [], ["Romansh|romansch|rumantsch|romanche"]],
    misses: { english: "English is widely spoken but isn't a national language.", "swiss": "Which one? Switzerland has four national languages." },
  },
  {
    id: "rainbow",
    prompt: "Name a colour of the rainbow, in its classic seven.",
    tiers: [["Red", "Blue", "Green", "Yellow"], ["Orange", "Violet|purple"], ["Indigo"], []],
    misses: { pink: "Pink isn't one of the classic seven.", white: "White light is what the rainbow splits apart." },
  },
  {
    id: "b-countries",
    prompt: "Name a country whose name starts with B.",
    tiers: [
      ["Brazil", "Belgium", "Bolivia", "Bulgaria"],
      ["Bangladesh", "Bahamas|the bahamas", "Belarus", "Botswana", "Bosnia and Herzegovina|bosnia|bosnia herzegovina"],
      ["Bahrain", "Barbados", "Belize", "Bhutan", "Brunei|brunei darussalam", "Burundi"],
      ["Benin", "Burkina Faso"],
    ],
    misses: { burma: "Burma is now officially Myanmar.", britain: "The country's name is the United Kingdom.", "great britain": "The country's name is the United Kingdom.", borneo: "Borneo is an island shared by three countries." },
  },
];

// --- Matching ------------------------------------------------------------------------------------

export type Answer = { name: string; tier: Tier; keys: string[] };
export type Question = Omit<QuestionSource, "tiers" | "misses"> & { answers: Answer[]; misses: Map<string, string> };

/** Lower case, no accents or punctuation, "&" as "and", "st" as "saint", a leading "the" dropped. */
export function normalize(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’'`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bst\b/g, "saint")
    .trim()
    .replace(/^the /, "")
    .replace(/\s+/g, " ");
}

const compact = (key: string) => key.replace(/ /g, "");

function build(source: QuestionSource): Question {
  const answers: Answer[] = source.tiers.flatMap((names, index) =>
    names.map((entry) => {
      const [name, ...aliases] = entry.split("|");
      const keys = [...new Set([name, ...aliases].map(normalize).flatMap((key) => [key, compact(key)]))];
      return { name, tier: (index + 1) as Tier, keys };
    }),
  );
  const misses = new Map(Object.entries(source.misses ?? {}).map(([key, text]) => [compact(normalize(key)), text]));
  return { id: source.id, prompt: source.prompt, note: source.note, strict: source.strict, answers, misses };
}

export const QUESTIONS: Question[] = SOURCES.map(build);
const BY_ID = new Map(QUESTIONS.map((question) => [question.id, question]));
export const questionById = (id: string) => BY_ID.get(id) ?? null;

/** The dive for a charted answer, or null for a stop left unanswered. */
export function diveOf(questionId: string, answer: string | null, tier: Tier | null): Dive | null {
  if (tier === null || answer === null) return null;
  if (tier < 4) return (["familiar", "uncommon", "rare"] as const)[tier - 1];
  const deepest = BY_ID.get(questionId)?.answers.filter((entry) => entry.tier === 4) ?? [];
  return deepest.length === 1 && deepest[0].name === answer ? "extraordinary" : "exceptional";
}

/** Optimal string alignment distance (edits, with adjacent swaps counting once), stopping early past `limit`. */
function distance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1);
      rows[i][j] = value;
      best = Math.min(best, value);
    }
    if (best > limit) return limit + 1;
  }
  return rows[a.length][b.length];
}

/** How many typos a key of this length tolerates: none for short words, where one letter changes the word. */
const tolerance = (length: number) => (length <= 4 ? 0 : length <= 8 ? 1 : 2);

export type Verdict =
  | { kind: "empty" }
  | { kind: "match"; answer: Answer; corrected: boolean }
  | { kind: "ambiguous"; options: string[] }
  | { kind: "miss"; reason: string | null };

/** Reads one typed answer against a question: exact or alias first, then a small spelling tolerance. */
export function judge(question: Question, input: string): Verdict {
  const key = normalize(input);
  if (!key) return { kind: "empty" };
  const tight = compact(key);
  const exact = question.answers.find((answer) => answer.keys.includes(key) || answer.keys.includes(tight));
  if (exact) return { kind: "match", answer: exact, corrected: false };
  const reason = question.misses.get(tight);
  if (reason) return { kind: "miss", reason };

  const limit = question.strict ? 0 : tolerance(tight.length);
  if (limit === 0) return { kind: "miss", reason: null };
  let best = limit + 1;
  let found: Answer[] = [];
  for (const answer of question.answers) {
    const near = Math.min(...answer.keys.filter((candidate) => tolerance(candidate.length) > 0).map((candidate) => distance(tight, compact(candidate), limit)));
    if (near < best) {
      best = near;
      found = [answer];
    } else if (near === best && near <= limit && !found.includes(answer)) found.push(answer);
  }
  if (best > limit || !found.length) return { kind: "miss", reason: null };
  if (found.length > 1) return { kind: "ambiguous", options: found.map((answer) => answer.name) };
  return { kind: "match", answer: found[0], corrected: true };
}

// --- Rounds --------------------------------------------------------------------------------------

/** One answered stop: what was typed, what it was read as (null when the stop was let pass) and the points. */
export type Stop = { question: string; input: string; answer: string | null; tier: Tier | null; points: number };

export type Round = { id: string; questions: string[]; stops: Stop[]; startedAt: number };

/** Seven different questions, avoiding the ones from the previous round where the bank allows. */
export function newRound(avoid: readonly string[] = [], random: () => number = Math.random): Round {
  const fresh = QUESTIONS.filter((question) => !avoid.includes(question.id));
  const pool = fresh.length >= STOPS ? fresh : QUESTIONS;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { id: Math.floor(random() * 2 ** 32).toString(36), questions: shuffled.slice(0, STOPS).map((question) => question.id), stops: [], startedAt: Date.now() };
}

export const roundScore = (round: Round) => round.stops.reduce((sum, stop) => sum + stop.points, 0);

/** A saved round from localStorage, or null when it's missing, from another version, or no longer valid. */
export function restoreRound(raw: unknown): Round | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<Round>;
  if (typeof value.id !== "string" || !Array.isArray(value.questions) || !Array.isArray(value.stops)) return null;
  if (value.questions.length !== STOPS || value.questions.some((id) => typeof id !== "string" || !BY_ID.has(id))) return null;
  if (value.stops.length > STOPS) return null;
  const stops: Stop[] = [];
  for (const [index, stop] of value.stops.entries()) {
    if (!stop || stop.question !== value.questions[index]) return null;
    const question = BY_ID.get(stop.question)!;
    // Re-read the stored answer so a saved round can never claim more than its answer is worth.
    const answer = stop.answer === null ? null : (question.answers.find((entry) => entry.name === stop.answer) ?? null);
    if (stop.answer !== null && !answer) return null;
    stops.push({ question: stop.question, input: String(stop.input ?? "").slice(0, 80), answer: answer?.name ?? null, tier: answer?.tier ?? null, points: answer ? TIERS[answer.tier].points : 0 });
  }
  return { id: value.id, questions: value.questions, stops, startedAt: typeof value.startedAt === "number" ? value.startedAt : Date.now() };
}

/** 32-bit FNV-1a, used to give each dive a stable sway in the shaft from its own answer. */
export function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
