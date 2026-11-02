/** The tour's beats in scroll order; the 3D scene builds one set piece per id (see `pieces/index.ts`). */
export type TourChapterId =
  | "opening"
  | "archive"
  | "todo"
  | "arcade"
  | "game-2048"
  | "game-flutter"
  | "game-snake"
  | "game-sudoku"
  | "game-fruit-slice"
  | "game-stacker"
  | "slots"
  | "vault"
  | "lab"
  | "sanctum"
  | "customization"
  | "achievements"
  | "closing";

export type TourChapter = {
  id: TourChapterId;
  /** Short name in the chapter rail. */
  label: string;
  eyebrow: string;
  title: string;
  /** Part of the title drawn in the Amethyst gradient. */
  accent?: string;
  body: string;
  tags: string[];
  link?: { href: string; label: string; adminOnly?: boolean };
  /** Sub-beat of another chapter: shares its rail entry and number. */
  part?: TourChapterId;
  /** Scroll length in viewport heights (default 2.3). */
  span?: number;
};

export const TOUR_CHAPTERS: TourChapter[] = [
  {
    id: "opening",
    label: "Amethyst",
    eyebrow: "Amethyst",
    title: "A private world for",
    accent: "everything you keep.",
    body: "Collections, tasks, games and a few secrets, gathered in one quiet place that is entirely yours.",
    tags: ["Archive", "To Do", "Arcade", "Customization"],
    span: 2,
  },
  {
    id: "archive",
    label: "Archive",
    eyebrow: "01 · Archive",
    title: "Every collection gets",
    accent: "its own shelf.",
    body: "Shelve games, books, films or anything else. Cover art brings each entry to life, and every entry opens into a workspace for notes and checklists.",
    tags: ["Collections", "Cover art", "Notes & checklists"],
    link: { href: "/collections", label: "Open the Archive" },
  },
  {
    id: "todo",
    label: "To Do",
    eyebrow: "02 · To Do",
    title: "Plan the day,",
    accent: "tick it off.",
    body: "Lists and groups for everything on your plate. My Day, Important and Planned gather tasks from every list, each task holds steps, notes and a due date, and changes sync between your devices.",
    tags: ["My Day", "Steps & notes", "Live sync"],
    link: { href: "/tasks", label: "Open To Do" },
  },
  {
    id: "arcade",
    label: "Arcade",
    eyebrow: "03 · Arcade",
    title: "Six games,",
    accent: "one arcade hall.",
    body: "Every cabinet keeps its own records, and qualifying runs pay coins. Spend them in the shops, where each game has skins, effects and art styles to try on before you buy.",
    tags: ["Six games", "Daily challenges", "Game shops"],
    link: { href: "/arcade", label: "Enter the Arcade" },
  },
  {
    id: "game-2048",
    label: "2048",
    eyebrow: "Arcade · 1 / 6",
    title: "Slide, merge,",
    accent: "reach 2048.",
    body: "Slide matching tiles together on a 3×3, 4×4 or 5×5 board. Unfinished rounds pick up where you left off, and everyone shares the same daily board.",
    tags: ["Three board sizes", "Daily board", "Saved rounds"],
    link: { href: "/arcade/2048", label: "Play 2048" },
    part: "arcade",
    span: 2.1,
  },
  {
    id: "game-flutter",
    label: "Flutter",
    eyebrow: "Arcade · 2 / 6",
    title: "Flutter",
    accent: "through the crystals.",
    body: "Tap to keep a little gem-bird aloft through the crystal pillars. Flight feels the same at any frame rate, and the daily course is the same for every player.",
    tags: ["One-tap flight", "Daily course", "Safe pausing"],
    link: { href: "/arcade/flutter", label: "Play Flutter" },
    part: "arcade",
    span: 2.1,
  },
  {
    id: "game-snake",
    label: "Snake",
    eyebrow: "Arcade · 3 / 6",
    title: "Eat, grow,",
    accent: "never bite your tail.",
    body: "Pick modes like Portal, Ghost or Landmines, or mix several in the Blender. Every mode, speed, board size and fruit amount keeps its own best.",
    tags: ["Modes", "Blender", "Three speeds"],
    link: { href: "/arcade/snake", label: "Play Snake" },
    part: "arcade",
    span: 2.1,
  },
  {
    id: "game-sudoku",
    label: "Sudoku",
    eyebrow: "Arcade · 4 / 6",
    title: "Nine by nine,",
    accent: "pure logic.",
    body: "Classic puzzles in three difficulties, plus one daily puzzle with a single solution for everyone. Entries, pencil marks and time are saved as you go.",
    tags: ["Three difficulties", "Daily puzzle", "Pencil marks"],
    link: { href: "/arcade/sudoku", label: "Play Sudoku" },
    part: "arcade",
    span: 2.1,
  },
  {
    id: "game-fruit-slice",
    label: "Fruit Slice",
    eyebrow: "Arcade · 5 / 6",
    title: "Swipe through",
    accent: "the fruit.",
    body: "Chain combos and steer clear of bombs in Classic, Arcade or Zen, or take on the seeded daily run. Cuts follow the whole swipe, even quick ones.",
    tags: ["Classic · Arcade · Zen", "Combos", "Daily run"],
    link: { href: "/arcade/fruit-slice", label: "Play Fruit Slice" },
    part: "arcade",
    span: 2.1,
  },
  {
    id: "game-stacker",
    label: "Tower Stacker",
    eyebrow: "Arcade · 6 / 6",
    title: "Stack it",
    accent: "sky-high.",
    body: "Drop each sliding block right on top; only the overlap stays. Play Classic or Casual rules, or build the seeded daily tower.",
    tags: ["Classic & Casual", "Daily tower", "Precise drops"],
    link: { href: "/arcade/stacker", label: "Play Tower Stacker" },
    part: "arcade",
    span: 2.1,
  },
  {
    id: "slots",
    label: "Coin Slots",
    eyebrow: "04 · Coin Slots",
    title: "Spin the reels,",
    accent: "know the odds.",
    body: "Coin Slots runs on coins earned in the Arcade, with the exact odds, every payout and your net result always on show.",
    tags: ["Exact odds", "Paytable", "Net result"],
    link: { href: "/arcade/slots", label: "Try Coin Slots" },
  },
  {
    id: "vault",
    label: "The Vault",
    eyebrow: "05 · The Vault",
    title: "Speak the code,",
    accent: "open the Vault.",
    body: "Found a secret code? Say it to the Vault: its rings line up, the iris opens and coins, rare cosmetics, badges or titles fly out of its core.",
    tags: ["Secret codes", "Word codes", "Rare rewards"],
    link: { href: "/vault", label: "Visit the Vault" },
    span: 2.4,
  },
  {
    id: "lab",
    label: "The Lab",
    eyebrow: "06 · The Lab",
    title: "Interfaces,",
    accent: "gone gently wrong.",
    body: "Five harmless experiments: a volume slider on a hill, a button too shy to be clicked, a date picker that wants your birthday in binary and more. Each has reset, exit and an easy mode.",
    tags: ["Uphill Volume", "The Shy Button", "Password Gauntlet"],
    link: { href: "/lab", label: "Enter the Lab" },
  },
  {
    id: "sanctum",
    label: "Sanctum",
    eyebrow: "07 · Admin panel",
    title: "Where the codes",
    accent: "are forged.",
    body: "Administrators get the Crimson Sanctum: live counters, every redemption and its audit log, and the Forge, where rewards become tokens sealed into a new secret code.",
    tags: ["Administrators only", "Live overview", "The Forge"],
    link: { href: "/admin", label: "Open the Sanctum", adminOnly: true },
  },
  {
    id: "customization",
    label: "Customization",
    eyebrow: "08 · Customization",
    title: "Make it",
    accent: "unmistakably yours.",
    body: "Ten themes from Retro Terminal to Soft Sakura, ornate artwork frames in a 3D viewer, avatar decorations, and a badge and title worn next to your name.",
    tags: ["Ten themes", "Artwork frames", "Badges & titles"],
    link: { href: "/customization", label: "Customize Amethyst" },
    span: 2.4,
  },
  {
    id: "achievements",
    label: "Achievements",
    eyebrow: "09 · Achievements",
    title: "Milestones",
    accent: "that pay out.",
    body: "Achievements grant coins, and the big milestones unlock exclusive frames, decorations, badges and titles. Some stay hidden until you discover them.",
    tags: ["Coin rewards", "Exclusive cosmetics", "Hidden achievements"],
    link: { href: "/achievements", label: "See achievements" },
  },
  {
    id: "closing",
    label: "Begin",
    eyebrow: "Amethyst",
    title: "Your world",
    accent: "is waiting.",
    body: "Your shelves, your lists, your high scores and every secret you find, all in one place that is yours alone.",
    tags: [],
    span: 1.8,
  },
];
