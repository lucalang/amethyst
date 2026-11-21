import "server-only";
import { ratioScore, type PricePrompt, type PriceResult, type SourceRef } from "./guess-the";

/**
 * Guess the Price: real prices, each pinned to a model, market, date and condition, and attributed to the seller,
 * auction house or official announcement that set it (checked on 21 November 2026). Launch prices are the maker's
 * announced price before sales tax; auction results include the buyer's premium. Prices are historical: today's
 * price may differ, which is why every prompt states its date.
 */

type PriceDef = PricePrompt & { price: number; date: string; note: string; source: SourceRef };

const PRICES: readonly PriceDef[] = [
  {
    id: "iphone-15",
    kind: "Launch price",
    name: "Apple iPhone 15 (128 GB)",
    detail: "Brand new, the US starting price Apple announced on 12 September 2023, before sales tax.",
    currency: "USD",
    icon: "phone",
    price: 799,
    date: "12 September 2023",
    note: "Apple’s US starting price for the 128 GB model, before tax; the iPhone 15 Plus started at $899.",
    source: { publisher: "Apple Newsroom", title: "Apple debuts iPhone 15 and iPhone 15 Plus", url: "https://www.apple.com/newsroom/2023/09/apple-debuts-iphone-15-and-iphone-15-plus/" },
  },
  {
    id: "ps5-disc",
    kind: "Launch price",
    name: "Sony PlayStation 5 (with Ultra HD Blu-ray disc drive)",
    detail: "Brand new, the US recommended retail price Sony announced on 16 September 2020, ahead of the November 2020 launch.",
    currency: "USD",
    icon: "console",
    price: 499.99,
    date: "16 September 2020",
    note: "US recommended retail price at launch; the Digital Edition without a disc drive was $399.99.",
    source: {
      publisher: "PlayStation Blog (Sony Interactive Entertainment)",
      title: "PlayStation 5 launches in November, starting at $399 for PS5 Digital Edition and $499 for PS5 with Ultra HD Blu-ray Disc Drive",
      url: "https://blog.playstation.com/2020/09/16/playstation-5-launches-in-november-starting-at-399-for-ps5-digital-edition-and-499-for-ps5-with-ultra-hd-blu-ray-disc-drive/",
    },
  },
  {
    id: "switch-2",
    kind: "Launch price",
    name: "Nintendo Switch 2 (console on its own)",
    detail: "Brand new, the US price Nintendo announced on 2 April 2025 and kept for the 5 June 2025 launch.",
    currency: "USD",
    icon: "console",
    price: 449.99,
    date: "2 April 2025",
    note: "US price for the console alone; the bundle with Mario Kart World was $499.99.",
    source: { publisher: "Nintendo, reported by Nintendo Life", title: "Nintendo Switch 2 priced at US$449.99 for the base console", url: "https://www.nintendolife.com/news/2025/04/nintendo-switch-2-priced-at-usd449-99-for-the-base-console" },
  },
  {
    id: "vision-pro",
    kind: "Launch price",
    name: "Apple Vision Pro (256 GB)",
    detail: "Brand new, the US starting price when it went on sale on 2 February 2024, before sales tax.",
    currency: "USD",
    icon: "headset",
    price: 3499,
    date: "8 January 2024",
    note: "Apple’s US starting price with 256 GB of storage; prescription lens inserts were extra.",
    source: { publisher: "Apple Newsroom", title: "Apple Vision Pro available in the U.S. on February 2", url: "https://www.apple.com/newsroom/2024/01/apple-vision-pro-available-in-the-us-on-february-2/" },
  },
  {
    id: "raspberry-pi-5",
    kind: "Launch price",
    name: "Raspberry Pi 5 (4 GB)",
    detail: "The bare board, new, at its launch price announced on 28 September 2023, before local taxes.",
    currency: "USD",
    icon: "board",
    price: 60,
    date: "28 September 2023",
    note: "Launch price for the 4 GB board, plus local taxes; the 8 GB board was $80. Prices later changed.",
    source: { publisher: "Raspberry Pi", title: "Introducing: Raspberry Pi 5!", url: "https://www.raspberrypi.com/news/introducing-raspberry-pi-5/" },
  },
  {
    id: "steam-deck",
    kind: "Launch price",
    name: "Valve Steam Deck (64 GB)",
    detail: "Brand new, the entry model’s US price Valve announced on 15 July 2021.",
    currency: "USD",
    icon: "console",
    price: 399,
    date: "15 July 2021",
    note: "US price of the 64 GB model at announcement; the 256 GB model was $529 and the 512 GB model $649.",
    source: { publisher: "GameSpot", title: "Valve’s Steam Deck is a portable PC, will launch December 2021 for $399", url: "https://www.gamespot.com/articles/valve-reveals-portable-pc-steam-deck-will-launch-december-2021-for-399/1100-6493989/" },
  },
  {
    id: "xbox-series-x",
    kind: "Launch price",
    name: "Microsoft Xbox Series X",
    detail: "Brand new, the US retail price Microsoft confirmed on 9 September 2020 for the 10 November 2020 launch.",
    currency: "USD",
    icon: "console",
    price: 499,
    date: "9 September 2020",
    note: "US retail price at launch; the smaller Xbox Series S was $299.",
    source: { publisher: "TechCrunch", title: "Microsoft confirms $499 Xbox Series X arrives November 10, pre-orders begin September 22", url: "https://techcrunch.com/2020/09/09/microsoft-confirms-499-xbox-series-x-arrives-november-10-pre-orders-begin-september-22/" },
  },
  {
    id: "ipod",
    kind: "Launch price",
    name: "The original Apple iPod (5 GB)",
    detail: "Brand new, Apple’s US suggested retail price when it was announced on 23 October 2001.",
    currency: "USD",
    icon: "music",
    price: 399,
    date: "23 October 2001",
    note: "Apple’s suggested US retail price; it went on sale on 10 November 2001.",
    source: { publisher: "Apple Newsroom", title: "Apple Presents iPod", url: "https://www.apple.com/newsroom/2001/10/23Apple-Presents-iPod/" },
  },
  {
    id: "lego-falcon",
    kind: "Launch price",
    name: "LEGO Star Wars Millennium Falcon, Ultimate Collector Series (75192)",
    detail: "The 7,541-piece set, new in its box, at its US launch price in 2017.",
    currency: "USD",
    icon: "bricks",
    price: 799.99,
    date: "31 August 2017",
    note: "US price when the set was revealed; it later rose to $849.99.",
    source: { publisher: "Brickset", title: "75192 Millennium Falcon revealed!", url: "https://brickset.com/article/30277/75192-millennium-falcon-revealed!" },
  },
  {
    id: "usps-forever",
    kind: "Postage",
    name: "A US First-Class Forever stamp",
    detail: "One stamp for a 1-ounce domestic letter, bought from the US Postal Service from 14 July 2024.",
    currency: "USD",
    icon: "stamp",
    price: 0.73,
    date: "14 July 2024",
    note: "The price from 14 July 2024, up from 68 cents.",
    source: { publisher: "United States Postal Service", title: "U.S. Postal Service recommends new prices for July 2024", url: "https://about.usps.com/newsroom/national-releases/2024/0409-usps-recommends-new-prices-for-july-2024.htm" },
  },
  {
    id: "swiss-vignette",
    kind: "Road toll",
    name: "Swiss motorway vignette (2025)",
    detail: "The yearly sticker or e-vignette for a car on Swiss motorways, valid December 2024 to January 2026.",
    currency: "CHF",
    icon: "road",
    price: 40,
    date: "2025",
    note: "The same price for the sticker and the e-vignette; there are no shorter passes.",
    source: { publisher: "Swiss Federal Administration (ch.ch)", title: "Swiss motorway vignette: costs, validity, points of purchase", url: "https://www.ch.ch/en/swiss-motorway-sticker" },
  },
  {
    id: "salvator-mundi",
    kind: "Auction record",
    name: "Salvator Mundi, attributed to Leonardo da Vinci",
    detail: "The oil painting of Christ, sold at Christie’s New York on 15 November 2017.",
    currency: "USD",
    icon: "painting",
    price: 450_300_000,
    date: "15 November 2017",
    note: "Including the buyer’s premium; the hammer price was $400 million. The most expensive artwork ever sold.",
    source: { publisher: "NPR", title: "Da Vinci portrait of Christ sells for record-shattering $450 million", url: "https://www.npr.org/sections/thetwo-way/2017/11/16/564527819/da-vinci-portrait-of-christ-sells-for-record-shattering-450-million" },
  },
  {
    id: "love-is-in-the-bin",
    kind: "Auction record",
    name: "Banksy, Love Is in the Bin",
    detail: "The half-shredded painting (formerly Girl with Balloon), sold at Sotheby’s London on 14 October 2021.",
    currency: "GBP",
    icon: "painting",
    price: 18_582_000,
    date: "14 October 2021",
    note: "Including the buyer’s premium; the hammer price was £16 million. A record for Banksy at auction.",
    source: { publisher: "The Art Newspaper", title: "Banksy’s shredded Love is in the Bin sells for £18.5m", url: "https://www.theartnewspaper.com/2021/10/14/banksys-shredded-love-is-in-the-bin-sells-for-pound185m" },
  },
  {
    id: "stan-t-rex",
    kind: "Auction record",
    name: "“Stan”, a Tyrannosaurus rex skeleton",
    detail: "The 67-million-year-old fossil skeleton found in South Dakota, sold at Christie’s New York on 6 October 2020.",
    currency: "USD",
    icon: "dinosaur",
    price: 31_800_000,
    date: "6 October 2020",
    note: "Including fees; the hammer price was $27.5 million. A record for a fossil at the time.",
    source: { publisher: "NBC News", title: "One of largest known T. Rex skeletons sells for record $31.8 million", url: "https://www.nbcnews.com/news/us-news/one-largest-known-t-rex-skeletons-sells-record-31-8-n1242420" },
  },
  {
    id: "jordan-jersey",
    kind: "Auction record",
    name: "Michael Jordan’s jersey from Game 1 of the 1998 NBA Finals",
    detail: "The game-worn Chicago Bulls jersey, sold at Sotheby’s on 15 September 2022.",
    currency: "USD",
    icon: "jersey",
    price: 10_091_000,
    date: "15 September 2022",
    note: "The final price including fees; the estimate was $3–5 million. A record for game-worn sports memorabilia.",
    source: { publisher: "ESPN", title: "Michael Jordan ‘Last Dance’ jersey from 1998 NBA Finals sells for record $10.1 million at auction", url: "https://www.espn.com/nba/story/_/id/34598807" },
  },
  {
    id: "honus-wagner",
    kind: "Private sale",
    name: "T206 Honus Wagner baseball card (graded SGC 2)",
    detail: "A 1909–11 tobacco card of the Pittsburgh shortstop, sold privately through Goldin in August 2022.",
    currency: "USD",
    icon: "card",
    price: 7_250_000,
    date: "August 2022",
    note: "A record for a baseball card when it sold; fewer than 50 authenticated copies are known.",
    source: { publisher: "MLB.com", title: "Honus Wagner T206 card sells for record $7.25 million", url: "https://www.mlb.com/news/rare-t206-honus-wagner-baseball-card-sold-for-7-25-million" },
  },
];

const BY_ID = new Map(PRICES.map((price) => [price.id, price]));
export const PRICE_IDS = PRICES.map((price) => price.id);

export function pricePrompt(id: string): PricePrompt | null {
  const entry = BY_ID.get(id);
  if (!entry) return null;
  const { kind, name, detail, currency, icon } = entry;
  return { id, kind, name, detail, currency, icon };
}

export function revealPrice(id: string, guess: number): PriceResult | null {
  const entry = BY_ID.get(id);
  if (!entry) return null;
  return { score: ratioScore(guess, entry.price), actual: entry.price, guess, note: entry.note, date: entry.date, source: entry.source };
}
