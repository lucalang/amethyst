import "server-only";
import { ratioScore, type SizePrompt, type SizeResult, type SizeThing, type SourceRef } from "./guess-the";

/**
 * Guess the Real Size: pairs of well-known things compared by one stated dimension. Every measurement comes from
 * the body that sets or publishes it (a standard, an agency or the building's operator); where an official range
 * is given (ball sizes), the midpoint is used and said so. Slider ranges are wide and never centred on the answer.
 */

type Thing = SizeThing & { value: number; unit: string; source: SourceRef };

const NASA_PLANETS: SourceRef = { publisher: "NASA", title: "Planetary Fact Sheet (equatorial diameters)", url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/" };

const THINGS = {
  earth: { name: "Earth", detail: "diameter at the equator", art: "earth", aspect: 1, axis: "width", value: 12756, unit: "km", source: NASA_PLANETS },
  moon: { name: "The Moon", detail: "diameter at the equator", art: "moon", aspect: 1, axis: "width", value: 3475, unit: "km", source: NASA_PLANETS },
  mars: { name: "Mars", detail: "diameter at the equator", art: "mars", aspect: 1, axis: "width", value: 6792, unit: "km", source: NASA_PLANETS },
  jupiter: { name: "Jupiter", detail: "diameter at the equator", art: "jupiter", aspect: 1, axis: "width", value: 142984, unit: "km", source: NASA_PLANETS },
  sun: {
    name: "The Sun",
    detail: "diameter (twice its mean radius of 695,700 km)",
    art: "sun",
    aspect: 1,
    axis: "width",
    value: 1391400,
    unit: "km",
    source: { publisher: "NASA", title: "Sun Fact Sheet", url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html" },
  },
  eiffel: {
    name: "Eiffel Tower",
    detail: "height to the tip of its antenna",
    art: "eiffel",
    aspect: 0.38,
    axis: "height",
    value: 330,
    unit: "m",
    source: { publisher: "Société d’Exploitation de la Tour Eiffel", title: "The Eiffel Tower’s key figures", url: "https://www.toureiffel.paris/en/the-monument/key-figures" },
  },
  liberty: {
    name: "Statue of Liberty",
    detail: "height from the ground to the tip of the torch (305 ft 1 in)",
    art: "liberty",
    aspect: 0.32,
    axis: "height",
    value: 93,
    unit: "m",
    source: { publisher: "U.S. National Park Service", title: "Statue of Liberty: statue statistics", url: "https://www.nps.gov/stli/learn/historyculture/statue-statistics.htm" },
  },
  burj: {
    name: "Burj Khalifa",
    detail: "height to the top of its spire",
    art: "burj",
    aspect: 0.16,
    axis: "height",
    value: 828,
    unit: "m",
    source: { publisher: "Burj Khalifa (Emaar)", title: "Facts and figures", url: "https://www.burjkhalifa.ae/en/the-tower/facts-figures/" },
  },
  empire: {
    name: "Empire State Building",
    detail: "height to its roof (1,250 ft, without the antenna)",
    art: "empire-state",
    aspect: 0.28,
    axis: "height",
    value: 381,
    unit: "m",
    source: { publisher: "Empire State Realty Trust", title: "Empire State Building facts and figures", url: "https://www.esbnyc.com/about/facts-figures" },
  },
  saturnV: {
    name: "Saturn V moon rocket",
    detail: "height on the launch pad, rocket and spacecraft (363 ft)",
    art: "saturn-v",
    aspect: 0.14,
    axis: "height",
    value: 110.6,
    unit: "m",
    source: { publisher: "NASA", title: "10 Things: Rockets We Love — Saturn V", url: "https://solarsystem.nasa.gov/news/382/10-things-rockets-we-love-saturn-v" },
  },
  a380: {
    name: "Airbus A380",
    detail: "overall length, nose to tail",
    art: "a380",
    aspect: 3.0,
    axis: "width",
    value: 72.7,
    unit: "m",
    source: { publisher: "Airbus", title: "A380 Facts and Figures (January 2022)", url: "https://www.airbus.com/sites/g/files/jlcbta136/files/2022-01/EN-Airbus-A380-Facts-and-Figures-January-2022.pdf" },
  },
  b737: {
    name: "Boeing 737-800",
    detail: "overall length, nose to tail (129 ft 6 in)",
    art: "b737",
    aspect: 3.2,
    axis: "width",
    value: 39.47,
    unit: "m",
    source: { publisher: "Boeing", title: "737 Airplane Characteristics for Airport Planning", url: "https://www.boeing.com/content/dam/boeing/boeingdotcom/commercial/airports/acaps/737.pdf" },
  },
  card: {
    name: "Bank card",
    detail: "long side of a standard ID-1 card (credit and debit cards)",
    art: "card",
    aspect: 85.6 / 53.98,
    axis: "width",
    value: 85.6,
    unit: "mm",
    source: { publisher: "ISO/IEC", title: "ISO/IEC 7810 Identification cards — Physical characteristics", url: "https://www.iso.org/standard/70483.html" },
  },
  quarter: {
    name: "US quarter",
    detail: "diameter of a 25-cent coin (0.955 in)",
    art: "quarter",
    aspect: 1,
    axis: "width",
    value: 24.26,
    unit: "mm",
    source: { publisher: "United States Mint", title: "Coin specifications", url: "https://www.usmint.gov/learn/coins-and-medals/circulating-coins/coin-specifications" },
  },
  dollar: {
    name: "US banknote",
    detail: "length of a US dollar bill (6.14 in)",
    art: "dollar",
    aspect: 156 / 66.3,
    axis: "width",
    value: 156,
    unit: "mm",
    source: { publisher: "U.S. Currency Education Program (Federal Reserve)", title: "Denominations: note dimensions", url: "https://www.uscurrency.gov/denominations" },
  },
  a4: {
    name: "A4 sheet of paper",
    detail: "long side of an A4 sheet",
    art: "a4",
    aspect: 210 / 297,
    axis: "height",
    value: 297,
    unit: "mm",
    source: { publisher: "ISO", title: "ISO 216 Writing paper — Trimmed sizes — A and B series", url: "https://www.iso.org/standard/36631.html" },
  },
  football: {
    name: "Football (soccer ball, size 5)",
    detail: "diameter, from the midpoint of the official 68–70 cm circumference",
    art: "football",
    aspect: 1,
    axis: "width",
    value: 21.96,
    unit: "cm",
    source: { publisher: "IFAB", title: "Laws of the Game — Law 2: The Ball", url: "https://www.theifab.com/laws/latest/the-ball/" },
  },
  tennisBall: {
    name: "Tennis ball",
    detail: "diameter, the midpoint of the official 6.54–6.86 cm range",
    art: "tennis-ball",
    aspect: 1,
    axis: "width",
    value: 6.7,
    unit: "cm",
    source: { publisher: "International Tennis Federation", title: "Rules of Tennis — Appendix I: The Ball", url: "https://www.itftennis.com/en/about-us/governance/rules-and-regulations/" },
  },
  golfBall: {
    name: "Golf ball",
    detail: "diameter, the rules’ minimum of 1.680 in",
    art: "golf-ball",
    aspect: 1,
    axis: "width",
    value: 4.267,
    unit: "cm",
    source: { publisher: "USGA and The R&A", title: "Equipment Rules — Part 4: The Ball", url: "https://www.usga.org/equipment-standards/equipment-rules-2019.html" },
  },
  tennisCourt: {
    name: "Tennis court",
    detail: "length from baseline to baseline",
    art: "tennis-court",
    aspect: 23.77 / 10.97,
    axis: "width",
    value: 23.77,
    unit: "m",
    source: { publisher: "International Tennis Federation", title: "Rules of Tennis — Rule 1: The Court", url: "https://www.itftennis.com/en/about-us/governance/rules-and-regulations/" },
  },
  badmintonCourt: {
    name: "Badminton court",
    detail: "length from back line to back line",
    art: "badminton-court",
    aspect: 13.4 / 6.1,
    axis: "width",
    value: 13.4,
    unit: "m",
    source: { publisher: "Badminton World Federation", title: "Laws of Badminton — Law 1: Court", url: "https://corporate.bwfbadminton.com/statutes/" },
  },
  pool: {
    name: "Olympic swimming pool",
    detail: "length of a 50 m competition pool",
    art: "pool",
    aspect: 2,
    axis: "width",
    value: 50,
    unit: "m",
    source: { publisher: "World Aquatics", title: "Facilities Rules — FR 2: Swimming pools", url: "https://www.worldaquatics.com/rules/competition-regulations" },
  },
} as const satisfies Record<string, Thing>;

type ThingKey = keyof typeof THINGS;
type Pair = { id: string; topic: string; dimension: string; subject: ThingKey; reference: ThingKey; range: readonly [number, number] };

const PAIRS: readonly Pair[] = [
  { id: "moon-earth", topic: "Space", dimension: "diameter", subject: "moon", reference: "earth", range: [0.12, 8] },
  { id: "mars-earth", topic: "Space", dimension: "diameter", subject: "mars", reference: "earth", range: [0.2, 12] },
  { id: "jupiter-earth", topic: "Space", dimension: "diameter", subject: "jupiter", reference: "earth", range: [0.8, 40] },
  { id: "sun-jupiter", topic: "Space", dimension: "diameter", subject: "sun", reference: "jupiter", range: [0.6, 25] },
  { id: "eiffel-liberty", topic: "Landmarks", dimension: "height", subject: "eiffel", reference: "liberty", range: [0.5, 6] },
  { id: "burj-eiffel", topic: "Landmarks", dimension: "height", subject: "burj", reference: "eiffel", range: [0.3, 5] },
  { id: "empire-eiffel", topic: "Landmarks", dimension: "height", subject: "empire", reference: "eiffel", range: [0.5, 12] },
  { id: "saturn-liberty", topic: "Landmarks", dimension: "height", subject: "saturnV", reference: "liberty", range: [0.35, 10] },
  { id: "a380-737", topic: "Aircraft", dimension: "length", subject: "a380", reference: "b737", range: [0.3, 3] },
  { id: "pool-737", topic: "Aircraft", dimension: "length", subject: "pool", reference: "b737", range: [0.5, 10] },
  { id: "card-quarter", topic: "Everyday", dimension: "length", subject: "card", reference: "quarter", range: [0.6, 6] },
  { id: "dollar-card", topic: "Everyday", dimension: "length", subject: "dollar", reference: "card", range: [0.25, 3.5] },
  { id: "a4-card", topic: "Everyday", dimension: "length", subject: "a4", reference: "card", range: [0.5, 6] },
  { id: "football-tennis", topic: "Sport", dimension: "diameter", subject: "football", reference: "tennisBall", range: [0.5, 5] },
  { id: "golf-tennis", topic: "Sport", dimension: "diameter", subject: "golfBall", reference: "tennisBall", range: [0.3, 8] },
  { id: "tennis-badminton", topic: "Sport", dimension: "length", subject: "tennisCourt", reference: "badmintonCourt", range: [0.4, 3] },
];

const BY_ID = new Map(PAIRS.map((pair) => [pair.id, pair]));
export const SIZE_IDS = PAIRS.map((pair) => pair.id);

const publicThing = (key: ThingKey): SizeThing => {
  const { name, detail, art, aspect, axis } = THINGS[key];
  return { name, detail, art, aspect, axis };
};

export function sizePrompt(id: string): SizePrompt | null {
  const pair = BY_ID.get(id);
  if (!pair) return null;
  return { id, topic: pair.topic, dimension: pair.dimension, reference: publicThing(pair.reference), subject: publicThing(pair.subject), range: pair.range };
}

export function revealSize(id: string, guess: number): SizeResult | null {
  const pair = BY_ID.get(id);
  if (!pair) return null;
  const subject = THINGS[pair.subject];
  const reference = THINGS[pair.reference];
  const [min, max] = pair.range;
  const clamped = Math.min(max, Math.max(min, guess));
  const actual = subject.value / reference.value;
  const sources = subject.source.url === reference.source.url ? [subject.source] : [subject.source, reference.source];
  return {
    score: ratioScore(clamped, actual),
    actual,
    guess: clamped,
    reference: { value: reference.value, unit: reference.unit },
    subject: { value: subject.value, unit: subject.unit },
    note: `${subject.name}: ${subject.detail}. ${reference.name}: ${reference.detail}.`,
    sources,
  };
}
