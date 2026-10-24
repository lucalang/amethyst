/**
 * The in-app update log ("What's new"). This file is the single source of truth: every
 * user-visible feature or fix ships with an entry here, newest first. Dates are release
 * dates (YYYY-MM-DD). Links point at where the feature lives in the app; `action` items
 * offer a safe in-place preview instead of a link.
 */

export type ChangeLink = { href: string; label: string };
export type ChangeAction = "preview-intro";

export type ChangeItem = {
  text: string;
  /** Where to find it, in words ("Settings → Themes"). */
  where?: string;
  link?: ChangeLink;
  action?: ChangeAction;
};

export type ChangelogEntry = {
  /** Stable id, also used to remember which update was last seen. */
  id: string;
  date: string;
  title: string;
  summary: string;
  added?: ChangeItem[];
  improved?: ChangeItem[];
  fixed?: ChangeItem[];
};

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: "2026-10-24-achievements",
    date: "2026-10-24",
    title: "Achievements for your Arcade and archive milestones",
    summary: "A personal recognition system now tracks Arcade challenges, saved archive milestones and feature discoveries, with progress and earned dates on one page.",
    added: [
      {
        text: "Achievements recognize what you do across the six Arcade games, workspace notes and checklists, collection customization, templates, Showcase and the 3D artwork viewer. Progress is based on saved archive state and completed game runs. Earned achievements stay earned if you later change or remove the content that proved them. There are no rewards, currencies, levels or feature unlocks.",
        where: "Achievements",
        link: { href: "/achievements", label: "View achievements" },
      },
      {
        text: "See all milestones grouped into Arcade, Archive and Discovery. Filter to all, earned or in-progress achievements, and narrow Arcade milestones by game. Progress shows the best qualifying run or streak where a challenge is about one run, and earned milestones include their date.",
        where: "Arcade → Achievements, or Settings → Achievements",
        link: { href: "/achievements", label: "Open your progress" },
      },
      {
        text: "New unlocks appear in a small queued notification when you are not typing or playing. Turn achievement notifications off in Settings → Appearance; milestone tracking continues. An earned-achievements section is also available in Customize Home and starts hidden.",
        where: "Settings → Appearance, or Home → Customize Home",
        link: { href: "/settings/appearance", label: "Adjust notifications" },
      },
    ],
  },
  {
    id: "2026-10-24-arcade",
    date: "2026-10-24",
    title: "The Arcade: six games for a break",
    summary: "A new Arcade with 2048, Flutter, Snake, Sudoku, Fruit Slice and Tower Stacker. Your personal bests are saved to your account, and Sudoku remembers your puzzle.",
    added: [
      {
        text: "The Arcade gathers six quick games, each with a preview, a Play button and your personal record. Find it with the Arcade link at the bottom of Home. Every game follows your theme, has Back to Arcade and Home links, and can go full screen.",
        where: "Home → Arcade",
        link: { href: "/arcade", label: "Open Arcade" },
      },
      {
        text: "2048: slide tiles with the arrow keys, WASD or a swipe. Matching tiles merge once per move and a new tile appears only after a move that changed the board. Reach 2048 to win, then keep going or start over.",
        link: { href: "/arcade/2048", label: "Play 2048" },
      },
      {
        text: "Flutter: tap, click or press Space to keep a little gem-bird flying through gaps between crystal pillars. Touching a pillar or the ground ends the run, and a tap starts the next one right away.",
        link: { href: "/arcade/flutter", label: "Play Flutter" },
      },
      {
        text: "Snake: steer with the arrow keys or WASD, swipe on the board, or use the on-screen pad on touch screens. Eat to grow and speed up; walls and your own tail end the run. You can't reverse straight into yourself, and the speed is the same on every screen.",
        link: { href: "/arcade/snake", label: "Play Snake" },
      },
      {
        text: "Sudoku: Easy, Medium and Hard puzzles, each with exactly one solution. Type or tap digits, add pencil notes (Notes mode or Shift+digit), erase and undo. Conflicts are highlighted, givens can't be changed, and placing a digit clears that note from the same row, column and box. The timer runs only while you play, and your fastest time is kept for each difficulty.",
        link: { href: "/arcade/sudoku", label: "Play Sudoku" },
      },
      {
        text: "Your Sudoku is saved as you play, with its values, notes and time. Leave and come back later, even on another device, to continue where you stopped. Starting a new puzzle asks first if the current one isn't finished.",
        where: "Arcade → Sudoku",
      },
      {
        text: "Fruit Slice: drag the mouse or swipe through flying fruit. Slice three or more in one quick swipe for a combo bonus. Missing 3 fruit ends the run, and slicing a bomb (dark, with a red cross) ends it instantly.",
        link: { href: "/arcade/fruit-slice", label: "Play Fruit Slice" },
      },
      {
        text: "Tower Stacker: click, tap or press Space to drop the sliding block. Only the part that overlaps the block below stays and the rest falls away. Perfect drops keep the full width, and three or more perfect drops in a row widen the block again. The camera follows your tower as it grows.",
        link: { href: "/arcade/stacker", label: "Play Tower Stacker" },
      },
      {
        text: "Personal records for every game are saved to your account and shown on each game and in the Arcade. There are no leaderboards; only you see your scores.",
      },
    ],
    improved: [
      {
        text: "Action games and the Sudoku timer pause by themselves when you switch tabs or windows, and you can pause with P or the Pause button. Sound effects start only after you interact, and the speaker button mutes them everywhere in the Arcade. Decorative effects follow your animation setting and your system's reduced-motion preference.",
        where: "Any game → sound and full-screen buttons",
      },
      {
        text: "While you play, game keys such as the arrows and Space control the game instead of scrolling the page or triggering archive shortcuts. Everything works as before once you leave the game.",
      },
    ],
  },
  {
    id: "2026-10-24-themes-urls",
    date: "2026-10-24",
    title: "Five new themes and readable page addresses",
    summary: "Pick from five new light and dark themes, and pages now have addresses you can read, like /collections/anime and /entries/one-piece.",
    added: [
      {
        text: "Five new themes: Ocean Glass (deep-sea navy with aqua and coral), Crimson Night (near-black with crimson and steel), Monochrome OLED (true black and white, no color), Soft Sakura (light blossom pink) and Mint Paper (light cool mint). Your current theme stays as it is, and your own editor and heading colors still apply.",
        where: "Settings → Themes",
        link: { href: "/settings/themes", label: "Open Themes" },
      },
    ],
    improved: [
      {
        text: "Collections and entries now have readable addresses based on their names, such as /collections/anime and /entries/one-piece. Entries with the same name get a short number (one-piece-2).",
      },
      {
        text: "Saved links keep working: old addresses redirect to the new ones, and renaming a collection or entry keeps its previous address pointing to it.",
      },
    ],
  },
  {
    id: "2026-10-23-showcase",
    date: "2026-10-23",
    title: "Showcase, a closer look at artwork and artwork frames",
    summary: "Show off a collection’s artwork full screen, inspect any cover as a 3D card you can turn and zoom, and choose a decorative frame for it.",
    added: [
      {
        text: "Showcase turns a collection into a full-screen gallery of its artwork, with nothing else on screen. It shows exactly what your current search, filters and sort show; hide titles for an even cleaner wall. Exit (or Esc) returns you to the library right where you were.",
        where: "Any collection → Showcase",
        link: { href: "/", label: "Choose a collection" },
      },
      {
        text: "Artwork viewer: click any artwork in Showcase, or use View artwork on a library card, to see it fitted to the full screen. Zoom in, browse with the arrows, arrow keys or a swipe, and go browser-full-screen. Opening the entry itself still works as before.",
        where: "Showcase, or a library card → View artwork",
      },
      {
        text: "In the viewer, artwork becomes a 3D card: drag to turn and tilt it, pinch or scroll to zoom, and Reset view to straighten it. Switch 3D off for a flat, still view; it follows your animation setting and your system’s reduced-motion preference.",
        where: "Artwork viewer → 3D",
      },
      {
        text: "Artwork frames: pick No frame, Gilt edge, Amethyst filigree, Holographic edge or the animated Aurora trace, previewed on your own portrait and square covers. Frames appear in Showcase and the viewer, follow the 3D card as it turns, and never cover the picture.",
        where: "Settings → Artwork frames",
        link: { href: "/settings/frames", label: "Open Artwork frames" },
      },
    ],
  },
  {
    id: "2026-10-23-themes",
    date: "2026-10-23",
    title: "Themes, a calmer intro and a tighter Home",
    summary: "Five complete themes, control over how often the opening animation plays, a choosier cover fan, live search and this update log.",
    added: [
      {
        text: "Themes: Amethyst (still the default), Rose Noir, Paper & Ink (a light theme), Retro Terminal and Neon Arcade. Each one restyles backgrounds, surfaces, text, fonts, borders and accents, with a live preview. Your choice applies everywhere at once and follows your account.",
        where: "Settings → Themes",
        link: { href: "/settings/themes", label: "Open Themes" },
      },
      {
        text: "Choose how often the opening animation plays: every visit, once per day, once per week or never. Only a fresh load or reload counts as a visit. “Preview animation” plays it without using up today’s showing.",
        where: "Settings → Appearance → Opening animation",
        link: { href: "/settings/appearance#motion", label: "Open Appearance" },
        action: "preview-intro",
      },
      {
        text: "Pick which collections lend their artwork to the cover fan beside your greeting. Choosing none hides the fan.",
        where: "Home → Customize Home → Cover fan",
        link: { href: "/", label: "Go Home" },
      },
      {
        text: "New checklist and New folder keyboard shortcuts work in the open entry, next to New note. Rebind them like any other shortcut.",
        where: "Settings → Shortcuts",
        link: { href: "/settings/shortcuts", label: "Open Shortcuts" },
      },
      {
        text: "This update log. Open it any time from the megaphone button in the top bar or from Settings.",
        where: "Top bar → What’s new",
      },
    ],
    improved: [
      {
        text: "Every setting now has its own reset button and a “Changed” marker when it differs from the default. Resetting never touches your entries or notes.",
        where: "Settings",
        link: { href: "/settings", label: "Open Settings" },
      },
      {
        text: "Collection search updates as you type without reloading the page, and keeps your status, label and sort filters. Press Enter to search straight away.",
        where: "Any collection → Search",
      },
      {
        text: "Collection banners are larger and framed, with the title, icon and accent set into the artwork. Collections without a banner keep a compact header.",
        where: "Any collection with a banner",
      },
      {
        text: "Home is more compact, and the cover fan keeps square and portrait covers in shape, fits its column on every screen size and lifts more smoothly on hover.",
        where: "Home",
        link: { href: "/", label: "Go Home" },
      },
      {
        text: "Heading colors follow the theme until you pick your own, and custom fonts and heading colors are kept when you switch themes.",
        where: "Settings → Editor → Writing",
        link: { href: "/settings/editor#writing", label: "Open Editor settings" },
      },
    ],
  },
  {
    id: "2026-10-23-personalization",
    date: "2026-10-23",
    title: "A Home dashboard and a lot more to personalize",
    summary: "A new Home page, settings for nearly everything and collections with their own identity.",
    added: [
      {
        text: "Home dashboard: a greeting, a cover fan of your own artwork, a Continue card for the last thing you opened, Featured, Pinned favorites, Recently opened, Your collections, Upcoming tasks and At a glance.",
        where: "Home",
        link: { href: "/", label: "Go Home" },
      },
      {
        text: "Customize Home: write your own greeting, feature an entry or image, and reorder or hide sections.",
        where: "Home → Customize Home",
        link: { href: "/", label: "Go Home" },
      },
      {
        text: "Collection identity: an icon, accent color, banner and description for each collection.",
        where: "A collection’s menu → Edit collection",
        link: { href: "/settings/collections", label: "Open Collections" },
      },
      {
        text: "Settings got a sidebar and new pages: animation level, card shine, hover size and library density; editor font, size, spacing, width and heading colors; checklist behavior; rebindable keyboard shortcuts; and where the app opens.",
        where: "Settings",
        link: { href: "/settings", label: "Open Settings" },
      },
      {
        text: "Card info presets choose what library cards show: title, labels and progress.",
        where: "Settings → Appearance → Library",
        link: { href: "/settings/appearance#library", label: "Open Appearance" },
      },
      { text: "Workspace templates start new entries with your own folders, notes and checklists.", where: "Settings → Templates", link: { href: "/settings/templates", label: "Open Templates" } },
      { text: "Custom progress names, such as “quests” instead of “tasks”, per entry." },
      { text: "Arrange collections in the order you like, and delete a collection even when it still has entries." },
      { text: "Add several tasks at once with Add tasks, next to Add task in checklists and in the note editor toolbar." },
      { text: "A short opening animation the first time you open the app each day. Click or press any key to skip it." },
      { text: "Choose how pins look: on the artwork, or a clean cover with the pin in the card menu.", where: "Settings → Appearance → Library", link: { href: "/settings/appearance#library", label: "Open Appearance" } },
    ],
  },
  {
    id: "2026-10-22-cover-shapes",
    date: "2026-10-22",
    title: "Cover shapes",
    summary: "Covers can be portrait or square, and the app remembers your last choice.",
    added: [{ text: "Pick a portrait or square cover for each entry; new entries start with the shape you used last.", where: "New entry or Edit entry → Cover" }],
  },
  {
    id: "2026-10-19-collections",
    date: "2026-10-19",
    title: "Your own collections",
    summary: "Collections are now entirely yours to create, rename and delete.",
    added: [
      { text: "Create, rename and delete your own collections instead of using a fixed set.", where: "Top bar → New collection", link: { href: "/settings/collections", label: "Open Collections" } },
    ],
    improved: [{ text: "A cleaner look for collection pages and the collection bar." }],
  },
  {
    id: "2026-10-08-labels",
    date: "2026-10-08",
    title: "Labels per collection and per-file progress",
    summary: "Labels belong to a collection, filters match all selected labels, and you choose which files count toward progress.",
    added: [
      { text: "Labels are scoped to each collection, and filtering by several labels shows entries that have all of them.", where: "Any collection → Labels filter", link: { href: "/settings/labels", label: "Open Labels" } },
      { text: "Choose which notes and checklists count toward an entry’s cover progress." },
    ],
    fixed: [{ text: "Tasks written in Markdown notes now look the same as checklist tasks." }],
  },
  {
    id: "2026-10-03-empty-workspaces",
    date: "2026-10-03",
    title: "Clean slate for new entries",
    summary: "New entries start with an empty workspace.",
    improved: [{ text: "New entries open with an empty workspace instead of pre-made files." }],
  },
  {
    id: "2026-10-02-uploads",
    date: "2026-10-02",
    title: "Upload your own artwork",
    summary: "Covers and banners can come straight from your device.",
    added: [{ text: "Upload a cover or banner image from your device, as well as pasting a link.", where: "New entry or Edit entry → Cover / Banner" }],
  },
  {
    id: "2026-10-01-notes-and-labels",
    date: "2026-10-01",
    title: "Richer notes, labels and polish",
    summary: "Images and tasks inside notes, custom labels, and smoother interactions.",
    added: [
      { text: "Paste or drop images into notes, or embed them with ![[image]] links." },
      { text: "Task checkboxes inside notes, shown as To Do-style cards with round checks." },
      { text: "Custom labels for entries, with a label filter that shows counts." },
      { text: "Brackets and quotes close automatically while writing notes." },
    ],
    improved: [
      { text: "Livelier library cards: covers lift, glow and shine on hover." },
      { text: "Redesigned checklist task rows." },
    ],
  },
  {
    id: "2026-09-30-workspaces",
    date: "2026-09-30",
    title: "Amethyst Archives",
    summary: "A personal archive where every entry has its own workspace.",
    added: [
      { text: "A workspace for every entry, with nested folders, Markdown notes and checklists. Changes save automatically and unsaved drafts are recovered." },
      { text: "A live Markdown editor with colored headings and a formatting toolbar." },
      { text: "To Do-style checklists with task details: steps, due dates and notes." },
      { text: "Cover artwork from any public image link, loaded through a secure image proxy." },
      { text: "Accounts with sign-up, sign-in and password recovery by email." },
    ],
  },
];

export const LATEST_CHANGE_ID = CHANGELOG[0].id;

export function formatChangeDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
