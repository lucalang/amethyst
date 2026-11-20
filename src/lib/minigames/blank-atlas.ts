/**
 * The Descent (game id "blank-atlas", kept so records and saved rounds carry over): seven questions per round,
 * each a dive deeper into the fog. Any correct answer counts; rarer correct answers score more and dive harder.
 *
 * Rarity is a curated model, not measured data. No public dataset records how often people give each answer to
 * these prompts, so every answer is placed by hand in one of four tiers by how readily people tend to think of
 * it. The game says so wherever rarity is shown, and never presents a tier as a percentage of players.
 *
 * Questions are everyday categories anyone can answer (a fruit, a sport, a colour…), each with a long curated
 * list of accepted answers. Closed sets (US states, African countries, the elements) are complete; open ones are
 * broad but can still miss something real, and the game says so instead of claiming otherwise.
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
 * How hard an answer dives. The first four follow the tiers one to one. "Extraordinary" is a question's hidden
 * gem: one hand-picked deep answer per question (rambutan, theremin, philtrum…). It is worth the same 100 points
 * as any Exceptional answer; it just plunges harder.
 */
export type Dive = "familiar" | "uncommon" | "rare" | "exceptional" | "extraordinary";
export const DIVES: Record<Dive, { name: string; motion: string; blurb: string; level: number; mark: string }> = {
  familiar: { name: "Familiar", motion: "a short, gentle descent", blurb: "The first answer on everyone’s lips.", level: 1, mark: "⬜" },
  uncommon: { name: "Uncommon", motion: "a deeper glide with a trail of light", blurb: "Off the lit road. Well found.", level: 2, mark: "🟩" },
  rare: { name: "Rare", motion: "a fast plunge as the fog parts", blurb: "Few would ever think of it.", level: 3, mark: "🟦" },
  exceptional: { name: "Exceptional", motion: "a forceful dive with rippling light", blurb: "Almost nobody goes this deep.", level: 4, mark: "🟪" },
  extraordinary: { name: "Extraordinary", motion: "a dramatic plunge through the fog", blurb: "You found this question’s hidden gem.", level: 5, mark: "🟥" },
};
export const MISS_MARK = "⬛";

/** Every point sinks the lantern 10 metres, so a perfect descent reaches 7,000 m. */
export const METRES_PER_POINT = 10;
/** Before each question: a moment to read it. Then the clock. */
export const PREVIEW_MS = 3000;
export const ANSWER_MS = 25_000;

/**
 * The five zones of the fog, by depth in metres. A round's verdict is the zone its lantern came to rest in.
 * (Original places; the world art for each lives in components/arcade/blank-atlas/world-art.tsx.)
 */
export const ZONES: { m: number; name: string; verdict: string }[] = [
  { m: 0, name: "The Gaslit City", verdict: "You came to rest among the drowned rooftops of the Gaslit City. The fog has far more to show you." },
  { m: 800, name: "The Spirit Tide", verdict: "You sank into the Spirit Tide, where the cards turn themselves and mirrors remember other faces." },
  { m: 2100, name: "The Drowned Sea", verdict: "You reached the Drowned Sea, where a lighthouse shines darkness and something vast is dreaming." },
  { m: 4200, name: "The Fallen Kingdom", verdict: "You reached the Fallen Kingdom, among the broken faces of gods nobody remembers." },
  { m: 6200, name: "The Nameless Floor", verdict: "The Nameless Floor. You stood before the door that should never be opened. Almost nobody gets here." },
];
export const zoneAt = (metres: number) => [...ZONES].reverse().find((zone) => metres >= zone.m) ?? ZONES[0];
export const bandFor = (score: number) => zoneAt(score * METRES_PER_POINT);
export const MAX_SCORE = STOPS * TIERS[4].points;

/**
 * One question. Each tier is a comma-separated list of answers, "Name|alias|alias". `gem` is the question's hidden
 * gem: one hand-picked deep answer (satisfying, findable) that dives as Extraordinary. `misses` explains tempting
 * answers that aren't correct (keys are written like answers, values are shown to the player).
 */
type QuestionSource = {
  id: string;
  prompt: string;
  /** A short clarification under the prompt. */
  note?: string;
  gem: string;
  tiers: [string, string, string, string];
  misses?: Record<string, string>;
  /** Exact answers only: no spelling tolerance. */
  strict?: boolean;
};

const SOURCES: QuestionSource[] = [
  {
    id: "fruit",
    prompt: "Name a fruit.",
    gem: "Rambutan",
    tiers: [
      "Apple, Banana, Orange, Strawberry, Grape, Watermelon, Pineapple, Mango",
      "Pear, Peach, Cherry, Kiwi|kiwifruit, Lemon, Lime, Blueberry, Raspberry, Plum, Coconut, Grapefruit, Pomegranate, Apricot, Papaya, Melon, Cantaloupe, Blackberry, Nectarine, Avocado, Fig, Tangerine|mandarin",
      "Passion fruit|passionfruit, Lychee|litchi, Dragon fruit|pitaya, Persimmon, Guava, Cranberry, Date, Clementine, Honeydew, Kumquat, Gooseberry, Star fruit|starfruit|carambola, Quince, Mulberry, Elderberry, Currant|blackcurrant|redcurrant, Tomato, Olive, Jackfruit, Plantain, Durian",
      "Rambutan, Mangosteen, Salak|snake fruit, Longan, Loquat, Feijoa, Cherimoya|custard apple, Soursop|guanabana, Tamarind, Ackee, Pawpaw, Sapodilla, Jabuticaba, Yuzu, Physalis|cape gooseberry|goldenberry, Medlar, Cloudberry, Lingonberry, Acai|açaí, Kiwano|horned melon, Ugli fruit, Bilberry, Boysenberry, Huckleberry, Breadfruit, Miracle fruit, Buddha's hand",
    ],
  },
  {
    id: "vegetable",
    prompt: "Name a vegetable.",
    gem: "Romanesco",
    tiers: [
      "Carrot, Potato, Broccoli, Onion, Lettuce, Cucumber, Tomato",
      "Spinach, Pepper|bell pepper|capsicum, Corn|sweetcorn|maize, Pea, Cabbage, Cauliflower, Celery, Garlic, Mushroom, Zucchini|courgette, Eggplant|aubergine, Green bean|string bean|french bean, Sweet potato, Pumpkin, Asparagus, Beetroot|beet, Radish, Kale, Leek",
      "Brussels sprout|sprout, Artichoke, Turnip, Parsnip, Squash|butternut squash, Okra|ladies fingers, Chard|swiss chard, Bok choy|pak choi, Fennel, Shallot, Rhubarb, Arugula|rocket, Watercress, Endive, Edamame, Spring onion|scallion|green onion, Jalapeno, Chilli|chili|chili pepper, Yam, Cassava|yuca, Bean sprout",
      "Romanesco, Kohlrabi, Celeriac, Rutabaga|swede, Salsify, Jicama, Daikon|mooli, Jerusalem artichoke|sunchoke, Taro, Lotus root, Samphire, Purslane, Fiddlehead, Chayote, Tomatillo, Cardoon, Burdock, Water chestnut, Celtuce, Broccolini, Radicchio, Mizuna, Nopal|nopales",
    ],
  },
  {
    id: "sea-animal",
    prompt: "Name an animal that lives in the sea.",
    gem: "Dumbo octopus",
    tiers: [
      "Shark, Whale, Dolphin, Fish, Octopus, Jellyfish, Crab",
      "Sea turtle|turtle, Seal, Starfish|sea star, Squid, Lobster, Shrimp|prawn, Clownfish, Stingray|ray, Orca|killer whale, Seahorse, Eel, Sea lion, Walrus, Oyster, Clam, Mussel, Coral, Tuna, Salmon, Swordfish, Manta ray, Blue whale, Hammerhead shark|hammerhead, Pufferfish|blowfish",
      "Narwhal, Manatee, Sea urchin, Sea cucumber, Sea anemone|anemone, Barracuda, Cuttlefish, Krill, Plankton, Beluga, Humpback whale|humpback, Sperm whale, Marlin, Sea otter|otter, Dugong, Anglerfish, Lionfish, Moray eel|moray, Nautilus, Scallop, Hermit crab, Sardine, Cod, Mackerel, Halibut, Flounder, Great white shark|great white",
      "Dumbo octopus, Vampire squid, Blobfish, Sea pig, Frogfish, Oarfish, Sunfish|mola mola|ocean sunfish, Sea dragon|leafy sea dragon, Coelacanth, Nudibranch|sea slug, Mantis shrimp, Siphonophore, Goblin shark, Gulper eel, Horseshoe crab, Barreleye, Wobbegong, Remora, Vaquita, Giant isopod|isopod, Sea spider, Sea squirt, Lamprey, Triggerfish",
    ],
    misses: { penguin: "Penguins swim in the sea, but they nest on land. Try something that lives in the water." },
  },
  {
    id: "pizza",
    prompt: "Name a pizza topping.",
    gem: "Nduja",
    tiers: [
      "Pepperoni, Cheese|mozzarella, Mushroom, Ham, Pineapple, Sausage, Olive",
      "Onion, Pepper|bell pepper|green pepper, Bacon, Chicken, Tomato, Spinach, Jalapeno, Beef|ground beef|mince, Salami, Basil, Anchovy, Sweetcorn|corn",
      "Artichoke, Garlic, Feta, Goat cheese|goats cheese, Prosciutto|parma ham, Chorizo, Arugula|rocket, Sun-dried tomato|sundried tomato, Red onion, Egg, Tuna, Prawn|shrimp, BBQ chicken|barbecue chicken, Meatball, Ricotta, Parmesan, Pesto, Broccoli, Potato, Eggplant|aubergine, Zucchini|courgette, Oregano, Chilli flakes|chili flakes|red pepper flakes, Kebab",
      "Nduja|'nduja, Gorgonzola, Truffle, Fig, Honey, Pear, Walnut, Caper, Clam, Burrata, Pancetta, Speck, Caramelised onion|caramelized onion, Pistachio, Smoked salmon|salmon, Kale, Brie, Mortadella, Banana, Curry, Sauerkraut, Octopus, Squid|calamari, Duck",
    ],
  },
  {
    id: "sport",
    prompt: "Name a sport.",
    gem: "Sepak takraw",
    tiers: [
      "Football|soccer, Basketball, Tennis, Baseball, Golf, Swimming, Volleyball, American football",
      "Ice hockey|hockey, Cricket, Rugby, Boxing, Athletics|running|track and field, Cycling, Skiing, Badminton, Table tennis|ping pong, Wrestling, Surfing, Skateboarding, Snowboarding, Gymnastics, Handball, Karate, Judo, Softball, Lacrosse, Bowling, Darts, Snooker|pool|billiards, Climbing|rock climbing|bouldering, Rowing, Sailing",
      "Fencing, Archery, Polo, Water polo, Curling, Field hockey, Squash, Triathlon, Marathon, Javelin, High jump, Long jump, Pole vault, Horse riding|equestrian|show jumping|dressage, Figure skating, Bobsleigh|bobsled, Luge, Biathlon, Decathlon, Kayaking|canoeing, Diving, Taekwondo, Dodgeball, Ultimate frisbee|ultimate, Netball, Kickboxing, MMA|mixed martial arts, Pickleball, Sumo, Croquet",
      "Sepak takraw, Hurling, Kabaddi, Korfball, Bandy, Jai alai, Skeleton, Quidditch|quadball, Bossaball, Underwater hockey, Chess boxing, Shinty, Pesapallo|pesäpallo, Floorball, Teqball, Caber toss, Gaelic football, Aussie rules|australian rules football, Roller derby, Canoe polo, Cornhole, Petanque|pétanque|boules|bocce, Real tennis, Fistball",
    ],
    misses: { chess: "Chess is a game, but this one wants a sport.", esports: "Name one physical sport." },
  },
  {
    id: "instrument",
    prompt: "Name a musical instrument.",
    gem: "Theremin",
    tiers: [
      "Guitar, Piano, Drum|drums, Violin, Flute, Trumpet, Saxophone|sax",
      "Bass guitar|bass, Cello, Clarinet, Harp, Keyboard, Ukulele, Trombone, Harmonica, Xylophone, Accordion, Banjo, Tuba, Recorder, Tambourine, Triangle, Organ, Synthesizer|synth, French horn|horn, Viola",
      "Oboe, Bassoon, Double bass|upright bass|contrabass, Mandolin, Bagpipes, Harpsichord, Glockenspiel, Marimba, Bongos|bongo, Cymbal, Castanets, Maracas, Kazoo, Sitar, Timpani, Piccolo, Cornet, Bugle, Didgeridoo, Steel drum|steel pan, Cajon, Djembe, Lute, Melodica, Euphonium",
      "Theremin, Hurdy-gurdy|hurdy gurdy, Erhu, Koto, Shamisen, Oud, Balalaika, Kalimba|thumb piano, Handpan|hang drum, Zither, Dulcimer, Ocarina, Sousaphone, Celesta, Contrabassoon, Tabla, Bouzouki, Shakuhachi, Gamelan, Nyckelharpa, Glass harmonica, Mbira, Washboard, Cowbell, Vibraphone, Autoharp, Lyre, Pan flute|panpipes",
    ],
  },
  {
    id: "dog",
    prompt: "Name a dog breed.",
    gem: "Komondor",
    tiers: [
      "Labrador|labrador retriever|lab, Golden retriever, German shepherd|alsatian, Poodle, Bulldog, Chihuahua, Husky|siberian husky, Beagle",
      "Pug, Dachshund|sausage dog, Rottweiler, Boxer, Corgi, Shih tzu, Border collie, French bulldog|frenchie, Yorkshire terrier|yorkie, Great dane, Dalmatian, Doberman, Pomeranian, Cocker spaniel|spaniel, Maltese, Collie, Pit bull|pitbull, Jack russell|jack russell terrier, Greyhound, Labradoodle, Cavalier king charles spaniel|cavalier, Bernese mountain dog",
      "Saint bernard|st bernard, Akita, Shiba inu|shiba, Samoyed, Australian shepherd|aussie, Bichon frise, Bloodhound, Basset hound, Whippet, Weimaraner, Schnauzer, Newfoundland, Mastiff, Chow chow, Old english sheepdog|sheepdog, Staffordshire bull terrier|staffy, Bull terrier, Cockapoo, Irish setter, Vizsla, West highland terrier|westie, Scottish terrier|scottie, Afghan hound, Boston terrier, Alaskan malamute|malamute, Papillon, Havanese, Shar pei, Rhodesian ridgeback",
      "Komondor, Basenji, Xoloitzcuintli|xolo, Puli, Borzoi, Saluki, Otterhound, Lagotto romagnolo, Leonberger, Tibetan mastiff, Pharaoh hound, Chinese crested, Affenpinscher, Bergamasco, Catahoula, Kooikerhondje, Dandie dinmont terrier, Sloughi, Norwegian lundehund|lundehund, Azawakh, Mudi, Bedlington terrier",
    ],
  },
  {
    id: "europe",
    prompt: "Name a country in Europe.",
    note: "The UK's four nations count, and so do countries that span Europe and Asia.",
    gem: "Liechtenstein",
    tiers: [
      "France, Germany, Italy, Spain, United Kingdom|uk|britain|great britain, England, Portugal, Greece",
      "Netherlands|holland, Belgium, Switzerland, Austria, Sweden, Norway, Denmark, Finland, Poland, Ireland, Russia, Ukraine, Scotland, Wales, Iceland, Croatia, Czechia|czech republic, Hungary, Turkey|turkiye",
      "Romania, Bulgaria, Serbia, Slovakia, Slovenia, Estonia, Latvia, Lithuania, Luxembourg, Monaco, Albania, Belarus, Bosnia and Herzegovina|bosnia, Cyprus, Malta, Northern Ireland, Vatican City|vatican|holy see, Montenegro",
      "Liechtenstein, Andorra, San Marino, Moldova, North Macedonia|macedonia, Kosovo, Georgia, Armenia, Azerbaijan, Kazakhstan",
    ],
    misses: { europe: "Europe is the continent; name one of its countries.", "european union": "Name one country of the EU." },
  },
  {
    id: "colour",
    prompt: "Name a colour.",
    gem: "Glaucous",
    tiers: [
      "Red, Blue, Green, Yellow, Purple, Orange, Pink, Black, White",
      "Brown, Grey|gray, Gold, Silver, Violet, Turquoise, Navy|navy blue, Maroon, Beige, Cyan, Magenta, Teal, Lavender, Indigo, Cream, Tan, Lime",
      "Crimson, Scarlet, Burgundy, Aqua, Coral, Salmon, Khaki, Olive, Mint, Peach, Lilac, Mauve, Ivory, Charcoal, Emerald, Sapphire, Ruby, Amber, Bronze, Copper, Rose, Fuchsia, Plum, Cerulean, Ochre|ocher, Mustard, Sky blue, Royal blue, Sage, Rust, Taupe, Periwinkle",
      "Glaucous, Chartreuse, Vermilion, Puce, Heliotrope, Celadon, Viridian, Cinnabar, Gamboge, Aubergine, Carmine, Cobalt, Ultramarine, Sepia, Umber, Sienna, Eggshell, Ecru, Mahogany, Wenge, Xanadu, Zaffre, Coquelicot, Amaranth, Byzantium, Celeste, Verdigris, Lapis lazuli|lapis, Gunmetal, Saffron",
    ],
  },
  {
    id: "kitchen",
    prompt: "Name something you'd find in a kitchen.",
    gem: "Spurtle",
    tiers: [
      "Fridge|refrigerator, Oven, Stove|cooker|hob, Sink, Knife, Fork, Spoon, Plate, Microwave",
      "Kettle, Toaster, Frying pan|pan|skillet, Saucepan|pot, Cup, Mug, Bowl, Glass, Dishwasher, Cutting board|chopping board, Blender, Spatula, Freezer, Table, Chair, Cupboard|cabinet, Oven glove|oven mitt, Tea towel|dish towel, Sponge, Bin|trash can|garbage can, Whisk, Ladle, Tongs, Colander, Grater, Peeler",
      "Rolling pin, Can opener|tin opener, Bottle opener, Corkscrew, Measuring cup, Kitchen scale|scales, Timer, Apron, Mixing bowl, Baking tray|baking sheet, Muffin tin, Sieve|strainer, Food processor, Coffee machine|coffee maker, Slow cooker|crockpot, Air fryer, Rice cooker, Pressure cooker, Wok, Casserole dish, Teapot, Salt shaker, Pepper grinder|pepper mill, Spice rack, Napkin, Tray, Extractor fan|range hood, Cling film|plastic wrap, Tin foil|foil|aluminium foil",
      "Spurtle, Mandoline, Mortar and pestle|mortar|pestle, Zester|microplane, Garlic press, Potato masher|masher, Salad spinner, Pastry brush, Piping bag, Egg timer, Nutcracker, Ramekin, Dutch oven, Cleaver, Butter dish, Bread bin|bread box, Trivet, Splatter guard, Meat thermometer, Apple corer, Melon baller, Fish slice, Egg slicer, Lemon squeezer|juicer, French press|cafetiere, Tagine, Kitchen roll|paper towel",
    ],
  },
  {
    id: "game",
    prompt: "Name a board game or card game.",
    gem: "Hnefatafl",
    tiers: [
      "Monopoly, Chess, Scrabble, Uno, Checkers|draughts, Poker, Cluedo|clue",
      "Snakes and ladders|chutes and ladders, Connect four|connect 4, Battleship, Risk, Trivial pursuit, Jenga, Catan|settlers of catan, Solitaire|patience, Blackjack, Go fish, Snap, Bingo, Backgammon, Ludo, Guess who, Operation, Sorry, Yahtzee, Dominoes, Pictionary, Twister, Cards against humanity, Mahjong",
      "Go, Rummy, Bridge, Hearts, Spades, Crazy eights, Mouse trap, Game of life|the game of life, Ticket to ride, Carcassonne, Pandemic, Codenames, Exploding kittens, Boggle, Mastermind, Othello|reversi, Cribbage, Canasta, War, Old maid, Scattergories, Taboo, Articulate, Kerplunk, Hungry hippos|hungry hungry hippos, Stratego",
      "Hnefatafl, Azul, Wingspan, Gloomhaven, Dixit, Agricola, Terraforming mars, Splendor, Dominion, Twilight imperium, Puerto rico, 7 wonders|seven wonders, Mancala, Shogi, Xiangqi|chinese chess, Nine men's morris, Pinochle, Euchre, Bezique, Skat, Baccarat, Coup, Love letter, Sushi go, Root, Diplomacy",
    ],
  },
  {
    id: "bird",
    prompt: "Name a bird.",
    gem: "Shoebill",
    tiers: [
      "Eagle, Pigeon, Parrot, Owl, Penguin, Chicken, Duck, Robin",
      "Sparrow, Crow, Seagull|gull, Swan, Flamingo, Peacock|peafowl, Hawk, Falcon, Ostrich, Turkey, Goose, Blue jay|jay, Hummingbird, Woodpecker, Blackbird, Pelican, Toucan, Canary, Magpie, Vulture, Budgie|budgerigar|parakeet, Emu, Kiwi, Raven, Dove, Starling, Kingfisher, Heron",
      "Albatross, Puffin, Cardinal, Finch, Wren, Swallow, Stork, Crane, Macaw, Cockatoo, Condor, Kookaburra, Osprey, Kestrel, Buzzard, Pheasant, Partridge, Quail, Ibis, Egret, Cormorant, Blue tit|great tit|tit, Nightingale, Skylark|lark, Mockingbird, Oriole, Roadrunner, Cassowary, Rhea, Dodo",
      "Shoebill, Hoatzin, Kakapo, Quetzal, Secretary bird, Bowerbird, Frigatebird, Blue-footed booby|booby, Lammergeier|bearded vulture, Potoo, Hoopoe, Oxpecker, Lyrebird, Moa, Bittern, Nuthatch, Treecreeper, Dipper, Wagtail, Plover, Curlew, Avocet, Sandpiper, Shrike, Tanager, Bee-eater, Cock-of-the-rock, Kea, Tui",
    ],
    misses: { bat: "Bats fly, but they're mammals.", pterodactyl: "Pterosaurs were reptiles, not birds." },
  },
  {
    id: "job",
    prompt: "Name a job.",
    gem: "Luthier",
    tiers: [
      "Doctor, Teacher, Nurse, Police officer|policeman|policewoman|police|cop, Firefighter|fireman, Chef|cook, Lawyer, Farmer",
      "Engineer, Dentist, Pilot, Accountant, Scientist, Artist, Musician|singer, Actor|actress, Plumber, Electrician, Builder, Mechanic, Waiter|waitress, Cashier, Programmer|software developer|developer|coder, Vet|veterinarian, Architect, Soldier, Baker, Hairdresser|barber, Journalist, Writer|author, Photographer, Driver|taxi driver|bus driver, Judge, Pharmacist, Cleaner, Banker, Astronaut, Secretary",
      "Librarian, Carpenter, Butcher, Florist, Surgeon, Psychologist, Therapist, Paramedic, Lifeguard, Postman|mail carrier|postal worker, Translator, Designer, Tailor, DJ, Sailor, Fisherman, Miner, Janitor, Gardener, Receptionist, Zookeeper, Optician, Physiotherapist, Dancer, Comedian, Model, Painter, Sculptor, Athlete, Coach, Professor, Economist, Politician, Detective",
      "Luthier, Sommelier, Cartographer, Actuary, Chimney sweep, Farrier, Cooper, Blacksmith, Glassblower, Taxidermist, Mortician|embalmer, Lexicographer, Archivist, Falconer, Beekeeper|apiarist, Stenographer, Lighthouse keeper, Cobbler, Milliner, Saddler, Stonemason, Thatcher, Puppeteer, Ornithologist, Seismologist, Glazier, Wheelwright, Auctioneer, Croupier, Foley artist, Ventriloquist, Cryptographer",
    ],
  },
  {
    id: "body",
    prompt: "Name a part of the human body.",
    gem: "Philtrum",
    tiers: [
      "Head, Hand, Arm, Leg, Foot, Eye, Nose, Mouth, Ear, Heart",
      "Finger, Toe, Knee, Elbow, Shoulder, Neck, Back, Stomach|belly|tummy, Chest, Hair, Tooth|teeth, Tongue, Lip, Brain, Lung, Liver, Skin, Hip, Wrist, Ankle, Chin, Cheek, Forehead, Thumb, Bone, Kidney, Fingernail|nail, Eyebrow",
      "Heel, Palm, Knuckle, Eyelash, Eyelid, Nostril, Jaw, Spine, Rib, Skull, Pelvis, Thigh, Calf, Shin, Waist, Belly button|navel, Armpit, Throat, Gum, Intestine|gut|bowel, Bladder, Pancreas, Appendix, Muscle, Vein, Artery, Collarbone|clavicle, Temple, Earlobe, Scalp",
      "Philtrum, Uvula, Spleen, Gallbladder, Thyroid, Femur, Tibia, Fibula, Humerus, Sternum, Coccyx|tailbone, Patella|kneecap, Larynx|voice box, Pharynx, Oesophagus|esophagus, Diaphragm, Cornea, Retina, Iris, Pupil, Septum, Tragus, Lunula, Achilles tendon|achilles, Cerebellum, Hypothalamus, Epiglottis, Metatarsal, Scapula|shoulder blade",
    ],
  },
  {
    id: "breakfast",
    prompt: "Name a breakfast food.",
    gem: "Congee",
    tiers: [
      "Egg, Toast, Cereal, Pancake, Bacon, Porridge|oatmeal|oats, Yogurt|yoghurt",
      "Waffle, Croissant, Bagel, Fruit, Sausage, Muffin, French toast, Granola, Smoothie, Scrambled eggs, Fried egg, Omelette|omelet, Bread, Banana, Hash brown, Baked beans|beans, Muesli, Avocado toast, Cornflakes",
      "Eggs benedict, Crumpet, English muffin, Pain au chocolat, Cinnamon roll|cinnamon bun, Doughnut|donut, Grits, Biscuits and gravy, Breakfast burrito, Mushroom, Grilled tomato, Black pudding, Shakshuka, Chia pudding, Overnight oats, Jam|toast with jam, Peanut butter, Honey, Fruit salad, Pop-tart|pop tart, Danish|danish pastry, Scone, Brioche, Crepe|crêpe, Full english|fry up|fry-up",
      "Congee, Kedgeree, Kippers|kipper, Natto, Chilaquiles, Huevos rancheros, Menemen, Ful medames|ful, Idli, Dosa, Poha, Paratha, Laverbread, Haggis, Scrapple, Lox, Khachapuri, Arepa, Gallo pinto, Skyr, Tamagoyaki, Bircher muesli|bircher, Kaya toast, Roti canai, Youtiao, Uttapam",
    ],
  },
  {
    id: "insect",
    prompt: "Name an insect.",
    gem: "Treehopper",
    tiers: [
      "Ant, Bee, Butterfly, Fly, Mosquito, Ladybug|ladybird, Beetle",
      "Wasp, Grasshopper, Cockroach|roach, Moth, Dragonfly, Cricket, Caterpillar, Termite, Flea, Bumblebee, Firefly|lightning bug, Stick insect, Praying mantis|mantis, Louse|lice|head lice, Hornet, Bed bug|bedbug, Locust, Cicada, Earwig",
      "Silverfish, Aphid|greenfly, Weevil, Stag beetle, Dung beetle, Gnat, Horsefly, Housefly, Fruit fly, Mayfly, Damselfly, Scarab, Bluebottle, Hoverfly, Leafhopper, Pond skater|water strider, Lacewing, Sawfly, Katydid, Mealworm, Stink bug|shield bug",
      "Treehopper, Hercules beetle, Goliath beetle, Atlas moth, Bombardier beetle, Assassin bug, Antlion, Caddisfly, Stonefly, Scorpionfly, Thrips, Mealybug, Cochineal, Lanternfly|lantern fly, Leaf insect|walking leaf, Bullet ant, Orchid mantis, Giant water bug, Silkworm|silk moth, Botfly, Tsetse fly, Glowworm, Boxelder bug, Jewel beetle, Rhinoceros beetle",
    ],
    misses: {
      spider: "Spiders have eight legs: they're arachnids, not insects.",
      scorpion: "Scorpions are arachnids, not insects.",
      tick: "Ticks are arachnids, not insects.",
      centipede: "Centipedes have far too many legs to be insects.",
      worm: "Worms aren't insects.",
      snail: "Snails are molluscs.",
    },
  },
  {
    id: "flower",
    prompt: "Name a flower.",
    gem: "Protea",
    tiers: [
      "Rose, Tulip, Sunflower, Daisy, Lily, Orchid",
      "Daffodil, Poppy, Lavender, Carnation, Dandelion, Lotus, Marigold, Iris, Violet, Hibiscus, Jasmine, Peony, Hydrangea, Chrysanthemum, Buttercup, Bluebell, Cherry blossom|sakura, Lilac, Magnolia, Pansy, Geranium, Forget-me-not",
      "Begonia, Petunia, Dahlia, Gerbera, Freesia, Gardenia, Camellia, Azalea, Rhododendron, Snowdrop, Crocus, Foxglove, Honeysuckle, Primrose, Zinnia, Cosmos, Aster, Snapdragon, Sweet pea, Morning glory, Wisteria, Edelweiss, Bird of paradise, Heather, Clover, Thistle, Anemone, Gladiolus",
      "Protea, Frangipani|plumeria, Hellebore, Ranunculus, Amaryllis, Anthurium, Agapanthus, Alstroemeria, Lisianthus, Bougainvillea, Columbine, Delphinium|larkspur, Hollyhock, Verbena, Nasturtium, Calendula, Corpse flower|rafflesia|titan arum, Gentian, Cyclamen, Statice, Yarrow, Stephanotis, Red hot poker|kniphofia, Passionflower, Oleander, Love-in-a-mist|nigella, Trillium",
    ],
  },
  {
    id: "car",
    prompt: "Name a car brand.",
    gem: "Trabant",
    tiers: [
      "Toyota, Ford, BMW, Mercedes|mercedes-benz|merc, Honda, Volkswagen|vw, Tesla, Audi, Ferrari",
      "Nissan, Chevrolet|chevy, Hyundai, Kia, Porsche, Lamborghini, Mazda, Jeep, Volvo, Fiat, Peugeot, Renault, Subaru, Land rover|range rover, Jaguar, Lexus, Mini, Dodge, Bentley, Rolls-royce|rolls royce, Maserati, Bugatti, Mitsubishi, Skoda|škoda, Suzuki, Vauxhall|opel, Citroen|citroën, Seat, Cadillac, Buick, GMC",
      "Aston martin, McLaren, Alfa romeo, Lotus, Chrysler, Lincoln, Infiniti, Acura, Genesis, Dacia, Smart, Polestar, Rivian, BYD, Ram, Pagani, Koenigsegg, Lucid, Cupra, DS, Saab, Lada, Daewoo, Holden, Pontiac, Hummer",
      "Trabant, Tata, Mahindra, Proton, Perodua, Geely, NIO, Chery, Great wall, Hongqi, Zastava, Wartburg, DeLorean, Studebaker, Oldsmobile, Plymouth, Morgan, TVR, Caterham, Noble, Spyker, Rimac, Scion, Isuzu, Maybach, Lancia, Abarth, SsangYong|kgm",
    ],
  },
  {
    id: "us-state",
    prompt: "Name a US state.",
    gem: "Wyoming",
    tiers: [
      "California, Texas, Florida, New York, Hawaii, Alaska",
      "Washington, Nevada, Arizona, Colorado, Illinois, Ohio, Georgia, Michigan, Massachusetts, Pennsylvania, New Jersey, Virginia, North Carolina, Louisiana, Oregon, Utah, Tennessee, Kentucky, Minnesota",
      "Alabama, Mississippi, South Carolina, Missouri, Kansas, Oklahoma, Indiana, Wisconsin, Iowa, Nebraska, Arkansas, Maryland, Connecticut, Maine, Montana, Idaho, New Mexico, West Virginia, Vermont, New Hampshire, Rhode Island",
      "Wyoming, Delaware, North Dakota, South Dakota",
    ],
    misses: { "washington dc": "Washington, D.C. is a federal district, not a state. Plain Washington counts.", "puerto rico": "Puerto Rico is a US territory, not a state." },
  },
  {
    id: "capital",
    prompt: "Name the capital city of any country.",
    gem: "Ngerulmud",
    tiers: [
      "London, Paris, Tokyo, Washington|washington dc|washington d c, Rome, Berlin, Madrid, Moscow, Beijing",
      "Ottawa, Canberra, Dublin, Amsterdam, Brussels, Vienna, Athens, Lisbon, Stockholm, Oslo, Copenhagen, Helsinki, Warsaw, Prague, Budapest, Cairo, New Delhi|delhi, Seoul, Bangkok, Mexico City, Buenos Aires, Brasilia|brasília, Lima, Santiago, Bogota|bogotá, Havana, Nairobi, Jerusalem, Ankara, Tehran, Baghdad, Kyiv|kiev, Bern|berne, Reykjavik|reykjavík, Wellington, Manila, Jakarta, Hanoi, Singapore",
      "Bucharest, Sofia, Belgrade, Zagreb, Ljubljana, Bratislava, Tallinn, Riga, Vilnius, Minsk, Luxembourg, Monaco, Valletta, Nicosia, Tirana, Sarajevo, Skopje, Podgorica, Kabul, Islamabad, Kathmandu, Dhaka, Colombo, Kuala Lumpur, Phnom Penh, Vientiane, Taipei, Ulaanbaatar|ulan bator, Riyadh, Doha, Abu Dhabi, Muscat, Kuwait City, Amman, Beirut, Damascus, Rabat, Algiers, Tunis, Tripoli, Khartoum, Addis Ababa, Kampala, Kigali, Dakar, Accra, Abuja, Pretoria, Cape Town, Harare, Lusaka, Luanda, Kinshasa, Caracas, Quito, Montevideo, La Paz, Asuncion|asunción, Panama City, San Jose|san josé, Kingston, Santo Domingo, Port-au-Prince|port au prince, Tbilisi, Yerevan, Baku, Chisinau|chișinău, Vatican City, San Marino, Andorra la Vella, Vaduz, Manama, Sanaa|sana'a, Pyongyang, Astana",
      "Ngerulmud, Thimphu, Naypyidaw|nay pyi taw, Male|malé, Dili, Bandar Seri Begawan, Port Moresby, Suva, Honiara, Apia, Nuku'alofa|nukualofa, Funafuti, Tarawa|south tarawa, Majuro, Palikir, Port Vila, Bishkek, Dushanbe, Ashgabat, Tashkent, Ouagadougou, Bamako, Niamey, N'Djamena|ndjamena, Nouakchott, Banjul, Bissau, Conakry, Freetown, Monrovia, Yamoussoukro, Lome|lomé, Porto-Novo|porto novo, Libreville, Malabo, Yaounde|yaoundé, Bangui, Brazzaville, Gitega, Juba, Asmara, Djibouti, Mogadishu, Antananarivo, Moroni, Victoria, Port Louis, Maputo, Lilongwe, Gaborone, Windhoek, Maseru, Mbabane, Praia, Sao Tome|são tomé, Bridgetown, Castries, Kingstown, St George's|saint georges, Basseterre, St John's|saint johns, Roseau, Nassau, Belmopan, Tegucigalpa, Managua, San Salvador, Guatemala City, Paramaribo, Georgetown, Port of Spain, Sucre",
    ],
    misses: {
      sydney: "Sydney is Australia's biggest city; the capital is Canberra.",
      istanbul: "Istanbul is Turkey's biggest city; the capital is Ankara.",
      "new york": "New York isn't a capital; the US capital is Washington.",
      toronto: "Toronto isn't Canada's capital; that's Ottawa.",
      "rio de janeiro": "Rio was Brazil's capital until 1960; it's Brasília now.",
      zurich: "Zurich is Switzerland's biggest city; the capital is Bern.",
      mumbai: "Mumbai isn't India's capital; that's New Delhi.",
      edinburgh: "Edinburgh is Scotland's capital, but Scotland isn't a sovereign country here. Try London.",
    },
  },
  {
    id: "element",
    prompt: "Name a chemical element.",
    gem: "Tennessine",
    tiers: [
      "Hydrogen, Oxygen, Carbon, Gold, Iron, Helium, Nitrogen",
      "Silver, Copper, Sodium, Calcium, Neon, Aluminium|aluminum, Uranium, Lead, Mercury, Chlorine, Potassium, Zinc, Sulfur|sulphur, Platinum, Magnesium, Lithium, Tin, Plutonium, Titanium, Silicon, Phosphorus, Nickel, Iodine, Fluorine, Argon, Radium, Cobalt",
      "Chromium, Manganese, Tungsten, Krypton, Xenon, Radon, Boron, Beryllium, Caesium|cesium, Barium, Bromine, Arsenic, Cadmium, Palladium, Osmium, Iridium, Bismuth, Antimony, Selenium, Strontium, Rubidium, Francium, Polonium, Americium, Einsteinium, Nobelium, Curium, Thorium, Gallium, Germanium, Indium, Tellurium, Vanadium, Zirconium, Molybdenum, Neptunium, Tantalum, Rhodium, Neodymium",
      "Tennessine, Scandium, Yttrium, Lanthanum, Cerium, Praseodymium, Promethium, Samarium, Europium, Gadolinium, Terbium, Dysprosium, Holmium, Erbium, Thulium, Ytterbium, Lutetium, Hafnium, Rhenium, Thallium, Astatine, Actinium, Protactinium, Berkelium, Californium, Fermium, Mendelevium, Lawrencium, Rutherfordium, Dubnium, Seaborgium, Bohrium, Hassium, Meitnerium, Darmstadtium, Roentgenium, Copernicium, Nihonium, Flerovium, Moscovium, Livermorium, Oganesson, Niobium, Ruthenium, Technetium",
    ],
    misses: { water: "Water is a compound of hydrogen and oxygen.", steel: "Steel is an alloy, mostly iron.", brass: "Brass is an alloy of copper and zinc.", bronze: "Bronze is an alloy, mostly copper." },
  },
  {
    id: "clothing",
    prompt: "Name an item of clothing.",
    gem: "Deerstalker",
    tiers: [
      "T-shirt|tshirt|shirt, Jeans, Trousers|pants, Dress, Skirt, Jacket, Sock, Shoe",
      "Hat, Coat, Jumper|sweater, Hoodie, Shorts, Scarf, Glove, Boot, Cap|baseball cap, Trainers|sneakers, Belt, Tie, Suit, Blouse, Pyjamas|pajamas, Underwear|boxers|briefs, Bra, Swimsuit|swimming costume|bathing suit, Sandal, Leggings, Vest|tank top, Cardigan, Beanie",
      "Blazer, Waistcoat, Poncho, Raincoat, Dungarees|overalls, Jumpsuit, Kimono, Sari, Kilt, Cape, Dressing gown|robe|bathrobe, Slipper, Flip-flop|flip flop, Bow tie, Mitten, Earmuffs, Tights, Stockings, Leotard, Tuxedo, Gown, Apron, Uniform, Parka, Trench coat, Polo shirt|polo, Crop top, Joggers|sweatpants|tracksuit bottoms, Tracksuit, Turtleneck|polo neck, Beret, Fedora, Bikini",
      "Deerstalker, Cravat, Ascot, Cummerbund, Spats, Galoshes, Plimsolls, Espadrilles, Moccasins, Loafers, Brogues, Clogs, Culottes, Jodhpurs, Lederhosen, Dirndl, Sarong, Kaftan|caftan, Dashiki, Hanbok, Cheongsam|qipao, Ao dai, Balaclava, Bolero, Corset, Petticoat, Crinoline, Sporran, Fez, Bowler hat|bowler, Panama hat, Snood, Tabard, Pinafore, Toga",
    ],
  },
  {
    id: "dessert",
    prompt: "Name a dessert.",
    gem: "Croquembouche",
    tiers: [
      "Ice cream, Cake|chocolate cake, Cookie, Brownie, Cheesecake, Apple pie|pie",
      "Tiramisu, Pudding, Doughnut|donut, Cupcake, Muffin, Crumble|apple crumble, Trifle, Chocolate mousse|mousse, Jelly|jello, Sundae, Waffle, Milkshake, Fruit salad, Carrot cake, Banana split, Creme brulee|crème brûlée, Macaron, Eclair|éclair, Sorbet, Frozen yogurt|froyo, Tart|lemon tart, Gelato, Fudge, Custard",
      "Pavlova, Baklava, Churro, Panna cotta, Profiterole|cream puff, Black forest cake|black forest gateau, Red velvet cake|red velvet, Key lime pie, Pecan pie, Pumpkin pie, Sticky toffee pudding, Bread and butter pudding, Rice pudding, Tres leches|tres leches cake, Mochi, Cannoli, Strudel|apple strudel, Eton mess, Banoffee pie|banoffee, Affogato, Flan, Souffle|soufflé, Mille-feuille|millefeuille|napoleon, Madeleine, Lava cake|molten chocolate cake, S'mores|smores, Gulab jamun, Halva|halwa, Kunafa|knafeh",
      "Croquembouche, Kouign-amann|kouign amann, Paris-brest, Clafoutis, Zabaglione, Semifreddo, Sachertorte, Linzer torte, Kulfi, Dango, Daifuku, Halo-halo, Bingsu, Pastel de nata|pasteis de nata, Brigadeiro, Alfajor, Galaktoboureko, Loukoumades, Ras malai|rasmalai, Jalebi, Qatayef, Basbousa, Cendol, Figgy pudding, Spotted dick, Syllabub, Cranachan, Posset, Blancmange, Baked alaska, Charlotte, Financier, Cassata",
    ],
  },
  {
    id: "cheese",
    prompt: "Name a cheese.",
    gem: "Casu marzu",
    tiers: [
      "Cheddar, Mozzarella, Parmesan|parmigiano reggiano, Brie, Feta, Swiss cheese|swiss",
      "Gouda, Camembert, Blue cheese, Cream cheese, Goat cheese|goats cheese|chevre, Edam, Emmental|emmentaler, Halloumi, Ricotta, Mascarpone, Gorgonzola, Stilton, Roquefort, Cottage cheese, American cheese, Provolone, Monterey jack",
      "Gruyere|gruyère, Manchego, Pecorino|pecorino romano, Burrata, Paneer, Wensleydale, Red leicester, Double gloucester, Havarti, Jarlsberg, Colby, Pepper jack, Queso fresco, Raclette, Comte|comté, Fontina, Asiago, Taleggio, Boursin, Babybel, Port salut, Munster|muenster, Limburger, Cheshire, Caerphilly, Lancashire, String cheese",
      "Casu marzu, Epoisses|époisses, Reblochon, Vacherin|mont d'or, Morbier, Tomme, Beaufort, Saint-nectaire, Livarot, Pont-l'eveque, Ossau-iraty, Idiazabal, Mahon, Cabrales, Torta del casar, Scamorza, Caciocavallo, Stracchino, Robiola, Castelmagno, Brunost|gjetost, Mimolette, Kefalotyri, Graviera, Oaxaca, Cotija, Stinking bishop, Shropshire blue, Cornish yarg|yarg, Tete de moine|tête de moine",
    ],
  },
  {
    id: "tree",
    prompt: "Name a kind of tree.",
    gem: "Dragon blood tree",
    tiers: [
      "Oak, Pine, Palm|palm tree, Apple tree|apple, Maple, Birch, Christmas tree|fir",
      "Willow, Cherry tree|cherry, Spruce, Cedar, Elm, Ash, Beech, Redwood, Sequoia, Eucalyptus, Coconut tree|coconut palm, Orange tree, Lemon tree, Poplar, Chestnut, Walnut, Olive tree|olive, Sycamore, Cypress, Baobab, Magnolia, Holly",
      "Yew, Larch, Hazel, Hawthorn, Rowan, Aspen, Alder, Hornbeam, Juniper, Acacia, Mahogany, Teak, Ebony, Ginkgo, Fig tree|fig, Mango tree, Avocado tree, Jacaranda, Dogwood, Linden|lime tree, Horse chestnut, Plane tree|plane, Monkey puzzle, Cork oak, Banyan, Sandalwood, Rubber tree, Joshua tree, Hemlock",
      "Dragon blood tree|dragon's blood tree, Wollemi pine, Bristlecone pine, Kauri, Kapok|ceiba, Rimu, Mangrove, Tamarind, Neem, Frangipani, Sassafras, Hickory, Pecan, Catalpa, Tulip tree, Sweetgum, Buckeye, Tupelo, Whitebeam, Service tree, Medlar, Mulberry, Persimmon, Stone pine|umbrella pine, Bald cypress, Sumac, Paulownia|empress tree",
    ],
    misses: { bamboo: "Bamboo is a giant grass, not a tree." },
  },
  {
    id: "superhero",
    prompt: "Name a superhero.",
    gem: "Squirrel Girl",
    tiers: [
      "Superman, Batman, Spider-man|spiderman|spider man, Iron man, Wonder woman, Captain america, Hulk|the hulk, Thor",
      "Black panther, The flash|flash, Aquaman, Wolverine, Deadpool, Black widow, Captain marvel, Green lantern, Doctor strange|dr strange, Ant-man|antman|ant man, Hawkeye, Robin, Scarlet witch, Groot, Rocket|rocket raccoon, Vision, Storm, Cyclops, Green arrow, Supergirl, Shazam, Star-lord|starlord, Gamora, Falcon, Daredevil, Professor x",
      "Cyborg, Batgirl, Nightwing, She-hulk|she hulk, Ms marvel, Silver surfer, Ghost rider, Punisher|the punisher, Blade, Jean grey|phoenix, Beast, Gambit, Rogue, Nightcrawler, Iceman, Colossus, Hellboy, The thing|thing, Human torch, Mister fantastic|mr fantastic, Invisible woman, War machine, Quicksilver, Moon knight, Luke cage, Jessica jones, Iron fist, Martian manhunter, Blue beetle, Starfire, Beast boy, Hawkgirl, Zatanna, Catwoman",
      "Squirrel Girl, Dazzler, Adam warlock, Nova, Namor, Shang-chi|shang chi, Ironheart, Hawkman, Plastic man, Swamp thing, Spectre|the spectre, Doctor fate, Firestorm, Black canary, Huntress, Red hood, The question, Rorschach, Nite owl, Doctor manhattan|dr manhattan, Spawn, Invincible, Hit-girl|hit girl, Kick-ass|kick ass, Darkhawk, Howard the duck, Black bolt, Power girl, Booster gold, The tick|tick",
    ],
    misses: { joker: "The Joker is very much a villain.", thanos: "Thanos is a villain.", venom: "Venom is usually counted as a villain or anti-hero; try a hero." },
  },
  {
    id: "spice",
    prompt: "Name a spice or herb.",
    gem: "Asafoetida",
    tiers: [
      "Black pepper|pepper, Basil, Cinnamon, Garlic, Oregano, Chilli|chili|chili powder, Paprika, Ginger",
      "Cumin, Turmeric, Parsley, Thyme, Rosemary, Mint, Coriander|cilantro, Dill, Nutmeg, Curry powder|curry, Sage, Chives, Bay leaf|bay, Clove, Vanilla, Cayenne|cayenne pepper, Mustard, Saffron, Garam masala, Cardamom, Allspice",
      "Star anise|anise|aniseed, Fennel|fennel seed, Tarragon, Marjoram, Lemongrass, Sumac, Za'atar|zaatar, Chervil, Caraway, Fenugreek, Chinese five spice|five spice, Mace, Juniper, Smoked paprika, Chilli flakes|chili flakes|red pepper flakes, Onion powder, Garlic powder, Lavender, Wasabi, Horseradish, Sesame|sesame seed, Poppy seed, Celery salt, Lemon balm, Lime leaves|kaffir lime leaves, Curry leaves, Ras el hanout, Herbes de provence",
      "Asafoetida|hing, Nigella seeds|nigella|black seed|kalonji, Sichuan pepper|szechuan pepper, Grains of paradise, Long pepper, Ajwain, Amchur|mango powder, Galangal, Epazote, Lovage, Borage, Sorrel, Hyssop, Savory|summer savory, Angelica, Annatto|achiote, Mahlab, Berbere, Baharat, Dukkah, Shichimi togarashi|shichimi, Sansho, Shiso|perilla, Culantro, Rue, Tonka bean, Liquorice root|licorice root",
    ],
    misses: { salt: "Salt is a mineral, not a spice or herb.", sugar: "Sugar is a sweetener, not a spice." },
  },
  {
    id: "language",
    prompt: "Name a language.",
    gem: "Toki Pona",
    tiers: [
      "English, Spanish, French, German, Chinese|mandarin, Japanese, Italian",
      "Portuguese, Russian, Arabic, Hindi, Korean, Dutch, Greek, Swedish, Polish, Turkish, Latin, Hebrew, Cantonese, Danish, Norwegian, Finnish, Irish|irish gaelic|gaelic, Welsh, Thai, Vietnamese, Urdu, Bengali|bangla, Indonesian, Sign language|asl|bsl, Czech, Hungarian, Ukrainian",
      "Swahili, Tagalog|filipino, Persian|farsi, Punjabi, Tamil, Telugu, Malay, Romanian, Bulgarian, Serbian, Croatian, Icelandic, Estonian, Latvian, Lithuanian, Slovak, Slovenian, Catalan, Basque, Scottish gaelic, Afrikaans, Zulu, Yoruba, Amharic, Somali, Hausa, Nepali, Sanskrit, Esperanto, Klingon, Elvish|sindarin|quenya, Yiddish, Maori|te reo maori, Hawaiian, Gujarati, Marathi, Kurdish, Pashto, Mongolian, Khmer, Lao, Burmese",
      "Toki Pona, Navajo, Cherokee, Quechua, Guarani, Inuktitut, Sami, Faroese, Luxembourgish, Maltese, Romansh, Breton, Cornish, Manx, Occitan, Frisian, Sorbian, Ladino, Aramaic, Coptic, Sumerian, Akkadian, Tok pisin, Bislama, Wolof, Igbo, Xhosa, Tigrinya, Malagasy, Kinyarwanda, Dhivehi, Tibetan, Uyghur, Ainu, Dothraki, Volapuk|volapük, Lojban, Ewe, Sesotho|sotho, Setswana|tswana, Chichewa",
    ],
    misses: { python: "Programming languages don't count here; name a spoken or signed one.", javascript: "Programming languages don't count here; name a spoken or signed one.", java: "Programming languages don't count here; name a spoken or signed one." },
  },
  {
    id: "shape",
    prompt: "Name a shape.",
    gem: "Squircle",
    tiers: [
      "Circle, Square, Triangle, Rectangle, Star, Heart",
      "Oval, Diamond|rhombus, Pentagon, Hexagon, Octagon, Cube, Sphere, Cylinder, Cone, Pyramid, Crescent, Trapezium|trapezoid, Parallelogram, Semicircle, Arrow, Cross",
      "Heptagon, Nonagon, Decagon, Ellipse, Prism, Cuboid, Tetrahedron, Octahedron, Dodecahedron, Icosahedron, Torus|donut|doughnut, Kite, Spiral, Quadrilateral, Polygon, Hemisphere, Arc, Sector",
      "Squircle, Hendecagon|undecagon, Dodecagon, Trefoil, Quatrefoil, Deltoid, Rhomboid, Annulus, Lune, Reuleaux triangle, Frustum, Mobius strip|möbius strip, Klein bottle, Ellipsoid, Paraboloid, Hyperboloid, Lemniscate, Cardioid, Astroid, Tesseract|hypercube, Gomboc|gömböc, Superellipse, Oloid",
    ],
  },
  {
    id: "africa",
    prompt: "Name a country in Africa.",
    gem: "Comoros",
    tiers: [
      "Egypt, South Africa, Nigeria, Kenya, Morocco, Ethiopia",
      "Ghana, Algeria, Tunisia, Libya, Sudan, Somalia, Uganda, Tanzania, Zimbabwe, Madagascar, Senegal, Cameroon, Democratic Republic of the Congo|drc|dr congo|congo, Rwanda, Namibia, Botswana, Zambia, Angola, Mozambique, Ivory coast|cote d'ivoire|côte d'ivoire, Mali",
      "Niger, Chad, Burkina Faso, Benin, Togo, Liberia, Sierra Leone, Guinea, Gambia|the gambia, Malawi, Lesotho, Eswatini|swaziland, Mauritius, Seychelles, Cape Verde|cabo verde, Eritrea, Djibouti, South Sudan, Mauritania, Gabon, Burundi, Republic of the Congo|congo brazzaville|congo-brazzaville, Central African Republic|car",
      "Comoros, Equatorial Guinea, Guinea-Bissau|guinea bissau, Sao Tome and Principe|são tomé and príncipe|sao tome",
    ],
    misses: { africa: "Africa is the continent; name one of its countries.", sahara: "The Sahara is a desert across several countries." },
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

/**
 * The plausible singulars of a phrase's last word, so plurals match either way: "shoes" → shoe/sho, "cherries" →
 * cherry, "knives" → knife, "tomatoes" → tomato. Words like "swiss", "asparagus" or "chess" are left alone. Every
 * variant is tried, so a wrong guess among them never matters unless it is itself another answer.
 */
function singulars(key: string): string[] {
  const match = /(\w+)$/.exec(key);
  if (!match) return [key];
  const word = match[1];
  const stem = key.slice(0, key.length - word.length);
  if (word.length <= 3 || /(ss|us|is)$/.test(word) || !word.endsWith("s")) return [key];
  const forms = [word.slice(0, -1)];
  if (word.endsWith("es")) forms.push(word.slice(0, -2));
  if (word.endsWith("ies")) forms.push(`${word.slice(0, -3)}y`);
  if (word.endsWith("ves")) forms.push(`${word.slice(0, -3)}f`, `${word.slice(0, -3)}fe`);
  return [key, ...forms.map((form) => stem + form)];
}

function build(source: QuestionSource): Question {
  const answers: Answer[] = source.tiers.flatMap((list, index) =>
    list
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [name, ...aliases] = entry.split("|").map((part) => part.trim());
        const keys = [...new Set([name, ...aliases].map(normalize).flatMap(singulars).flatMap((key) => [key, compact(key)]))];
        return { name, tier: (index + 1) as Tier, keys };
      }),
  );
  const misses = new Map(Object.entries(source.misses ?? {}).map(([key, text]) => [compact(normalize(key)), text]));
  return { id: source.id, prompt: source.prompt, note: source.note, gem: source.gem, strict: source.strict, answers, misses };
}

export const QUESTIONS: Question[] = SOURCES.map(build);
const BY_ID = new Map(QUESTIONS.map((question) => [question.id, question]));
export const questionById = (id: string) => BY_ID.get(id) ?? null;

/** The dive for a charted answer, or null for a stop left unanswered. */
export function diveOf(questionId: string, answer: string | null, tier: Tier | null): Dive | null {
  if (tier === null || answer === null) return null;
  if (BY_ID.get(questionId)?.gem === answer) return "extraordinary";
  return (["familiar", "uncommon", "rare", "exceptional"] as const)[tier - 1];
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
  const forms = singulars(key).flatMap((form) => [form, compact(form)]);
  const exact = question.answers.find((answer) => forms.some((candidate) => answer.keys.includes(candidate)));
  if (exact) return { kind: "match", answer: exact, corrected: false };
  const reason = forms.map((form) => question.misses.get(form)).find(Boolean);
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
export type Stop = { question: string; input: string; answer: string | null; tier: Tier | null; points: number; timedOut?: boolean };

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
    stops.push({
      question: stop.question,
      input: String(stop.input ?? "").slice(0, 80),
      answer: answer?.name ?? null,
      tier: answer?.tier ?? null,
      points: answer ? TIERS[answer.tier].points : 0,
      timedOut: answer ? undefined : Boolean(stop.timedOut) || undefined,
    });
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

/** The round as a shareable text grid: one square per question, coloured by its dive. */
export function shareText(round: Round) {
  const score = roundScore(round);
  const marks = round.stops.map((stop) => {
    const dive = diveOf(stop.question, stop.answer, stop.tier);
    return dive ? DIVES[dive].mark : MISS_MARK;
  });
  return `The Descent · ${score}/${MAX_SCORE} · ${(score * METRES_PER_POINT).toLocaleString("en")} m\n${marks.join("")}\n${bandFor(score).name}`;
}
