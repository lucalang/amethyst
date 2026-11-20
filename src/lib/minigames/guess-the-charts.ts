import "server-only";
import { scoreGuess, type ChartPuzzle, type ChartResult, type ChartSource } from "./guess-the";
import { SERIES } from "./guess-the-series";

/**
 * Guess the Chart's datasets: real annual series downloaded from their publishers on 2026-11-20 (see
 * guess-the-series.ts). Values are never edited by hand. They stay on the server: a puzzle only carries the years
 * up to its cutoff, and the rest is sent once a complete guess is submitted.
 */

const RETRIEVED = "20 November 2026";
const fred = (series: string, dataset: string, publisher: string, note: string): ChartSource => ({
  publisher: `${publisher}, via FRED (Federal Reserve Bank of St. Louis)`,
  dataset: `${dataset} [${series}]`,
  url: `https://fred.stlouisfed.org/series/${series}`,
  note,
  retrieved: RETRIEVED,
});
const worldBank = (indicator: string, country: string, dataset: string, note: string): ChartSource => ({
  publisher: "World Bank, World Development Indicators",
  dataset: `${dataset} [${indicator}]`,
  url: `https://data.worldbank.org/indicator/${indicator}?locations=${country}`,
  note,
  retrieved: RETRIEVED,
});

type ChartDef = Omit<ChartPuzzle, "firstYear" | "lastYear" | "visible">;

const CHARTS: readonly ChartDef[] = [
  {
    id: "college-unemployment",
    topic: "Jobs",
    title: "Unemployment among college graduates",
    subtitle: "United States, people aged 25 and over whose highest degree is a bachelor’s",
    unit: "% of the labor force",
    format: { decimals: 1, suffix: "%" },
    yDomain: [0, 10],
    cutoff: 2010,
    source: fred(
      "CGBD25O",
      "Unemployment Rate – College Graduates – Bachelor’s Degree, 25 years and over",
      "U.S. Bureau of Labor Statistics",
      "Annual averages of the monthly rates (not seasonally adjusted). Ends in 2024: October 2025 has no published value, so 2025 has no full-year average.",
    ),
  },
  {
    id: "us-unemployment",
    topic: "Jobs",
    title: "US unemployment rate",
    subtitle: "Civilian unemployment rate, all workers aged 16 and over",
    unit: "% of the labor force",
    format: { decimals: 1, suffix: "%" },
    yDomain: [0, 12],
    cutoff: 1999,
    source: fred(
      "UNRATE",
      "Unemployment Rate",
      "U.S. Bureau of Labor Statistics",
      "Annual averages of the monthly, seasonally adjusted rates. Ends in 2024: October 2025 has no published value, so 2025 has no full-year average.",
    ),
  },
  {
    id: "mortgage-rates",
    topic: "Housing",
    title: "30-year mortgage rates in the US",
    subtitle: "Average interest rate on a 30-year fixed-rate mortgage",
    unit: "% interest per year",
    format: { decimals: 2, suffix: "%" },
    yDomain: [0, 20],
    cutoff: 2005,
    source: fred(
      "MORTGAGE30US",
      "30-Year Fixed Rate Mortgage Average in the United States",
      "Freddie Mac",
      "Annual averages of the weekly survey rates. Starts in 1972, the first full year of the survey.",
    ),
  },
  {
    id: "oil-price",
    topic: "Energy",
    title: "The price of a barrel of oil",
    subtitle: "West Texas Intermediate (WTI) crude oil spot price",
    unit: "US dollars per barrel, not adjusted for inflation",
    format: { decimals: 0, prefix: "$" },
    yDomain: [0, 150],
    cutoff: 1999,
    source: fred("WTISPLC", "Spot Crude Oil Price: West Texas Intermediate (WTI)", "Federal Reserve Bank of St. Louis", "Annual averages of the monthly prices, in dollars of each year."),
  },
  {
    id: "us-inflation",
    topic: "Prices",
    title: "Inflation in the United States",
    subtitle: "How much consumer prices rose over each year",
    unit: "% change in consumer prices",
    format: { decimals: 1, suffix: "%" },
    yDomain: [-4, 16],
    cutoff: 1999,
    source: fred("FPCPITOTLZGUSA", "Inflation, consumer prices for the United States", "World Bank", "Annual percentage change in the consumer price index, as published (2024 is the latest year)."),
  },
  {
    id: "saving-rate",
    topic: "Money",
    title: "How much Americans save",
    subtitle: "Personal saving as a share of disposable personal income",
    unit: "% of disposable income",
    format: { decimals: 1, suffix: "%" },
    yDomain: [0, 20],
    cutoff: 2004,
    source: fred("PSAVERT", "Personal Saving Rate", "U.S. Bureau of Economic Analysis", "Annual averages of the monthly, seasonally adjusted rates."),
  },
  {
    id: "house-price",
    topic: "Housing",
    title: "The price of a new US home",
    subtitle: "Median sales price of newly built houses sold in the United States",
    unit: "thousands of US dollars, not adjusted for inflation",
    format: { decimals: 0, prefix: "$", suffix: "k" },
    yDomain: [0, 600],
    cutoff: 2000,
    source: fred(
      "MSPUS",
      "Median Sales Price of New Houses Sold for the United States",
      "U.S. Census Bureau and U.S. Department of Housing and Urban Development",
      "Annual averages of the quarterly medians, shown in thousands of dollars of each year.",
    ),
  },
  {
    id: "co2",
    topic: "Climate",
    title: "Carbon dioxide in the atmosphere",
    subtitle: "Annual mean CO₂ concentration measured at Mauna Loa, Hawaii",
    unit: "parts per million (ppm)",
    format: { decimals: 1, suffix: " ppm" },
    yDomain: [300, 460],
    cutoff: 1999,
    source: {
      publisher: "NOAA Global Monitoring Laboratory",
      dataset: "Mauna Loa CO₂ annual mean data",
      url: "https://gml.noaa.gov/ccgg/trends/data.html",
      note: "Annual means as published. From December 2022 to early July 2023 the measurements come from Maunakea Observatories, about 21 miles north, after the Mauna Loa eruption.",
      retrieved: RETRIEVED,
    },
  },
  {
    id: "global-temperature",
    topic: "Climate",
    title: "Global surface temperature",
    subtitle: "Average land and ocean temperature compared with 1951–1980",
    unit: "°C above (or below) the 1951–1980 average",
    format: { decimals: 2, suffix: " °C" },
    yDomain: [-1, 2],
    cutoff: 1999,
    source: {
      publisher: "NASA Goddard Institute for Space Studies",
      dataset: "GISS Surface Temperature Analysis (GISTEMP v4), global land-ocean annual mean",
      url: "https://data.giss.nasa.gov/gistemp/",
      note: "The January–December annual means as published.",
      retrieved: RETRIEVED,
    },
  },
  {
    id: "internet-users",
    topic: "Technology",
    title: "People using the internet",
    subtitle: "Share of the world’s population using the internet",
    unit: "% of the world’s population",
    format: { decimals: 1, suffix: "%" },
    yDomain: [0, 100],
    cutoff: 2013,
    source: worldBank("IT.NET.USER.ZS", "WLD", "Individuals using the Internet (% of population), World", "World aggregate as published (based on International Telecommunication Union data). Starts in 2005, the first year with a world value."),
  },
  {
    id: "korea-fertility",
    topic: "Population",
    title: "Births per woman in South Korea",
    subtitle: "Total fertility rate: the average number of children a woman would have",
    unit: "births per woman",
    format: { decimals: 2 },
    yDomain: [0, 7],
    cutoff: 1999,
    source: worldBank("SP.DYN.TFRT.IN", "KOR", "Fertility rate, total (births per woman), Korea, Rep.", "Annual values as published (2024 is the latest year)."),
  },
];

const BY_ID = new Map(CHARTS.map((chart) => [chart.id, chart]));
export const CHART_IDS = CHARTS.map((chart) => chart.id);

function seriesOf(id: string) {
  const series = SERIES[id];
  if (!series?.length) throw new Error(`Guess the Chart: no data for ${id}`);
  return series;
}

/** The player's view of a chart: everything up to the cutoff, nothing after it. */
export function chartPuzzle(id: string): ChartPuzzle | null {
  const chart = BY_ID.get(id);
  if (!chart) return null;
  const series = seriesOf(id);
  return {
    ...chart,
    firstYear: series[0][0],
    lastYear: series[series.length - 1][0],
    visible: series.filter(([year]) => year <= chart.cutoff),
  };
}

/** A random chart, skipping the recently played ones while any others are left. */
export function randomChart(recent: readonly string[], random: () => number = Math.random): ChartPuzzle {
  const fresh = CHART_IDS.filter((id) => !recent.includes(id));
  const last = recent[recent.length - 1];
  const pool = fresh.length ? fresh : CHART_IDS.filter((id) => id !== last);
  return chartPuzzle(pool[Math.floor(random() * pool.length)])!;
}

/** Scores a complete guess (one value per hidden year) and reveals the real continuation. */
export function revealChart(id: string, guesses: readonly number[]): ChartResult | "unknown" | "incomplete" {
  const chart = BY_ID.get(id);
  if (!chart) return "unknown";
  const actual = seriesOf(id).filter(([year]) => year > chart.cutoff);
  if (guesses.length !== actual.length) return "incomplete";
  const [min, max] = chart.yDomain;
  const clamped = guesses.map((value) => Math.min(max, Math.max(min, value)));
  const { score, averageMiss, missShare } = scoreGuess(
    clamped,
    actual.map(([, value]) => value),
    chart.yDomain,
  );
  return { actual, score, averageMiss, missShare };
}
