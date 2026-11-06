/**
 * The in-app update log ("What's new"): the single source of truth, newest first.
 * Each release has a short overview (intro + 3–5 highlights) shown on /whats-new and
 * detailed notes shown on /whats-new/<id>. Every user-visible change ships with a release
 * here in this same format.
 *
 * Dates: `date` is the RELEASE date — the calendar day (Europe/Zurich) of the first successful
 * production deployment that contained the change, not the day work started and never a date
 * taken from a migration filename (those are sequence numbers and may lie in the future).
 * Unreleased work uses the day it is expected to deploy and is corrected if that slips.
 * Date-only strings are formatted as UTC calendar days so no time zone can shift them.
 * Ids are stable keys and may contain an outdated date; never derive dates from them.
 */

export type ChangeKind = "new" | "improved" | "fixed";
export type ChangeLink = { href: string; label: string };
export type ChangeAction = "preview-intro";
export type ReleaseIcon = "megaphone" | "palette" | "box" | "medal" | "trophy" | "gamepad" | "link" | "image" | "home" | "shapes" | "folder" | "tag" | "upload" | "notebook" | "sparkles" | "tasks";

/** One line of the overview: a recognizable feature name and a short explanation. */
export type Highlight = { kind: ChangeKind; feature: string; text: string };

/** One topic of the full release notes. */
export type ReleaseNote = {
  title: string;
  body: string;
  points?: string[];
  /** Where to find it, in words ("Settings → Themes"). */
  where?: string;
  link?: ChangeLink;
  /** A safe in-place preview instead of (or next to) a link. */
  action?: ChangeAction;
};

export type Release = {
  /** Stable id: the detail page address and the "last seen" marker. Never change it. */
  id: string;
  date: string;
  title: string;
  intro: string;
  icon: ReleaseIcon;
  /** Breaking change or required action; shown on the overview and the detail page. */
  notice?: string;
  highlights: Highlight[];
  details: Partial<Record<ChangeKind, ReleaseNote[]>>;
};

export const CHANGE_KINDS: readonly ChangeKind[] = ["new", "improved", "fixed"];

export const CHANGELOG: readonly Release[] = [
  {
    id: "2026-11-06-home-default-order",
    date: "2026-11-06",
    title: "A tidier Home order",
    intro: "Home's default layout puts Upcoming tasks and Quick Notes ahead of Your collections.",
    icon: "home",
    highlights: [
      { kind: "improved", feature: "Home order", text: "After Welcome and Your spaces: Featured, Pinned favorites, Upcoming tasks, Quick Notes, then Your collections." },
      { kind: "improved", feature: "Existing sections", text: "Recently opened follows Your collections, My Day stays opt-in, and Achievements stays at the bottom." },
      { kind: "improved", feature: "Saved layouts", text: "Existing section orders and visibility preferences are unchanged. Reset layout uses the new default." },
    ],
    details: {
      improved: [{
        title: "The new default, not a reset",
        body: "Home starts with Welcome and Your spaces, followed by Featured, Pinned favorites, Upcoming tasks, Quick Notes and Your collections. Recently opened remains visible after Your collections, My Day remains opt-in, and Achievements stays last. The default applies to both Normal and Flashy Home and to Reset layout in Customize Home. Your saved arrangement, hidden sections and other preferences are preserved.",
        link: { href: "/", label: "Open Home" },
      }],
    },
  },
  {
    id: "2026-11-06-everyday-polish",
    date: "2026-11-06",
    title: "Small everyday fixes",
    intro: "A few refinements to search, keyboard navigation and Quick Notes, with Amethyst's existing design intact.",
    icon: "sparkles",
    highlights: [
      { kind: "fixed", feature: "Settings search", text: "Opening results with Arrow Down selects the first match; Arrow Up selects the last. Touch and pen selections keep search focused until you choose a result." },
      { kind: "improved", feature: "Quick Notes", text: "Dates sit below note titles on small screens, and list borders follow your theme." },
      { kind: "fixed", feature: "Catalog search", text: "Long unmatched searches wrap instead of overflowing, and search regions have screen-reader labels." },
      { kind: "fixed", feature: "To Do search", text: "Clearing search keeps the field focused. Escape clears only the search and respects text composition." },
      { kind: "improved", feature: "Keyboard navigation", text: "Skip to content has a focusable main-content target without adding an extra tab stop." },
    ],
    details: {
      fixed: [{
        title: "Search refinements",
        body: "Settings search no longer skips the first match when you reopen results with Arrow Down. Arrow Up starts at the last match. Touch and pen input now preserve focus when choosing a result, just like mouse input. Catalog search fields can shrink in tight layouts, long empty-state queries wrap, and each search region is labelled for assistive technology.",
        link: { href: "/settings", label: "Open Settings" },
      }, {
        title: "Keep typing after clearing To Do search",
        body: "The clear button returns focus to the search field. Escape clears the query without bubbling to other keyboard handlers, and is ignored during text composition.",
        link: { href: "/tasks", label: "Open To Do" },
      }],
      improved: [{
        title: "More room for note titles",
        body: "Quick Notes places the updated date on a second line on small screens while keeping the existing single-row layout on larger screens. List dividers and empty-state borders now use the theme's border color.",
        link: { href: "/notes", label: "Open Quick Notes" },
      }, {
        title: "Skip straight to content",
        body: "The main-content target can now receive keyboard focus through Skip to content, while staying out of the regular tab order.",
      }],
    },
  },
  {
    id: "2026-11-06-streak-flame",
    date: "2026-11-06",
    title: "A livelier streak flame",
    intro: "Minigame streaks now have a fixed spot next to the game's name and a flame that celebrates your first win of the day.",
    icon: "gamepad",
    highlights: [
      { kind: "improved", feature: "Streak placement", text: "The streak flame now sits right after the game's name in every minigame, on desktop and mobile." },
      { kind: "improved", feature: "Living flame", text: "Once you've played a game today, its flame flickers. Under reduced motion it stays still." },
      { kind: "new", feature: "Daily celebration", text: "After your first finished game of the day, the page dims, a flame rises, counts up your streak and flies into its place." },
    ],
    details: {
      new: [{
        title: "Once a day, after a real finish",
        body: "The celebration plays once per account and UTC day, after the first game the server confirms as finished (a recorded score, or a solved Sudoku). Retries, other tabs and later games that day do not replay it. With reduced motion it simply fades in, swaps the number and fades out. Streak rules, coins and recoveries are unchanged.",
        where: "Any minigame → the flame next to the game's name",
        link: { href: "/arcade", label: "Open the Arcade" },
      }],
    },
  },
  {
    id: "2026-11-06-stats-evolution",
    date: "2026-11-06",
    title: "Stats over time",
    intro: "See how your Stats and Amethyst's totals change by date.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "Evolution graphs", text: "Every stat has a date-based graph with values you can inspect by pointer or keyboard. Dots mark value changes only." },
      { kind: "new", feature: "Stat history", text: "View more opens the full graph and an exact date-and-value table." },
      { kind: "improved", feature: "Older Stats", text: "Recover older totals from retained dated records, with reconstructed history clearly distinguished from observed snapshots." },
    ],
    details: {
      new: [
        {
          title: "Date-based Stats",
          body: "Stats and Amethyst Stats now show the latest 30 recorded dates beneath each value. View more opens the full recorded history. Cosmetics granted counts all account–cosmetic ownerships, including shop purchases. Older collection, entry, note, task, reward and activity totals are reconstructed from retained dated records where possible. Deleted records/accounts and earlier status changes cannot be recovered, so reconstructed totals are labelled separately from observed snapshots. Progress and checklist completion use snapshots only. Personal history stays private; Amethyst history contains only aggregate totals. Snapshots are captured daily and when Stats is opened. Code history comes from actual Git snapshots. Missing dates are never filled in.",
          where: "Settings → Stats or Amethyst Stats",
          link: { href: "/settings/stats", label: "Open Stats" },
        },
      ],
    },
  },
  {
    id: "2026-11-06-flashy-update",
    date: "2026-11-06",
    title: "The Flashy update",
    intro: "A bolder way to see your Home, and a cinematic showcase that plays through a whole collection.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "Flashy Home", text: "Switch Home to a bold presentation with a drifting wall of your artwork, depth and motion." },
      { kind: "new", feature: "Collection showcase", text: "Play a full-screen 3D film of every entry in a collection, with an opening and a finale." },
    ],
    details: {
      new: [
        {
          title: "Flashy Home",
          body: "Customize Home now has a Presentation choice: Normal (the default) or Flashy. Flashy shows the same greeting, featured art, cover fan, sections, tasks, Quick Notes, My Day and collection links, with a moving wall of your covers, a jump bar to your collections and livelier sections.",
          points: [
            "Your section order and visibility apply in both presentations.",
            "Choose what drifts on the artwork wall: automatic, whole collections, or up to 36 hand-picked entries.",
            "Below the stage, cards rise into view as you scroll, posters tilt toward your pointer and collection cards catch a soft light.",
            "With reduced motion, or animations off, Flashy stays still.",
          ],
          where: "Home → Customize Home → Presentation → Artwork wall",
          link: { href: "/", label: "Go to Home" },
        },
        {
          title: "Collection showcase",
          body: "Press Play next to Showcase on a collection to watch every entry, in order and regardless of search or filters, fly past in a 3D film. Entries without artwork get a title card. It never starts on its own.",
          points: [
            "Pause, previous, next and a progress bar you can click or use with the keyboard.",
            "Entries keep their artwork frame on stage, ornaments included, lit like in the 3D viewer.",
            "Each entry lands, holds for a moment and glides off smoothly as the next one arrives.",
            "Keyboard: Space or K pauses, arrow keys or J and L step, Home and End jump, Esc closes. Swipe on touch screens.",
            "With reduced motion, animations off or no 3D support, a still slideshow you step through yourself.",
          ],
          where: "Any collection → Play",
          link: { href: "/collections", label: "Open your collections" },
        },
      ],
    },
  },
  {
    id: "2026-11-06-profile-banners-frames",
    date: "2026-11-06",
    title: "Banner themes and profile frames",
    intro: "Two new kinds of showcase cosmetics: colour themes for your profile’s backdrop and ornamental frames around its edge.",
    icon: "palette",
    highlights: [
      { kind: "new", feature: "Banner themes", text: "Recolour your showcase’s backdrop, lighting and details with Tidepool, Verdant, Nocturne, Rosewood or Aurum." },
      { kind: "new", feature: "Profile frames", text: "Gilded filigree, Silver deco, Bronze briar and Rune ward frame the outside of your showcase." },
      { kind: "improved", feature: "Saved looks", text: "Each saved look remembers its banner theme and frame." },
    ],
    details: {
      new: [
        {
          title: "Banner themes",
          body: "A banner theme changes the colours, light and pattern of your profile showcase. The rest of the site keeps your own theme. The Original backdrop stays free and remains the default.",
          points: [
            "Five themes in the Arcade shop, each with its own palette and pattern.",
            "Names, titles and badges stay readable in light and dark site themes.",
          ],
          where: "Arcade → Shop → Banner themes",
          link: { href: "/arcade/shop", label: "Open the shop" },
        },
        {
          title: "Profile frames",
          body: "Ornamental corners and a fine edge drawn around your showcase. The showcase makes room for them, so they never cover your name, badges, artwork, centerpiece or buttons.",
          points: ["Four frames in the Arcade shop.", "Frames are separate from artwork frames and don’t change your covers."],
          where: "Arcade → Shop → Profile frames",
          link: { href: "/arcade/shop", label: "Open the shop" },
        },
      ],
      improved: [
        {
          title: "Choose them while arranging your showcase",
          body: "Arrange showcase now has Banner theme and Profile frame pickers with a live preview. Items you don’t own yet are shown locked. Each saved look keeps its own theme and frame. Equipping one in the shop adds it to the look you’re wearing.",
          where: "Your profile → Arrange showcase",
          link: { href: "/profile", label: "Go to your profile" },
        },
      ],
    },
  },
  {
    id: "2026-11-06-snake-blender-unranked",
    date: "2026-11-06",
    title: "Blender stays off the rankings",
    intro: "Snake leaderboards cover individual modes and daily challenges, without separate boards for every Blender mix.",
    icon: "gamepad",
    highlights: [
      { kind: "improved", feature: "Snake rankings", text: "Blender runs no longer create leaderboard entries or appear in ranked setup lists." },
      { kind: "improved", feature: "Personal play", text: "Blender gameplay, personal records, coins and achievements are unchanged." },
    ],
    details: { improved: [{
      title: "Fewer boards, clearer competition",
      body: "Blender is now unranked, including mixes with just one selected mode. Existing mixed leaderboard boards are no longer browsable, while personal bests remain saved. Individual Snake modes and daily challenges keep their rankings.",
      link: { href: "/arcade/leaderboards?game=snake", label: "View Snake rankings" },
    }] },
  },
  {
    id: "2026-11-05-forge-publish-sequence",
    date: "2026-11-05",
    title: "The Admin Panel - Forging a Code",
    intro: "For administrators, publishing a code in the Forge is now a full forging sequence: the rewards are drawn into the core and beaten into the code's seal, which is stamped onto the plate the moment the code is ready.",
    icon: "sparkles",
    highlights: [
      { kind: "improved", feature: "Publishing", text: "Energy gathers as the hold completes, the reward tokens spiral into the core one by one, and a glowing seal is hammered into shape while the server answers." },
      { kind: "improved", feature: "The reveal", text: "The finished seal is stamped onto the plate and the new code appears on that beat, then the seal cools and settles back into the core." },
      { kind: "improved", feature: "Failures", text: "If publishing fails, the seal cracks apart, the tokens return to the plate and the error is shown; nothing celebrates a code that wasn't made." },
    ],
    details: {
      improved: [
        {
          title: "A forging sequence for every published code",
          body: "Holding the Forge seal to publish now starts a sequence in the 3D scene, with matching sound when sound is on. The code itself is never shown before the server has created it.",
          points: [
            "The core spins up and the camera leans in as the hold completes.",
            "Each reward token spirals into the core with its own chime, and a seal is beaten into shape behind the code plate.",
            "When the server confirms the code, the seal is stamped onto the plate with a burst of sparks and the code is revealed on that beat; then it cools and sinks back into the core.",
            "If publishing fails, the seal cracks and fades, the tokens fly back to their loop and the error appears as before; your choices stay as they were.",
            "Press any key or click to skip ahead to the reveal.",
            "With Motion set to Subtle the sequence is shorter and calmer; with Motion off, reduced motion or plain pages, publishing shows a short status line instead.",
          ],
          where: "Admin panel → Forge (administrators only)",
          link: { href: "/admin/new", label: "Open the Forge" },
        },
      ],
    },
  },
  {
    id: "2026-11-05-profile-showcase",
    date: "2026-11-05",
    title: "Your profile, as a display case",
    intro: "Profiles are now a curated showcase of who you are and what you love in Amethyst.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "Display styles", text: "Present your profile as a Gallery wall, Trophy cabinet or Collector’s desk." },
      { kind: "new", feature: "Pinned achievements", text: "Set up to three earned medals on display, in the order you choose." },
      { kind: "new", feature: "Featured artwork", text: "Feature up to four entry covers or collection covers from your Archive, with or without their titles." },
      { kind: "improved", feature: "Profile page", text: "Your avatar, decoration, title, motto and badges now form one arranged identity." },
      { kind: "new", feature: "Living display", text: "Your avatar tints the room, featured pieces tilt and catch the light, medals glint and each style lights up its own way. Calmer with reduced motion." },
      { kind: "new", feature: "Centerpiece pedestal", text: "Stand one collectible you own on a lit 3D pedestal — game cosmetics play their live preview on it." },
      { kind: "new", feature: "Saved looks", text: "Save up to five arrangements and switch, rename or delete them, with a live preview while you edit." },
      { kind: "new", feature: "Section order and ambience", text: "Choose the order of your sections and an ambient effect — motes, glints, aurora or off." },
      { kind: "new", feature: "Opening reveal", text: "Profiles open with a short, skippable glass reveal at full motion; it never plays with reduced motion." },
    ],
    details: {
      new: [{
        title: "Arrange your showcase",
        body: "Open your profile and choose Arrange showcase. The display updates live while you pick a style, the title, decoration and badges you own, up to three earned achievements and up to four pieces from your Archive. Reorder or remove anything, then save. Until you add something, your profile shows the Gallery wall with your identity front and centre.",
        where: "Account menu → My Profile → Arrange showcase",
        link: { href: "/profile", label: "Open my profile" },
      }, {
        title: "Saved looks",
        body: "In Arrange showcase, Save as new look keeps the current style, section order, featured pieces, centerpiece and ambient effect under a name. Pick a look to preview it, save it to wear it, or rename and delete it. Deleting the look you’re wearing asks you to choose another look or the default first.",
        where: "My Profile → Arrange showcase → Saved looks",
        link: { href: "/profile", label: "Open my profile" },
      }],
      improved: [{
        title: "Private by default",
        body: "Profiles remain visible only to signed-in members, and only you can change yours. Nothing from your Archive appears unless you feature it. For featured pieces, others see the artwork and, if you allow it, its title or collection name; never notes, tasks, other entries, your email or coins.",
      }],
    },
  },
  {
    id: "2026-11-05-arcade-streaks",
    date: "2026-11-05",
    title: "Daily Arcade streaks",
    intro: "Every minigame now counts the UTC days in a row you play it.",
    icon: "gamepad",
    highlights: [
      { kind: "new", feature: "Play streaks", text: "Each game keeps one current and best streak, whatever mode, size or daily challenge you play." },
      { kind: "new", feature: "Streak overview", text: "Arcade cabinets and every game's header show your streak, today's status and the next 00:00 UTC reset." },
      { kind: "new", feature: "Streak recovery", text: "Missed a single day? Play that game the next day, then spend coins to bring the streak back." },
    ],
    details: { new: [{
      title: "Keep the flame going",
      body: "A day counts when a game round actually starts, or when a Sudoku move or note is saved. Opening a page does not count. Playing again on a later UTC day extends the streak, and missing a day ends it, while your best streak is kept. If you missed exactly one day, play that game the following day and you can recover it once. The price is 25 coins plus 5 per streak day, up to 300 coins, and it is shown before you confirm. Streaks pay no coins and don't change rewards, records or leaderboards. Streak days are rebuilt from the runs and Sudoku solves already on record, so a streak can't be longer than you really played.",
      where: "Arcade → a cabinet's streak line, or the flame button in any game",
      link: { href: "/arcade", label: "Open the Arcade" },
    }] },
  },
  {
    id: "2026-11-05-sudoku-sizes",
    date: "2026-11-05",
    title: "Sudoku in three sizes",
    intro: "Choose Mini 4×4, Normal 9×9 or XXL 16×16 in the Arcade.",
    icon: "gamepad",
    highlights: [
      { kind: "new", feature: "Puzzle sizes", text: "Mini and XXL join Normal, with Easy, Medium and Hard puzzles at every size." },
      { kind: "improved", feature: "Separate progress", text: "Each size keeps its own unfinished puzzle, pencil notes and fastest times." },
      { kind: "improved", feature: "Size-aware rankings", text: "Leaderboards separate each size and difficulty. Daily puzzles remain Normal." },
    ],
    details: { new: [{
      title: "From Mini to XXL",
      body: "Choose a size before starting a regular puzzle. Mini uses 1–4 and 2×2 regions; Normal keeps 1–9 and 3×3 regions; XXL uses 1–9 plus A–G and 4×4 regions. XXL supports letter keys, full pencil notes and a scrollable board on narrow screens. Every generated puzzle has one solution. Mini and XXL difficulty tiers increase the number of blanks; Normal retains its existing difficulty ratings. Existing saves and records stay with Normal, and daily puzzle identities and results are unchanged. Hints, server-verified completion, coins and achievements work at every size.",
      link: { href: "/arcade/sudoku", label: "Play Sudoku" },
    }] },
  },
  {
    id: "2026-11-05-snake-daily",
    date: "2026-11-05",
    title: "Snake Daily Challenge",
    intro: "A shared Snake challenge every UTC day, alongside your regular setup.",
    icon: "gamepad",
    highlights: [
      { kind: "new", feature: "Daily Snake", text: "Play the same daily rules, board and seeded fruit sequence as everyone else." },
      { kind: "new", feature: "Daily records", text: "Keep a separate daily best and compete on daily leaderboards." },
      { kind: "improved", feature: "Midnight continuity", text: "Finish a run for its original date after midnight; regular setup, records and coin rules are unchanged." },
    ],
    details: { new: [{
      title: "One challenge, every day",
      body: "Choose Daily in Snake to see the challenge date, fixed rules, daily best and countdown to the next 00:00 UTC reset. Daily rounds use the same seeded board and spawned items for everyone. A run started before midnight keeps its original challenge date, while the next run uses the new day. Regular play retains your saved setup and separate records. Daily runs use the existing verification, achievements and coin eligibility without extra rewards.",
      link: { href: "/arcade/snake", label: "Play Snake Daily" },
    }] },
  },
  {
    id: "2026-11-05-visible-achievements",
    date: "2026-11-05",
    title: "Every achievement in view",
    intro: "All achievements are visible in the Trophy Room before you earn them.",
    icon: "trophy",
    highlights: [
      { kind: "improved", feature: "Trophy Room", text: "See every achievement's real name, description, icon, goal, progress and reward from the start." },
      { kind: "improved", feature: "Reward discovery", text: "Search all achievements and rewards, filter by reward type, and follow reward links directly to their achievement." },
      { kind: "improved", feature: "Same milestones", text: "Earning requirements and one-time rewards are unchanged; Vault codes and secret cosmetics remain secret." },
    ],
    details: { improved: [{
      title: "No concealed milestones",
      body: "Light Sculptor and Seal Breaker now show their full details even at zero progress, just like every other achievement. Their rewards appear in search and reward filters, and reward links open the corresponding achievement. Progress, earning conditions, earned history, reward grants and celebrations are unchanged.",
      link: { href: "/achievements", label: "Open the Trophy Room" },
    }] },
  },
  {
    id: "2026-11-05-vault-redemption-fix",
    date: "2026-11-05",
    title: "Vault redemption fixes",
    intro: "Vault code submission works reliably on the 3D console and HTTP connections.",
    icon: "box",
    highlights: [
      { kind: "fixed", feature: "Code redemption", text: "Fixed request-ID generation on browsers where randomUUID is unavailable, preserving safe retries in both Vault views." },
      { kind: "fixed", feature: "3D console clicks", text: "Fixed pressed-button hit testing in the high-quality console so redemption clicks reach the form, without changing its appearance or motion." },
    ],
    details: { fixed: [{
      title: "Redemption without a stuck verification state",
      body: "The high-quality console's form now has its own stacking context inside the 3D panel. Pressing the redemption button no longer redirects hit testing to the surrounding layout, preserving its native click and submit behavior. Its layout, styling and motion are unchanged. Both Vault views also generate secure request IDs when the browser does not expose randomUUID, and handle request setup failures.",
      link: { href: "/vault", label: "Open the Vault" },
    }] },
  },
  {
    id: "2026-11-05-early-history-previews",
    date: "2026-11-05",
    title: "Five more early Archives snapshots",
    intro: "Explore five more snapshots from the oldest usable Archives history, without signing in.",
    icon: "notebook",
    highlights: [
      { kind: "new", feature: "Five public previews", text: "Open 4cd98fc, a33650c, 41c0112, bb14398 and 8969276 directly from Version History." },
      { kind: "new", feature: "The earliest workspace", text: "Try the original unified library and Markdown write/preview editor, before the launch-era live editor." },
      { kind: "improved", feature: "Historical fidelity", text: "Each snapshot uses its own library markup, navigation, checklist controls and CSS, including square game covers and always-visible Other navigation in the later snapshot." },
      { kind: "improved", feature: "Separate local samples", text: "Edits and resets stay isolated to each commit in your browser; no account or demo server is required." },
    ],
    details: { new: [{
      title: "The next five usable snapshots, oldest first",
      body: "The retired catalog-sync prototypes are skipped. The earliest personal-workspace commit 4cd98fc is now playable, followed by a33650c's interaction polish and square game covers, the deployment snapshot 41c0112, the package-registry snapshot bb14398, and 8969276's always-visible Other navigation and New-entry menu option. Previously, Other appeared in navigation only when it contained entries. The two configuration-only commits intentionally share the preceding UI. Each preview has fixed sample content, editable notes and checklist progress, and its own local reset. Creation, deletion, uploads and account actions remain disabled.",
      link: { href: "/version-history", label: "Explore the early snapshots" },
    }] },
  },
  {
    id: "2026-11-05-launch-preview",
    date: "2026-11-05",
    title: "Try the original Archives",
    intro: "Explore the launch-era Amethyst Archives in a public browser-only demo with a sample workspace.",
    icon: "notebook",
    highlights: [
      { kind: "new", feature: "Launch preview", text: "Try the original fixed libraries, early navigation, poster cards, explorer and Markdown/checklist editors from commit 3c27ef5." },
      { kind: "new", feature: "Local sandbox", text: "Edit the sample note and checklist in your browser, then reset the demo without an account or demo server." },
      { kind: "improved", feature: "Safe sample workspace", text: "Creation, deletion, uploads and account actions are unavailable; the demo never reads or changes your real workspace." },
      { kind: "fixed", feature: "Historical effects", text: "Restored the original staggered library entrances and unclipped poster hover glow, keeping image zoom, title highlights and scroll-linked fades. Fixed missing artwork styles and hover effects suppressed by touch-capable browser detection." },
    ],
    details: { new: [{
      title: "The launch-era preview",
      body: "This limited sandbox uses the launch commit's original interface with a fixed sample entry. Its library filters, file explorer, live Markdown editor and checklist run in the browser. Temporary edits are stored locally for this preview only, and Reset Demo restores the sample. Account management, artwork uploads and structural creation/deletion are unavailable. Other historical milestones retain their existing demo availability.",
      link: { href: "/demos/3c27ef5", label: "Try the original Archives" },
    }], fixed: [{
      title: "The original motion and hover effects",
      body: "The launch preview keeps the original library's staggered entrances, poster zoom and amethyst hover glow, title and border highlights, and scroll-linked exits. A conflicting modern CSS utility no longer clips the poster glow. Reduced-motion preferences are respected.",
      link: { href: "/demos/3c27ef5", label: "Open the launch preview" },
    }] },
  },
  {
    id: "2026-11-05-public-version-history",
    date: "2026-11-05",
    title: "Version History for everyone",
    intro: "Explore Amethyst's full commit catalog, release notes and available historical demos without an account.",
    icon: "link",
    highlights: [
      { kind: "improved", feature: "Public catalog", text: "Browse Version History, search and filter commits, and read linked release notes without signing in." },
      { kind: "new", feature: "Sign-in page link", text: "Open Version History directly from the sign-in page." },
      { kind: "improved", feature: "Isolated demos", text: "Available demos use temporary visitor workspaces, with reset confirmation on the demo itself." },
    ],
    details: {
      improved: [{
        title: "Public Version History",
        body: "Version History and its release notes are open to everyone. Launch available historical demos without an Amethyst account; each visitor gets an isolated temporary workspace. Reset confirmation takes place on the demo's own page and affects only that visitor's workspace. Your normal Archive, To Do, Arcade and account pages remain private.",
        link: { href: "/version-history", label: "Explore Version History" },
      }],
    },
  },
  {
    id: "2026-11-05-multiple-badges",
    date: "2026-11-05",
    title: "Wear up to five badges",
    intro: "Show off more of your collection: equip up to five profile badges at once and choose their order.",
    icon: "medal",
    highlights: [
      { kind: "new", feature: "Multiple badges", text: "Pick up to five owned badges in Customization → Profile and arrange them with Move earlier, Move later and Remove." },
      { kind: "improved", feature: "Member profiles", text: "Your profile page shows every badge you wear in its banner; hover or focus one to see its name." },
      { kind: "improved", feature: "Equipping rewards", text: "Equipping a badge from Achievements adds it next to the ones you already wear instead of replacing them." },
    ],
    details: {
      new: [
        {
          title: "Multiple badges",
          body: "Choose up to five badges you own and put them in the order you like; the first one leads wherever your name appears. Your title stays a single choice. Badges you already wore are kept as your first badge.",
          where: "Customization → Profile",
          link: { href: "/customization/profile", label: "Choose badges" },
          points: [
            "The picker shows how many of the five slots you're using, and each badge can only be worn once.",
            "Home and your profile page show all your badges; the compact account menu shows three and a +N count for the rest.",
            "When all five slots are full, equipping another badge from Achievements asks you to remove one first.",
          ],
        },
      ],
    },
  },
  {
    id: "2026-11-05-special-page-designs",
    date: "2026-11-05",
    title: "Special page designs toggle",
    intro: "Choose whether Version History, Achievements, the Vault and the Admin panel use their bespoke designs or the standard page layout.",
    icon: "palette",
    highlights: [
      { kind: "new", feature: "Special page designs", text: "A new Appearance setting switches Version History, Achievements, the Vault and the Admin panel between their bespoke designs and the standard page layout." },
      { kind: "improved", feature: "The Vault", text: "The code panel tilts toward your mouse and catches a glare and a sliding beam of light on hover, as Admin Panels do, in the standard look and whenever the 3D chamber can't run." },
      { kind: "fixed", feature: "The Vault", text: "In the 3D chamber, the glow behind the code panel no longer shows as a box around it, and the hover glare is a clean beam of light instead of a grey film over the text." },
      { kind: "improved", feature: "The Vault", text: "Access Request now has a gentler hover tilt in both layouts, matching the Admin panel's restrained movement." },
    ],
    details: {
      new: [
        {
          title: "Special page designs",
          body: "Version History (the chronometer), Achievements (the Trophy Room), the Vault (the 3D chamber) and the Admin panel (the Crimson Sanctum) keep their bespoke designs by default. Turn Special page designs off to show them in Amethyst's standard page layout instead; content, links and actions stay the same, and you can switch back at any time.",
          where: "Customization → Appearance",
          link: { href: "/customization/appearance", label: "Open Appearance" },
          points: ["The standard Vault skips the 3D scene: enter a code, get a clear answer and see your rewards as cards.", "The standard Admin panel is a responsive dashboard with every view, draft, publish and confirmation step."],
        },
      ],
    },
  },
  {
    id: "2026-11-05-member-profiles",
    date: "2026-11-05",
    title: "Profile pages",
    intro: "Every member now has a profile page showing their name, avatar, motto and equipped flair. Open yours from the account menu.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "My Profile", text: "A profile page with your avatar and decoration, display name, motto, equipped badge and title, and the month you joined." },
      { kind: "new", feature: "Member profiles", text: "Other signed-in members can open your profile page by its link; it's never visible to visitors who aren't signed in." },
      { kind: "improved", feature: "Customization → Profile", text: "A View my profile button, and Edit profile on your own profile page, link the two." },
    ],
    details: {
      new: [
        {
          title: "Profile pages",
          body: "Your profile page shows how you appear to other Amethyst members: your avatar with its decoration, display name, motto, the badge and title you have equipped, and when you became a member. Each member's page has a permanent address based on their account, so renaming yourself never breaks a link.",
          points: [
            "Only signed-in Amethyst members can open profile pages.",
            "Profiles never show your email, coins, collections, notes, tasks or settings.",
            "Change what's shown with Edit profile, which opens Customization → Profile.",
          ],
          where: "Account menu → My Profile",
          link: { href: "/profile", label: "Open My Profile" },
        },
      ],
    },
  },
  {
    id: "2026-11-05-arcade-leaderboards",
    date: "2026-11-05",
    title: "Arcade Leaderboards",
    intro: "See how your best runs rank against other players in every Arcade game. Display names are now unique and appear on the boards.",
    icon: "medal",
    highlights: [
      { kind: "new", feature: "Arcade → Leaderboards", text: "Top 25 players for each game and mode, with your own placement even when you're outside the list." },
      { kind: "new", feature: "Ranks button", text: "Every game's header opens the leaderboard for the mode you're playing." },
      { kind: "new", feature: "Unique display names", text: "Leaderboards show your display name (never your email). Names are unique, so no two players share one; without a name you appear as an arcade name like \"Velvet Otter 42\"." },
    ],
    details: {
      new: [
        {
          title: "Leaderboards for every Arcade game",
          body: "2048, Flutter, Snake, Sudoku, Fruit Slice and Tower Stacker each have ranked boards. Each mode ranks separately, so different board sizes, modes, Snake setups, Sudoku difficulties and each day's daily challenge are never mixed. Highest score ranks first; Sudoku ranks the fastest solve first, with fewer hints breaking a tie. Only runs the server timed and checked count, one best per player, and boards start fresh with runs played from now on. Viewing leaderboards earns no coins or achievements.",
          points: [
            "Pick a game, then a mode or a daily challenge from the last seven days.",
            "Snake lets you pick any mode, size, fruit count and speed, jump back to your own setup, or choose from setups someone has ranked on.",
            "Your own row is highlighted, and shown below the list when you're outside the top 25.",
            "Players appear under their display name; emails are never shown. Display names are now unique (ignoring upper/lower case), and players without one appear under an anonymous arcade name.",
          ],
          where: "Arcade → Leaderboards, or Ranks in any game's header",
          link: { href: "/arcade/leaderboards", label: "Open Leaderboards" },
        },
      ],
    },
  },
  {
    id: "2026-11-05-arcade-trophy-door",
    date: "2026-11-05",
    title: "Trophy Room entrances",
    intro: "The Achievements links on Home and in the Arcade are now gold-framed doorways into your trophy cabinet, and Home drops its separate Earned achievements list.",
    icon: "trophy",
    highlights: [
      { kind: "improved", feature: "Home → Achievements", text: "The Achievements card at the bottom of Home is a lit trophy alcove with your medal count and a gold sill that fills as you earn medals." },
      { kind: "improved", feature: "Arcade → Achievements", text: "The header link has a gold frame, a trophy medal and a soft light sweep on hover." },
      { kind: "improved", feature: "Home sections", text: "The Earned achievements section is gone from Home and Customize Home; your medals live on the Achievements page." },
    ],
    details: {
      improved: [
        {
          title: "Trophy Room entrances",
          body: "The Achievements card at the bottom of Home and the Achievements link beside Home in the Arcade header have a gold-framed, lit look. On Home, the medal sits in an arched alcove, the card shows how many medals you've earned, and the gold line along its bottom fills to match. Hovering or focusing either one sends a light across the frame; the glow and the sweep follow your motion setting.",
          where: "Home (bottom of the page) and Arcade → Achievements",
          link: { href: "/achievements", label: "Open Achievements" },
        },
        {
          title: "Earned achievements removed from Home",
          body: "The optional Earned achievements section and its Customize Home toggle were removed. Every medal you've earned is on the Achievements page, reachable from the card at the bottom of Home.",
          where: "Home",
          link: { href: "/achievements", label: "View your medals" },
        },
      ],
    },
  },
  {
    id: "2026-11-05-quick-notes-and-stats",
    date: "2026-11-05",
    title: "Quick Notes, Favorited Tasks & Stats",
    intro: "Jot things down from Home into Quick Notes, keep starred tasks one tab away, see your own numbers in Stats and browse platform-wide totals in Amethyst Stats.",
    icon: "notebook",
    highlights: [
      { kind: "new", feature: "Quick Notes", text: "A notes space that isn't tied to any entry: capture a thought from Home, then open, edit, rename or delete it under Quick Notes." },
      { kind: "new", feature: "Favorited Tasks", text: "Home's Upcoming tasks has a Favorited tab listing open checklist tasks you've starred, with or without a due date." },
      { kind: "new", feature: "Stats", text: "A Settings page with your own totals: entries and progress, notes, checklist and To Do tasks, coins, games, achievements and cosmetics." },
      { kind: "new", feature: "Amethyst Stats", text: "A Settings page with live totals across all accounts and a snapshot of the codebase, each with a plain definition." },
    ],
    details: {
      new: [
        {
          title: "Quick Notes",
          body: "Quick Notes are standalone Markdown notes that belong to you rather than to an entry. Capture one from Home: the first line becomes its name. The full Quick Notes page lists every note, newest first, and opens each one in the same editor as entry notes.",
          points: [
            "Ctrl + Enter (Cmd + Enter on Mac) saves a capture without leaving the keyboard.",
            "Notes save automatically as you type; if the note changed in another tab, you're asked which version to keep.",
            "Rename a note by editing its title, or delete it from the note page.",
            "Up to 1,000 quick notes per account.",
          ],
          where: "Home → Quick Notes, or the Quick Notes page",
          link: { href: "/notes", label: "Open Quick Notes" },
        },
        {
          title: "Favorited Tasks",
          body: "The Upcoming tasks section on Home now has two tabs. Upcoming lists open tasks by due date as before; Favorited lists open checklist tasks you've starred in any entry, soonest due first and undated ones last.",
          where: "Home → Upcoming tasks → Favorited",
          link: { href: "/", label: "Open Home" },
        },
        {
          title: "Stats",
          body: "A new Settings page shows numbers about your own account: entries split into completed, in progress and not started, overall progress, collections and pinned entries, notes and checklists. It also covers checklist and To Do tasks (including the last 7 days), your coin balance with coins received and spent, Arcade games played and your most played game, personal records, daily Sudokus, Slot spins, achievements, cosmetics and Vault codes.",
          points: [
            "Only you can see your stats.",
            "Figures come from what's saved now, so there is no history or trend over time.",
          ],
          where: "Settings → Stats",
          link: { href: "/settings/stats", label: "Open Stats" },
        },
        {
          title: "Amethyst Stats",
          body: "A new Settings page shows totals across everyone using Amethyst: collections, entries, archive checklist tasks, To Do tasks, coins awarded by source, successful code redemptions and cosmetics granted. A codebase section shows lines and characters of source code and the number of commits, from a snapshot with its commit and date.",
          points: [
            "Only aggregate totals are shown, never accounts, emails, codes or individual activity.",
            "Every figure explains exactly what it counts and what it leaves out.",
          ],
          where: "Settings → Amethyst Stats",
          link: { href: "/settings/amethyst-stats", label: "Open Amethyst Stats" },
        },
      ],
      improved: [
        {
          title: "Customize Home",
          body: "Quick Notes is a Home section you can move or hide like the others. It starts directly below Upcoming tasks, including on layouts you've already arranged. The At a glance section is gone; your totals now live in Settings → Stats.",
          where: "Home → Customize",
        },
      ],
    },
  },
  {
    id: "2026-11-05-version-history-chronometer",
    date: "2026-11-05",
    title: "Version History - The Chronometer",
    intro: "Version History now opens with a brass chronometer that winds itself up beside the heading, and launching a playable demo travels back through time to that commit's date before the old version opens.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "The chronometer", text: "A brass and iron time machine wakes up as the page opens: its lamp flickers on, its month, day and commit rings turn to today and it settles beside the heading." },
      { kind: "new", feature: "Time travel", text: "Launching a playable demo turns the rings to the commit's date, dives through the lens and races down a tunnel of the archive's commits, counting the days back until the demo opens." },
      { kind: "improved", feature: "Version History", text: "Riveted iron and brass throughout the top of the page: the overview counts are pressure gauges and each milestone demo is an archive panel with a status lamp." },
    ],
    details: {
      new: [
        {
          title: "The chronometer",
          body: "When you open Version History, the chronometer's lamp flickers on, its gears and steam start up, the month, day and commit rings sweep round and lock onto today, and the machine settles beside the heading as the page appears. Commits with a playable demo glow on its commit ring.",
          points: [
            "The full opening plays once per session; later visits get a shorter version.",
            "Skip intro, any key or a click ends it at once, and it never replays when you filter, search or change pages.",
            "Subtle motion plays the short version; Motion off and reduced motion go straight to the page.",
            "Without 3D graphics, a drawn dial takes the machine's place.",
          ],
          where: "Version History",
          link: { href: "/version-history", label: "Open Version history" },
        },
        {
          title: "Time travel to a demo",
          body: "Launch on a playable demo now plays a short journey first: the chronometer turns its rings to the commit's date, the camera dives into its lens and races down a tunnel lined with plates for the archive's commits, while a readout counts back to the destination date and shows the commit's short SHA, milestone and title. Then the demo opens exactly as before.",
          points: [
            "Arrive now skips ahead; Stay here or Escape cancels and keeps you on the page.",
            "Ctrl-, Cmd-, Shift- and middle-clicks still open the demo straight away in a new tab or window.",
            "Subtle motion plays a shorter trip; Motion off and reduced motion open the demo directly.",
            "Demos still run in their own isolated environment with your separate demo workspace.",
          ],
          where: "Version History → Milestone demos → Launch",
          link: { href: "/version-history", label: "Open Version history" },
        },
      ],
      improved: [
        {
          title: "A steampunk Version History",
          body: "The page now sits on riveted iron plates under a brass heading. The overview counts (cataloged commits, available demos, not prepared and unavailable) are pressure gauges, and each milestone demo is an archive panel with its date, SHA, milestone, a status lamp that is lit when the demo is online and hazard-striped when it is offline, Launch and Reset.",
          where: "Version History",
          link: { href: "/version-history", label: "Open Version history" },
        },
      ],
    },
  },
  {
    id: "2026-11-04-vault-unlock",
    date: "2026-11-05",
    title: "The Vault - The Unlock and Crimson",
    intro: "Breaking a seal now plays out as a full unlock, the Vault opens with the Admin Panel's ignition, its console is now a floating Admin Panel that tilts toward your pointer, and a new Crimson option gives the whole chamber the Admin Panel's red.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "The unlock", text: "The rings and dial lock one by one, the bolts draw back, pressure vents from the seams and the door swings open before your rewards fly out of the core." },
      { kind: "new", feature: "The opening", text: "The Admin Panel's seal holds the dark, then the vault ignites: its sigil traces, the rings spin up, the core flashes and the camera pulls back as the console's glass flies together." },
      { kind: "new", feature: "Dark or Crimson", text: "Switch the Vault between its dark steel colours and the Admin Panel's deep red. Your choice is saved to your account." },
      { kind: "improved", feature: "Vault console", text: "Now a floating Admin Panel: glass over a dark slab that tilts and lifts toward your pointer, catches a glare and ripples when pressed." },
      { kind: "improved", feature: "Access Log", text: "An Admin-style panel whose entries read as an activity feed, each marked with a lit diamond." },
    ],
    details: {
      new: [
        {
          title: "A cinematic unlock",
          body: "When a code is accepted, the core flashes and the console answers, then the two outer rings and the dial lock into place one after another, each with a click, the eight bolts retract in turn, vapour and light escape from the door's seams and the door opens with a heavy swing, a shockwave and sparks, before the reward cards leave the core.",
          points: [
            "The console's lock register lights each ring and bolt in step with the vault, and its bar fills until the cards appear.",
            "A matching sound follows every stage if sound is on.",
            "Subtle motion plays a shorter version; Motion off and reduced motion go straight to the open vault and the cards, with no flashes or shaking.",
          ],
          where: "The Vault",
          link: { href: "/vault", label: "Open the Vault" },
        },
        {
          title: "The Admin Panel's opening",
          body: "The Vault now opens like the Admin Panel. Its spinning seal holds the dark while the chamber loads, then the vault's sigil traces itself, the rings spin up faster and faster, the core flashes with a shockwave and the camera pulls back from the door as the console's glass flies together from shards. The header and the console's text then decode from glyphs.",
          points: [
            "The full opening plays once per visit; coming back plays a shorter one.",
            "Any key or press skips it, and typing goes straight into the code field.",
            "Subtle motion plays the short version; Motion off and reduced motion skip it.",
          ],
          where: "The Vault",
          link: { href: "/vault", label: "Open the Vault" },
        },
        {
          title: "Dark or Crimson colours",
          body: "A Dark / Crimson switch next to the Vault's status lets you choose its colours. Dark keeps the obsidian and steel; Crimson gives the chamber, the vault's metal and light, the console and the Access Log the Admin Panel's crimson-black and red. The choice is saved to your account.",
          points: [
            "Switching breaks the console's glass away and rebuilds it in the new colours while a wave of light runs across the vault's engravings.",
            "Subtle motion blends the colours without breaking the glass; Motion off and reduced motion switch instantly.",
          ],
          where: "The Vault, top right",
          link: { href: "/vault", label: "Open the Vault" },
        },
      ],
      improved: [
        {
          title: "An Admin Panel console",
          body: "The Access Request console is now a floating Admin Panel: tinted glass over a dark slab, with a glowing rim, an inner frame line and lit corners, a small kicker over a Cinzel title, an Admin-style code field and Admin red buttons.",
          points: [
            "With a mouse, the console tilts toward your pointer, lifts toward you and catches a glare that follows it; it levels out while you type.",
            "Pressing on it sends a ring of light across the glass.",
            "The code field keeps its charge line that fills as you type, with the Admin Panel's red focus ring.",
            "The header carries the Admin sigil, and the status chip, colour switch and sound toggle are Admin-style pills.",
          ],
          where: "The Vault",
          link: { href: "/vault", label: "Open the Vault" },
        },
        {
          title: "Access Log and chamber",
          body: "The Access Log is an Admin-style panel with a Cinzel title, a status pill and entries that read as an activity feed, each with a lit diamond and a thread to the next. The chamber's haze and light follow the colours you choose.",
          where: "The Vault",
          link: { href: "/vault", label: "Open the Vault" },
        },
      ],
    },
  },
  {
    id: "2026-11-04-vault-transmission",
    date: "2026-11-04",
    title: "The Vault - Transmission",
    intro: "Speaking a code to the Vault now plays out as a transmission into the seal, the Vault's console and Access Log got a calmer glass finish, and the Admin Panel's red is a little softer.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "Code transmission", text: "Your code lifts off the field, races down a lit link into the seal and charges the core while the Vault checks it." },
      { kind: "improved", feature: "Distinct answers", text: "Wrong, dormant, already claimed, locked and lost codes each end the transmission in their own way." },
      { kind: "improved", feature: "Vault console", text: "Thinner, quieter rims, a glass Access Log and a more even chamber, with the Break the Seal button as the brightest thing on the panel." },
      { kind: "improved", feature: "Admin Panel", text: "A slightly deeper red and lighter glows, with full-bright red kept for active and primary controls." },
    ],
    details: {
      new: [
        {
          title: "Codes travel into the seal",
          body: "While the Vault checks a code, its characters stream out of the field to the console's port, run down the link as a bright packet and strike the seal, which spins up and charges until the answer arrives.",
          points: [
            "A wrong code is thrown back down the link and lands in the field with a jolt.",
            "An already claimed code is handed back gently in pale light; a dormant code gutters out in grey; a locked vault cuts the link; a lost connection breaks it halfway.",
            "The answer shows as soon as it arrives, after a short minimum so the transmission can land.",
            "Subtle motion plays a shorter version and Motion off skips the travelling effects; a matching sound plays if sound is on.",
          ],
          where: "The Vault",
          link: { href: "/vault", label: "Open the Vault" },
        },
      ],
      improved: [
        {
          title: "A calmer Vault console",
          body: "The console's frame glows less, the field, buttons and status chip have a layered glass look, and the Access Log now sits on a glass panel with a lit rim, so the Break the Seal button stands out as the main action.",
          where: "The Vault",
          link: { href: "/vault", label: "Open the Vault" },
        },
        {
          title: "Softer red in the Admin Panel",
          body: "The Admin Panel uses a slightly deeper red with lighter glows on headings, tabs, meters and selected options, and a gentler bloom in the 3D scene. Layout and behaviour are unchanged.",
          where: "Admin panel (administrators only)",
          link: { href: "/admin", label: "Open the admin panel" },
        },
      ],
    },
  },
  {
    id: "2026-11-04-tour-transitions",
    date: "2026-11-04",
    title: "The Tour - Scenes in Motion",
    intro: "The Tour now flies between scenes instead of jumping: each scene breaks apart as you leave and the next one assembles around the camera, while the text arrives and leaves in step with the picture.",
    icon: "sparkles",
    highlights: [
      { kind: "improved", feature: "Scene transitions", text: "Leaving a scene sends its pieces flying past the camera, and the next scene streams in from around you and builds itself." },
      { kind: "improved", feature: "Alive while you scroll", text: "While you read a chapter, scrolling slowly circles the camera around the scene, and faster scrolling stretches the view." },
      { kind: "improved", feature: "Into the games", text: "From the Arcade, the camera dives through the 2048 cabinet's screen straight into the game." },
    ],
    details: {
      improved: [
        {
          title: "Smoother journey through the Tour",
          body: "The flight between chapters takes more scrolling and every step of it has something happening, so fast scrolling no longer skips straight to the next scene.",
          points: [
            "Each chapter's heading, text, tags and link fade in one after another as the camera arrives, and leave before it sets off.",
            "Scenes play their moment on their own while you pause: To Do ticks its tasks off with sparkles, and the Arcade's sign and screens switch on before a coin drops in.",
            "Very long jumps, such as picking a chapter from the side rail, cut there with a short fade instead of racing through every scene.",
            "Motion: Subtle tones everything down; Motion: Off and reduced motion still show composed, still scenes.",
          ],
          where: "The Tour",
          link: { href: "/tour", label: "Take the tour" },
        },
      ],
    },
  },
  {
    id: "2026-11-03-ten-more-frames",
    date: "2026-11-03",
    title: "Ten More Frames & Richer Ornaments",
    intro: "Ten new illustrated artwork frames in the Arcade shop, and the ten existing illustrated frames redrawn with sculpted mouldings and larger ornaments.",
    icon: "palette",
    highlights: [
      { kind: "new", feature: "Ten new frames", text: "Ten new illustrated frames for 450–650 coins, each drawn in 2D and sculpted in 3D in Showcase." },
      { kind: "improved", feature: "Illustrated frames", text: "The existing illustrated frames gained raised mouldings, patterned trim running round the band and bigger, more detailed ornaments." },
    ],
    details: {
      new: [
        {
          title: "Ten new frames",
          body: "Each frame has its own mouldings, trim and ornaments on the corners and edges, kept clear of the artwork on square and portrait covers.",
          points: [
            "450 coins: Sakura storm, Bridal bouquet and Lavender north.",
            "550 coins: Summer fireworks, Stained prelude, Kagune coil and Hollow fang.",
            "650 coins: Fallen halo, Afterimage and Zipper rush.",
          ],
          where: "Arcade → Shop",
          link: { href: "/arcade/shop", label: "Open the Arcade shop" },
        },
      ],
      improved: [
        {
          title: "Richer illustrated frames",
          body: "Koi rail, Pressed diary, Spider lily, Sonata keys, Demon wing, Moonshot, Golden arrow, Sword guard, Five ribbons and Frost glam keep their names, prices and ownership, with a fuller look.",
          points: [
            "Raised inner and outer mouldings and a patterned trim running all the way round, such as keys, rhinestones, ribbons, rivets and hilt wrapping.",
            "Larger and more detailed ornaments, including a sword guard with an enamelled butterfly and cord knot, a lotus, jewelled wings, a sunburst and a lily crest.",
            "The thicker band appears in collection cards, the frame picker, the artwork viewer and Showcase.",
            "Ornaments on every illustrated frame are larger, inked with crisp outlines, cast soft shadows, and polished metal catches a bright highlight; glowing details slowly breathe and the frame leans toward your mouse. In Showcase they're sculpted as solid pieces that cast real shadows on the band and art.",
            "New centrepieces across the illustrated frames: a breaking wave on Koi rail, a wax seal and pressed cherry spray on Pressed diary, a treble clef on Sonata keys, devil bat wings on Demon wing, a rocket on Moonshot, the Stand Arrow with menacing ゴゴゴ on Golden arrow, a sheathed katana on Tsuba guard, headphones, a bunny-ear ribbon and a wedding bell on Five ribbons, a crystal tiara on Frost glam, paper lanterns on Summer fireworks, a blossoming bough and omikuji fortunes on Sakura storm, torn-open zips on Zipper rush, lavender bundles and a fox by a snow globe on Lavender north, a rose window on Stained prelude and a chevron visor on Afterimage.",
          ],
          where: "Customization → Artwork frames",
        },
        {
          title: "An easier frame picker",
          body: "The frame list in Change artwork frame and the artwork viewer now scrolls on its own with larger previews, so the search, your cover preview and Save stay in view, and it opens scrolled to the frame you're using.",
          where: "Entry → More entry actions → Change artwork frame, or the frame button in the artwork viewer",
        },
      ],
    },
  },
  {
    id: "2026-11-03-themes-frames-and-polish",
    date: "2026-11-03",
    title: "New Themes, Frames & a Polished Feel",
    intro: "Ten new themes with matching illustrated frames, a theme for each workspace, frames on your collection covers, bigger banners and a tactile feel across the whole app.",
    icon: "palette",
    highlights: [
      { kind: "new", feature: "Ten themes & frames", text: "Ten new light and dark themes, each with a matching illustrated frame in the Arcade shop for 300–500 coins, sculpted in 3D in Showcase." },
      { kind: "new", feature: "Workspace themes", text: "Give one entry its own theme while the rest of Amethyst keeps your app theme." },
      { kind: "new", feature: "Collection frames", text: "A frame you choose for an entry now surrounds its collection card, and the frame picker shows every option as a picture." },
      { kind: "improved", feature: "Banners & cover fan", text: "Collection and entry banners show more of the artwork, and Home's cover fan is larger with calmer hover feedback." },
      { kind: "improved", feature: "Tactile feedback", text: "Buttons, cards, filter chips, shop items, game controls and To Do rows lift on hover and press in smoothly, honoring reduced motion." },
    ],
    details: {
      new: [
        {
          title: "Ten new themes",
          body: "Each theme has its own colors, heading font and a quiet background flourish, such as ripples and a koi, ruled diary lines, a music staff, neon splashes, scanlines, Art Deco rays, a butterfly or falling snowflakes.",
          points: ["Light: Koi Bridge, Petal Diary, Spring Sonata, Quintet Bloom and Snow Glam.", "Dark: Higanbana, Sabbath Neon, Chrome Runner, Menacing Gold and Hell Butterfly."],
          where: "Settings → Themes",
          link: { href: "/settings/themes", label: "Open Themes" },
        },
        {
          title: "Ten matching frames",
          body: "Every theme has a frame drawn to match it, with patterned bands and ornaments on the corners and edges. Buy them with Arcade coins, then use one as your default frame or on single entries.",
          points: ["300 coins: Koi rail, Pressed diary and Frost glam.", "400 coins: Sonata keys, Five ribbons, Spider lily and Sword guard.", "500 coins: Demon wing, Moonshot and Golden arrow."],
          where: "Arcade → Shop",
          link: { href: "/arcade/shop", label: "Open the Arcade shop" },
        },
        {
          title: "A theme for each workspace",
          body: "Open More entry actions → Workspace theme to change the entry header, explorer, notes, checklists and workspace controls. Use app theme removes the override. Your navigation, other entries, editor preferences and custom heading colors stay unchanged.",
          where: "Entry → More entry actions → Workspace theme",
          points: ["Search themes by name or description. A wider entry actions menu keeps its options readable."],
        },
        {
          title: "Your chosen frames on collection covers",
          body: "An entry’s explicitly selected frame now surrounds its cover in the normal collection view, including its decorative ornaments. Collection cards do not inherit the account-wide Showcase frame.",
          points: [
            "An explicit frame choice appears on the collection card and in Showcase.",
            "Following the account default leaves the collection card unframed while Showcase uses that default.",
            "Choosing No frame explicitly removes the frame in both views.",
          ],
        },
      ],
      improved: [
        {
          title: "Clearer banners and a larger Home cover fan",
          body: "Collection and entry banners have a more prominent presentation, with matching treatment on Home previews. Uploaded artwork and editing behavior are unchanged.",
          points: [
            "Banner artwork stays visible behind readable titles and actions, with collection accents tying the presentation together.",
            "Home’s cover fan is larger on desktop and mobile, with a small hover lift, fixed card order and stable pointer targets instead of shuffling neighboring cards.",
            "Keyboard focus gets equivalent feedback, and motion respects your settings and system reduced-motion preference.",
          ],
          link: { href: "/", label: "Open Home" },
        },
        {
          title: "Change frames where you view your artwork",
          body: "Use Change artwork frame in an entry’s three-dot menu, or the separate Artwork frame control beside Showcase look in the artwork viewer.",
          points: [
            "Frame changes update the artwork viewer and collection card without changing Showcase lighting, glow or motion settings.",
            "The frame picker is no longer part of entry creation or Edit details. New entries inherit the account default in Showcase and remain unframed in collections until you choose a frame for them.",
            "Existing frame ownership and unlock requirements still apply.",
          ],
          where: "Entry actions and the artwork viewer",
        },
        {
          title: "See frames before you pick",
          body: "The frame picker for a single entry shows a tile for each frame you own, drawn around that entry's cover, including your default frame. It works the same in the entry menu and in the artwork viewer.",
          where: "Entry → More entry actions → Change artwork frame, or the frame button in the artwork viewer",
        },
        {
          title: "Framed header actions and smoother buttons",
          body: "Shared buttons now combine a slight hover scale and lift with a springy icon response and a crisp press compression, while keeping destructive actions restrained.",
          points: [
            "Achievements and Home in the Arcade header, Arcade in the shop header, and game navigation, sound and fullscreen buttons now use framed outline buttons instead of plain ghost text.",
            "My Day and Earned achievements on Home, Customize Home, and All experiments in the Lab use framed outline buttons as well.",
            "Switches, checkboxes, tabs, select triggers and reset icon buttons now respond on hover and press.",
          ],
          where: "Across the app",
          link: { href: "/arcade", label: "Open the Arcade" },
        },
        {
          title: "Profile flair, themes, frames and appearance cards",
          body: "Every choice card in Customization and Settings now gives immediate visual and tactile feedback.",
          points: [
            "Avatar decoration cards, profile badges and titles lift and glow on hover, compress on press, and use theme-aware borders so they read clearly on light themes too.",
            "Theme cards, artwork frame cards and appearance choice cards highlight their radio indicator on hover and respond with a tactile press.",
            "Shortcut recorders, time-zone selectors and settings navigation tabs share the same hover and press treatment.",
          ],
          where: "Customization → Profile, Themes, Artwork frames & Appearance",
          link: { href: "/customization/profile", label: "Open Profile customization" },
        },
        {
          title: "Arcade shops, games and To Do controls",
          body: "Catalog filters, shop cards, game controls and task lists now communicate hover, active preview, locked and pressed states consistently.",
          points: [
            "In the Arcade shop and per-game shops, the card currently in the preview pane keeps an In preview badge visible, Equipped items sit in a matching pill, and locked buttons use a dashed border.",
            "Filter chips across the shops, Customization, Achievements and Version History show hover elevation, active count highlights and press scaling, and empty searches offer a framed Clear button.",
            "Sudoku's number pad, Snake's setup tiles, Coin Slots' bet pills and Spin button, and To Do's task rows, checkboxes and sidebar lists all respond smoothly to hover and press while respecting Motion: Off and reduced motion.",
          ],
          where: "Arcade shop, games & To Do",
          link: { href: "/arcade/shop", label: "Visit the Arcade shop" },
        },
      ],
    },
  },
  {
    id: "2026-11-02-product-tour",
    date: "2026-11-02",
    title: "The Tour - Amethyst in 3D",
    intro: "A new scrolling 3D tour walks through everything Amethyst does, from the Archive and To Do to every Arcade game, Coin Slots, the Vault, the Lab and customization. Anyone can watch it, signed in or not.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "The Tour", text: "Scroll through a 3D trailer with one scene per feature, each with a short explanation and a link to try it." },
      { kind: "new", feature: "Every Arcade game", text: "2048, Flutter, Snake, Sudoku, Fruit Slice and Stacker each get their own scene, followed by Coin Slots." },
      { kind: "new", feature: "Easy to find", text: "Open it from The Tour in the account menu, or from the sign-in page before you have an account." },
    ],
    details: {
      new: [
        {
          title: "A 3D tour of Amethyst",
          body: "Scrolling moves the camera from scene to scene; nothing takes over your scroll wheel. Each stop has a heading, a short description and a link to the feature.",
          points: [
            "The Archive: cover art fanning out like a shelf.",
            "To Do: a My Day list that checks itself off as you scroll.",
            "The Arcade: a row of cabinets, then one scene per game - 2048 tiles merging, Flutter flying through crystal pillars, Snake eating, Sudoku filling in, Fruit Slice cutting and Stacker trimming its tower.",
            "Coin Slots: the reels spin and land on a win.",
            "The Vault and the Lab: the vault door unlocks and the Lab's experiments play out.",
            "Customization and achievements: the cover viewer steps through every theme, and a hidden achievement flips to reveal itself.",
            "Administrators also see a link to the admin panel in its scene.",
            "The side rail jumps to any chapter; the tour ends with a button to open Amethyst or sign in.",
            "Your Motion setting is respected: with reduced motion the tour shows still scenes, and without 3D support each chapter shows an icon instead.",
          ],
          where: "Account menu → The Tour, or the sign-in page",
          link: { href: "/tour", label: "Take the tour" },
        },
      ],
    },
  },
  {
    id: "2026-11-02-forge-in-steps",
    date: "2026-11-02",
    title: "The Admin Panel - Forge in Steps",
    intro: "For administrators, the Forge now walks through one step at a time beside the always-visible code plate, panel text no longer spills out of its cards, and the 3D scene shows up reliably on desktop.",
    icon: "sparkles",
    highlights: [
      { kind: "improved", feature: "The Forge", text: "Code name, rewards and the seal are separate steps, followed by a final Forge step to review and publish; everything fits on screen without scrolling." },
      { kind: "fixed", feature: "Panel text", text: "Large numbers shrink to fit their counters, and scrolling panels fade out inside their frames instead of running past the cut corners." },
      { kind: "fixed", feature: "Desktop display", text: "The scene no longer stays black on some desktop graphics cards; the opening plays again and buttons show clear hover, focus and pressed states." },
    ],
    details: {
      improved: [
        {
          title: "The Forge, one step at a time",
          body: "The code plate stays in view while a single panel beside it shows the current step: 1. Code name, 2. Rewards, 3. Seal (who, when and how often) and 4. Forge, the review with the hold-to-publish seal.",
          points: [
            "Reward tokens fly out of the Rewards step and float on a loop around the code plate, always in view; when you publish they sink into the phrase.",
            "The phrase on the plate updates live as you type.",
            "Back and Next buttons move between steps; Next checks the current step and points out what's missing, and the numbered step markers jump to any step and turn amber when a step needs attention.",
            "The review lists every remaining problem with a link to its step.",
            "The draft status and Discard draft now sit under the code plate; drafts still save automatically.",
          ],
          where: "Admin panel → Forge (administrators only)",
          link: { href: "/admin/new", label: "Open the Forge" },
        },
      ],
      fixed: [
        {
          title: "Text stays inside its cards",
          body: "Overview counters size long numbers to fit and switch to two rows when four in a row would be too narrow. Panels that scroll fade their content out within the frame, and the code plate scales its text to its width.",
          where: "Admin panel (administrators only)",
          link: { href: "/admin", label: "Open the admin panel" },
        },
        {
          title: "Reliable 3D scene on desktop",
          body: "On some desktop graphics cards the scene stayed black. It now renders everywhere, the opening plays, and HUD links, buttons and code rows show clear hover, focus and pressed states.",
          where: "Admin panel (administrators only)",
        },
      ],
    },
  },
  {
    id: "2026-10-31-amethyst-text-cleanup",
    date: "2026-10-31",
    title: "Amethyst Text Cleanup",
    intro: "Redundant explanatory copy is trimmed across What’s New, Arcade and Version History while release details, game controls, shop actions and demo access stay intact.",
    icon: "sparkles",
    highlights: [
      { kind: "improved", feature: "What’s New", text: "Release titles, dates, notices, highlights and full notes now lead without repeated intro paragraphs." },
      { kind: "improved", feature: "Arcade", text: "Shop and minigame surfaces keep balances, controls, cosmetic state and purchase actions with less helper copy." },
      { kind: "improved", feature: "Version History", text: "Playable milestones are condensed while the complete commit catalog and demo actions remain." },
    ],
    details: {
      improved: [
        {
          title: "Less repeated copy",
          body: "What’s New, Arcade and Version History now emphasize release information, game controls, shop state and demo actions without repeating explanatory prose.",
          points: [
            "Historical release intro data remains stored, but release pages no longer render those paragraphs.",
            "Arcade coin balances, cosmetic search, ownership, purchase confirmations, game input and demo routing are unchanged.",
            "Version History retains its full commit catalog, filters, launch behavior and reset confirmation.",
          ],
          where: "What’s new, Arcade and Version history",
        },
      ],
    },
  },
  {
    id: "2026-10-31-sculpted-frames-beta",
    date: "2026-10-31",
    title: "Sculpted 3D Frames (Beta)",
    intro: "The first step toward truly sculpted artwork frames: in the 3D Showcase, Amethyst filigree's ornaments are now real 3D objects instead of painted lines. This is a beta and only the beginning, with far bolder frames to come.",
    icon: "palette",
    highlights: [
      { kind: "improved", feature: "Curled corners", text: "Amethyst's corner filigree is raised metal scrollwork around a faceted gem, reaching slightly past the frame's edge." },
      { kind: "improved", feature: "Crest", text: "The top crest is a faceted amethyst in a metal setting with curling wings, rising above the frame." },
      { kind: "improved", feature: "Real depth", text: "The ornaments catch the light and keep their shape as you turn the card, on portrait and square artwork alike." },
    ],
    details: {
      improved: [
        {
          title: "Amethyst filigree, sculpted",
          body: "In the 3D Showcase, Amethyst filigree's decoration is now built as real 3D ornaments that match its look in the frame picker.",
          points: [
            "Each corner curls into raised metal scrollwork with a faceted violet gem.",
            "The crest is a faceted amethyst with a metal setting, curling wings and beads, and it rises above the top of the frame.",
            "The ornaments stay dimensional at any angle, and the card is framed so they are never cut off.",
            "Your Motion setting is respected; the flat 2D view is unchanged.",
          ],
          where: "Customization → Artwork frames, then open an artwork in Showcase",
          link: { href: "/customization/frames", label: "Choose a frame" },
        },
      ],
    },
  },
  {
    id: "2026-10-31-crimson-sanctum",
    date: "2026-10-31",
    title: "The Admin Panel - Crimson Sanctum",
    intro: "For administrators, the Vault code panel is rebuilt as a real-time 3D sanctum: a huge vault sigil turns in a crimson void, and the panels float around it as true 3D objects, with a full overview, complete code management and a new Forge for creating codes.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "Crimson Sanctum", text: "A live 3D scene with fog, light rays, drifting embers and a reflective floor; panels tilt toward the pointer, and moving between views is a camera flight." },
      { kind: "new", feature: "Overview and management", text: "Live counters, a 30-day redemption timeline, expiring and nearly used-up codes, an activity feed, and full editing of existing codes with their redemption history and audit log." },
      { kind: "new", feature: "The Forge", text: "Rewards become 3D tokens that fly into the core; drafts save automatically, and publishing is a hold-to-confirm charge that ends in a shockwave and the code decoding on its plate." },
    ],
    details: {
      new: [
        {
          title: "A real-time 3D dashboard",
          body: "The admin panel is now one 3D scene. Panels are real page elements placed in 3D, so text stays sharp and every field works with the keyboard and screen readers, while glass, frames, glow and light are drawn around them.",
          points: [
            "The first visit in a session plays the full opening: the sigil ignites, the ring spins up and the panels assemble from shards. Later visits play a short version, and any key or click skips it.",
            "Overview, Codes and the Forge are stations around the core; switching views flies the camera between them while panels dissolve out and in.",
            "Panels and code tablets lean toward the pointer, lift on hover and press in on click, and hold still while you type or scroll.",
            "Optional sound follows the panel's sound switch. Reduced motion and the in-app motion setting keep a still, lit scene; devices without 3D graphics get a styled flat layout with every feature.",
          ],
          where: "Admin panel (administrators only)",
          link: { href: "/admin", label: "Open the admin panel" },
        },
        {
          title: "Overview and code management",
          body: "The overview counts active codes, redemptions, coins granted and this week's redemptions, shows the last 30 days as a timeline, and lists codes that expire soon or are nearly used up, next to a live activity feed.",
          points: [
            "Codes are searchable, filterable by status and sortable. Each status has its own look: active codes pulse crimson, scheduled ones glow dimly, expired ones turn ashen, used-up ones crack and disabled ones go dark.",
            "A code's page shows its full setup, who redeemed it and when, and its audit log.",
            "Label, start, expiry, limits, audience and rewards can be edited; changes only affect future redemptions. Codes can be disabled and re-enabled, and cloned into the Forge. Drafts can be deleted after a confirmation.",
          ],
          where: "Admin panel (administrators only)",
          link: { href: "/admin/codes", label: "Open the codes" },
        },
        {
          title: "Forging and publishing codes",
          body: "The Forge collects rewards (coins, cosmetics including secret ones, and achievements), then the limits, audience, schedule and code type: a phrase, a random code or custom text.",
          points: [
            "Every reward appears as a token (a coin stack, a cosmetic card or an achievement medallion) that flies into the core; removing it ejects it again.",
            "Drafts save automatically. The review shows the most coins the code can pay out.",
            "Publishing is a hold-to-confirm charge. Only after the server confirms does the core implode and the real code decode on its plate, with a prominent Copy button; it's shown only then.",
            "If publishing fails, the core glitches, a clear message appears, and every value stays in place.",
          ],
          where: "Admin panel (administrators only)",
          link: { href: "/admin/new", label: "Open the Forge" },
        },
      ],
    },
  },
  {
    id: "2026-10-31-system-vault-console",
    date: "2026-10-31",
    title: "The Admin Panel",
    intro: "For administrators, the Vault code panel is now a single floating System window in the Vault's crimson: it unfolds from a thin strip of light, leans toward your pointer in real depth and decodes its text into place.",
    icon: "sparkles",
    highlights: [
      { kind: "improved", feature: "System window", text: "A dark translucent window with layered crimson framing, a framed title strip and glowing bars above and below, tilting with the pointer and steadying while you type, press or scroll." },
      { kind: "improved", feature: "Builder steps", text: "Each builder step folds the window to a strip and unfolds the next one, keeping every value, selection and focus." },
      { kind: "improved", feature: "Publishing", text: "The code is revealed only after the server confirms it: the frame flares crimson, then the real code decodes with a clear Copy button." },
    ],
    details: {
      improved: [
        {
          title: "A crimson System window",
          body: "Creating and reviewing Vault codes happens in one System window: a narrow strip expands into the window, the frame lights up, a brief distortion passes and the text decodes from scrambled fragments. Every form and list on it is still a regular, accessible page element.",
          points: [
            "The first visit in a session plays the full opening, later visits a shorter one, and any key, click or the Skip button ends it. Leaving the panel from inside folds the window back into a strip.",
            "The frame, the glass and the bars sit at different depths and catch the light as the window leans toward the pointer. It steadies while you type, press or scroll; on phones it keeps its depth without hover.",
            "The window grows to fit what it shows; long lists scroll inside while the title and actions stay in place.",
            "Optional sound follows the panel's mute switch. Reduced motion and the in-app motion setting keep everything still, and devices without 3D graphics get a drawn window instead.",
          ],
          where: "Admin panel (administrators only)",
        },
        {
          title: "Building and publishing codes",
          body: "The builder keeps its steps (rewards, values and selections, eligibility and limits, review, publish); each step is its own state of the window rather than a card inside it.",
          points: [
            "Searches, filters, cosmetic previews, achievement picks, coins, permissions, dates and limits all carry over between steps.",
            "Publishing sends the request right away. Only after the server confirms does the frame flare and the real code decode on its plate, with a prominent Copy button.",
            "If publishing fails, every value stays in place and the error stays readable; nothing is celebrated and retries never create a second code.",
          ],
          where: "Admin panel (administrators only)",
        },
      ],
    },
  },
  {
    id: "2026-10-30-vault-code-rules",
    date: "2026-10-30",
    title: "The Vault Rework",
    intro: "Secret codes in the Vault can now unlock achievements alongside coins and cosmetics, open on a set date, and be meant for specific members — and a retried redemption never counts twice.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "Achievement codes", text: "A code can unlock achievements, complete with their own rewards and notifications, shown in the Vault’s reveal and access log." },
      { kind: "new", feature: "Scheduled codes", text: "Some codes open on a set date; until then the seal stays dormant." },
      { kind: "improved", feature: "Safer redemptions", text: "If your connection drops mid-redemption, trying again picks up the original result instead of redeeming twice." },
    ],
    details: {
      new: [
        {
          title: "Codes can unlock achievements",
          body: "When a code includes an achievement, redeeming it unlocks that achievement for you, with its usual one-time reward and unlock notification. The reveal and your access log list it next to any coins and cosmetics.",
          points: [
            "Achievements you already have stay exactly as they were, with their original unlock date; nothing is granted twice.",
            "Cosmetics you already own are kept and the code still opens.",
            "Coins from codes never count toward the 600-coin daily earning limit.",
          ],
          where: "The Vault",
          link: { href: "/vault", label: "Open the Vault" },
        },
        {
          title: "Scheduled and limited codes",
          body: "A code may open on a specific date, close on another, or be meant for certain members only. A few codes can even be redeemed more than once per account.",
          where: "The Vault",
        },
      ],
      improved: [
        {
          title: "Retries never redeem twice",
          body: "Each redemption attempt carries its own identifier. If the answer gets lost and you try the same code again, the Vault shows the original result instead of granting it a second time.",
        },
      ],
    },
  },
  {
    id: "2026-10-30-achievement-rewards",
    date: "2026-10-30",
    title: "Achievement Rewards",
    intro: "Every achievement in your cabinet now grants a one-time reward: coins for ordinary milestones, and exclusive artwork frames, avatar decorations, profile badges and titles for major feats.",
    icon: "trophy",
    highlights: [
      { kind: "new", feature: "Milestone rewards", text: "Ordinary achievements grant 30–75 coins; significant milestones grant 100–150 coins and 13 achievement-exclusive frames, decorations, badges and titles." },
      { kind: "new", feature: "Hidden milestones", text: "Secret achievements stay masked in your cabinet and search until you discover and unlock them." },
      { kind: "improved", feature: "Coordinated celebrations", text: "Unlock notifications reveal the medal alongside its coin payout and real cosmetic artwork, with a one-click Equip action and a grouped summary for backfilled milestones." },
      { kind: "improved", feature: "Reward & source filters", text: "Filter achievements by reward type, and filter Artwork frames, Profile decorations, Badges & titles and the Arcade shop to achievement-exclusive items." },
    ],
    details: {
      new: [
        {
          title: "Coins and exclusive cosmetics for every achievement",
          body: "Each achievement now grants a deliberate one-time reward verified by the server. Ordinary milestones award 30–75 Arcade coins, while capstone challenges across 2048, Flutter, Snake, Hard Sudoku, Fruit Slice, Tower Stacker, your Archive and Discovery unlock 13 exclusive items — including the Obsidian relic and Celestial prism artwork frames, the Archivist’s plume and Champion’s halo avatar decorations, four profile badges and five profile titles.",
          points: [
            "Every achievement reward is granted at most once per account and recorded in your wallet ledger as an Achievement transaction.",
            "Milestone coins are exempt from the 600-coin daily play and Coin Slots limit: reaching the daily play cap never clips an achievement reward, and achievement coins don’t reduce your daily play room.",
            "If you already own a reward item when a milestone is granted, ownership is preserved without duplicate grants or synthetic coin compensation.",
            "Previously unlocked achievements are automatically backfilled so existing accounts receive their full historical coins and cosmetics.",
          ],
          where: "Home → Achievements",
          link: { href: "/achievements", label: "Open Achievements" },
        },
        {
          title: "Hidden discovery achievements",
          body: "Secret milestones stay genuinely hidden — their name, goal, icon and reward are masked on cards, detail views and search until you meet their reveal condition.",
          where: "Achievements → Discovery",
          link: { href: "/achievements", label: "Explore your cabinet" },
        },
      ],
      improved: [
        {
          title: "Coordinated reward reveal & one-click Equip",
          body: "When you earn an achievement, the celebration reveals both the medal and its granted coins or cosmetic artwork, with a button to equip a newly unlocked frame, decoration, badge or title on the spot. Multiple backfilled milestones are grouped into a single summary notification instead of playing back-to-back.",
          where: "Achievements → select any earned medal",
          link: { href: "/achievements", label: "View your medals" },
        },
        {
          title: "Reward filters and achievement-exclusive views",
          body: "Narrow the achievement cabinet by Coins, Frames & decorations or Badges & titles alongside status, group, game and search. In Customization (Artwork frames and Profile) and the Arcade shop, a dedicated Achievements filter lets you browse and equip milestone-exclusive cosmetics.",
          where: "Customization → Profile, Customization → Artwork frames, and Arcade → Shop",
          link: { href: "/customization/profile", label: "Open Profile customization" },
        },
      ],
    },
  },
  {
    id: "2026-10-30-version-history",
    date: "2026-10-30",
    title: "Version History & Demos",
    intro: "Browse every retained commit in Amethyst’s history and step into five prepared historical milestones as isolated, fresh-account demos.",
    icon: "box",
    highlights: [
      { kind: "new", feature: "Commit catalog", text: "All 60 retained commits across branches and tags, with search, pagination, milestone labels, full SHAs and commit dates distinguished from verified release dates." },
      { kind: "new", feature: "Milestone demos", text: "Five prepared eras of Amethyst run their original interfaces and database schemas in isolated environments." },
      { kind: "new", feature: "Fresh accounts & reset", text: "Each visitor gets a separate demo workspace per enabled commit that persists for 24 hours and can be reset with confirmation at any time." },
      { kind: "improved", feature: "Clear demo states", text: "Every commit is marked Available Demo, Not Prepared or Unavailable with the reason why." },
    ],
    details: {
      new: [
        {
          title: "Complete commit catalog",
          body: "Version history lists every retained commit reachable from the repository’s branches and tags, deduplicated by its full 40-character SHA. Search by SHA, title, milestone, release or schema migration, filter by demo state or milestones, and page through the history.",
          points: [
            "Commit dates are shown alongside verified production release dates and link to the corresponding release notes when available.",
            "Each commit is explicitly marked Available Demo, Not Prepared or Unavailable with a short explanation. Listing a commit never implies it has a playable demo.",
          ],
          where: "Account menu → Version history, or What’s new → Version history",
          link: { href: "/version-history", label: "Open Version history" },
        },
        {
          title: "Five playable historical milestones",
          body: "Five milestones are prepared as interactive demos running their original code and matching database migrations: the original Amethyst Archives launch (3c27ef5), User-Created Collections (7ec9aa4), the first Home Dashboard & Five Themes (03070fc), Readable URLs, 3D Showcase & the Arcade Hall (3882439), and the Tasks Workspace with the Archive | Tasks switcher (688565d).",
          points: [
            "Each enabled demo runs on its own origin with its own database schema, scoped cookies and isolated local storage.",
            "External artwork and account emails are safely contained inside the demo environment, and demos never touch your real account, private files or coin balance.",
            "A compact demo bar in the corner shows the commit SHA, retention period, Reset Demo and a direct link back to current Amethyst.",
          ],
          where: "Version history → Playable historical milestones",
          link: { href: "/version-history", label: "Explore milestone demos" },
        },
        {
          title: "Fresh-account workspaces and Reset Demo",
          body: "Opening an enabled milestone gives you a fresh demo account starting with that version’s own defaults. Create collections, entries, folders, notes, checklists or tasks wherever that version supported them, and your changes stay across navigation and reloads for 24 hours.",
          points: [
            "Reset Demo asks for confirmation first and clears only your demo workspace for that specific commit.",
            "Other visitors, other historical versions and your real Amethyst account are never affected.",
          ],
          link: { href: "/version-history", label: "Open Version history" },
        },
      ],
    },
  },
  {
    id: "2026-10-30-vault-forged",
    date: "2026-10-30",
    title: "The Vault, forged in 3D",
    intro: "The Vault is now a real 3D artifact: a black-metal seal with crimson light in its seams, an iris door that physically opens and an access console you type into directly.",
    icon: "sparkles",
    highlights: [
      { kind: "improved", feature: "Summoning", text: "The vault rises out of the dark while its access console flies together piece by piece and powers on. Any key or tap skips straight in." },
      { kind: "improved", feature: "Access console", text: "The code panel is part of a physical console that leans toward your pointer, holds still while you type and is linked to the vault." },
      { kind: "improved", feature: "Unlocking", text: "A correct code lines up the rings, pulls back the locks and swings the iris open before your rewards fly out of its core." },
      { kind: "improved", feature: "Answers", text: "Wrong codes jam the dial, dormant codes leave the vault grey, lockdowns slam the locks shut and lost connections fill the screen with static." },
    ],
    details: {
      improved: [
        {
          title: "Summoning the Vault",
          body: "Arriving at the Vault now builds it in front of you: smoke and embers gather, the seal rises and turns into place, and the access console assembles its frame around the code panel before its screen lights up.",
          points: [
            "The full entrance plays once per visit, later visits get a short one, and nothing replays after an answer.",
            "Optional sound follows the entrance step by step and respects your Arcade sound setting and the switch on the page.",
          ],
          where: "Account menu → The Vault",
          link: { href: "/vault", label: "Open the Vault" },
        },
        {
          title: "The access console",
          body: "The code field and buttons sit on the console's screen and move with it, so they stay exactly where the console is. They are still the page's own controls, so the keyboard, screen readers and password managers work as before.",
          points: [
            "On desktop the console leans toward your pointer and edges closer when you reach for it. On phones it keeps a steady view with a gentle drift, with no hover or motion permission needed.",
            "While you check a code, the dial ratchets, the scanner sweeps the screen and energy runs down the link into the vault.",
          ],
          link: { href: "/vault", label: "Open the Vault" },
        },
        {
          title: "Opening the vault",
          body: "Once the server accepts a code, the console steps aside, the rings disengage and the iris door swings open. Your rewards then come forward out of the light as cards you can inspect, and Continue brings the console back with the result.",
          points: [
            "Rewards are only shown after the server confirms them, and a skipped or interrupted animation never hides or repeats one.",
            "Reduced motion and Motion: Off show every state at rest. Browsers without 3D graphics get the drawn seal instead.",
          ],
          link: { href: "/vault", label: "Open the Vault" },
        },
      ],
    },
  },
  {
    id: "2026-10-30-vault-rework",
    date: "2026-10-30",
    title: "The Vault, resealed",
    intro: "The Vault is now a 3D chamber you summon: a heavy red-lit vault rises out of the dark, opens for the right code and hands you what you’ve earned. Codes can now be real words.",
    icon: "sparkles",
    highlights: [
      { kind: "improved", feature: "The Vault", text: "A 3D vault rises out of the dark when you arrive, with its code panel projected beside it. Any key or tap skips straight in." },
      { kind: "improved", feature: "Reward reveal", text: "Correct codes break the seals, open the doors and send each reward out as a card you can inspect, shown on your own avatar and covers." },
      { kind: "new", feature: "Word codes", text: "Codes can be words or phrases such as SHADOW. Letter case and extra spaces don’t matter." },
      { kind: "improved", feature: "Clear answers", text: "Wrong, expired, already-claimed, rate-limited and interrupted attempts each get their own answer." },
    ],
    details: {
      improved: [
        {
          title: "Summon the Vault",
          body: "Opening the Vault calls it up: the chamber stirs, a red aura gathers over a sigil on the floor and a thick, layered vault rises into place, its code panel locking in beside it. The full sequence plays once per visit; after that it settles in quickly, and any key, tap or Skip intro jumps straight to the code field.",
          points: [
            "The vault follows your pointer slightly on desktop and stays steady on touch screens.",
            "Optional sound: a low hum while the vault is on screen, plus mechanical sounds for each answer. It follows your Arcade sound setting and the switch on the page.",
            "Reduced motion and Motion: Off show the vault at rest with no entrance. Browsers without 3D graphics get the drawn seal instead.",
          ],
          where: "Account menu → The Vault",
          link: { href: "/vault", label: "Open the Vault" },
        },
        {
          title: "Opening the vault",
          body: "Your code is sent the moment you submit it. Once the server accepts it, the seals part, the doors swing open and light floods out as each reward leaves the vault as a card. Choose a card to see it up close: decorations on your own avatar, frames around your own covers, titles on your name. Continue keeps the result on the panel, and View rewards brings the cards back.",
          points: [
            "Nothing is shown as yours until the server confirms it, and interrupting the animation never hides or repeats a reward.",
            "Wrong and expired codes, codes you’ve already claimed, too many tries and connection problems each have their own reaction, and none of them replays the unlock.",
          ],
          link: { href: "/vault", label: "Open the Vault" },
        },
        {
          title: "Clearer answers",
          body: "The vault now tells you whether a code is wrong, whether it exists but has expired or run out, or whether your account already claimed it, without revealing anything about other codes.",
          points: [
            "If your connection drops mid-attempt, the vault checks your access log instead of asking twice. Rewards are never granted twice.",
            "Your access log lists every seal you’ve broken and what it held.",
          ],
          link: { href: "/vault", label: "Open the Vault" },
        },
      ],
      new: [
        {
          title: "Codes made of words",
          body: "Secret codes can now be words or short phrases, such as SHADOW or OPEN THE VAULT. Letter case doesn’t matter and extra spaces are ignored, so “open  the vault” works too. Codes you already have keep working exactly as before.",
          link: { href: "/vault", label: "Speak a code" },
        },
      ],
    },
  },
  {
    id: "2026-10-30-vault-lab-slots",
    date: "2026-10-30",
    title: "The Vault, the Lab and Coin Slots",
    intro: "Three hidden corners of Amethyst: a vault that opens for secret codes, a lab of ridiculous interface experiments and a slot machine for the coins you’ve earned.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "The Vault", text: "Found a secret code? Speak it to the Vault for coins, rare cosmetics, badges and titles." },
      { kind: "new", feature: "The Lab", text: "Five harmless, silly interface experiments, each with reset, exit and an easy mode." },
      { kind: "new", feature: "Coin Slots", text: "Spin the reels with earned coins, with the exact odds, payouts and your net result always shown." },
      { kind: "new", feature: "Badges & titles", text: "Wear a profile badge and title next to your name." },
    ],
    details: {
      new: [
        {
          title: "The Vault",
          body: "A hidden door that answers to secret codes. Each code opens once per account and can hold coins, exclusive avatar decorations, profile badges, titles or a bundle. Secret items stay out of the shop until you unlock them, then appear with your other cosmetics.",
          points: ["Spaces, dashes and letter case don’t matter.", "After several wrong codes the vault rests for a while.", "Your finds are listed below the door."],
          where: "Account menu → The Vault",
          link: { href: "/vault", label: "Open the Vault" },
        },
        {
          title: "The Lab",
          body: "A searchable gallery of pretend experiments: an uphill volume slider, a button that runs away, a subscription-cancellation maze, an awkward date picker and a password gauntlet. Nothing in the Lab touches your real settings, account or coins.",
          points: ["Every experiment has Reset and Exit, and Easy mode swaps in a plain, keyboard-friendly version.", "The demo tone has its own quiet volume and starts muted."],
          where: "Account menu → The Lab",
          link: { href: "/lab", label: "Visit the Lab" },
        },
        {
          title: "Coin Slots",
          body: "A three-reel machine in the Arcade that plays with coins you’ve earned. The server draws every spin when you press Spin; the paytable shows the exact chance of every line and the average return.",
          points: [
            "Bets of 1 to 5 coins, one spin per press and no autoplay.",
            "Each result shows the bet, the payout and your net profit or loss.",
            "You can wager up to 300 coins in any 24 hours. Interrupted spins are recovered without charging twice.",
            "Coins have no cash value and can’t be bought or cashed out.",
          ],
          where: "Arcade → Coin Slots",
          link: { href: "/arcade/slots", label: "Play Coin Slots" },
        },
        {
          title: "Profile badges and titles",
          body: "Badges and titles from the Vault can be worn on your profile. They show next to your name on Home and in the account menu.",
          where: "Customization → Profile",
          link: { href: "/customization/profile", label: "Choose a badge" },
        },
      ],
      improved: [
        {
          title: "One daily coin limit",
          body: "Net Coin Slots winnings share the 600-coin daily limit with game rewards, so the machine can’t be used to earn past it. Coins from Vault codes don’t count toward the limit.",
          link: { href: "/arcade/shop", label: "Open the shop" },
        },
      ],
    },
  },
  {
    id: "2026-10-30-big-lists-shops-search",
    date: "2026-10-30",
    title: "Big To Do lists, bulk actions and catalog search",
    intro: "To Do stays fast with well over a thousand tasks and lets you act on many at once. Shops and other catalogs can now be searched.",
    icon: "tasks",
    highlights: [
      { kind: "improved", feature: "To Do", text: "Only the tasks on screen are drawn, so very large lists open, scroll and respond much faster." },
      { kind: "new", feature: "Selection", text: "Select tasks with their checkbox and Shift-click to select a range, then complete, star, plan, reschedule, move or delete them together." },
      { kind: "improved", feature: "Reordering", text: "Drag tasks by their handle, see where they will land, and move a whole selection at once. The new order is saved when you drop." },
      { kind: "new", feature: "Search", text: "Game shops, the Arcade shop, games, themes, frames and achievements each have a search box that works alongside their filters." },
      { kind: "fixed", feature: "Update log", text: "Release dates now show the day each update actually went live." },
    ],
    details: {
      new: [
        {
          title: "Select many tasks",
          body: "Each task has a selection box next to its completion circle. Shift-click selects everything between your last pick and this one, in the order the list shows. Ctrl/Cmd+A selects the whole list and Escape clears the selection.",
          points: [
            "The selection bar shows how many tasks are selected and offers Complete, Star, My Day, Due date, Move to list and Delete.",
            "Delete always asks first. If some tasks can't be changed, the others still are, and you're told which failed.",
            "The selection follows tasks, not positions: sorting or filtering keeps it, and tasks that disappear leave it.",
          ],
          where: "To Do",
          link: { href: "/tasks", label: "Open To Do" },
        },
        {
          title: "Search catalogs",
          body: "Search matches names, descriptions and categories, ignores case and accents, and always covers the whole catalog. It combines with category and Owned/Not owned filters. Escape or the clear button empties it. Short pickers only get a search box once they grow long.",
          points: ["Game shops and the Arcade shop", "Arcade games", "Themes and artwork frames", "Achievements"],
          link: { href: "/arcade/shop", label: "Open the Arcade shop" },
        },
      ],
      improved: [
        {
          title: "Large lists",
          body: "To Do now draws only the tasks you can see, while filters, search, selection and bulk actions still work on every task. In a 1,250-task test list, opening the list was about eight times faster and selecting a task went from seconds to a fraction of a second.",
          link: { href: "/tasks", label: "Open To Do" },
        },
        {
          title: "Reordering",
          body: "Each task has a drag handle. A line shows where it will land, and the list scrolls when you drag near its edge. Nothing is saved until you drop, and the order is restored if saving fails. With the keyboard, Alt+Arrow keys move the focused task or the whole selection. Manual order is turned off while a sort is active.",
        },
        {
          title: "Shop entrances",
          body: "The Arcade shop introduces each game shop with that game's artwork and colors. Game shops list prices more plainly and show which item is in the preview.",
          link: { href: "/arcade/shop", label: "Open the Arcade shop" },
        },
      ],
      fixed: [
        {
          title: "Update log dates",
          body: "Several releases showed dates days or weeks in the future. Each release now shows the day it was first deployed, and dates no longer depend on your time zone.",
          link: { href: "/whats-new", label: "Open the update log" },
        },
      ],
    },
  },
  {
    id: "2026-11-13-first-load",
    date: "2026-10-30",
    title: "A Lighter Load - Performance Upgrades",
    intro: "Home gives its first screen priority, with smaller startup downloads and less unrelated background work.",
    icon: "home",
    highlights: [
      { kind: "improved", feature: "Startup", text: "Home downloads fewer scripts before its first screen is ready." },
      { kind: "improved", feature: "Navigation", text: "Home and navigation links preload their destination when you hover or focus them, rather than loading other areas during startup." },
      { kind: "improved", feature: "Upload controls", text: "Legacy storage code loads only when a legacy upload needs it, rather than during ordinary page startup." },
      { kind: "improved", feature: "Artwork", text: "Small covers, fan cards and blurred backdrops download a size that fits them, and linked artwork stays cached for weeks instead of a day." },
      { kind: "improved", feature: "Home and entries", text: "Home, collections and entry workspaces start more of their reads at once, and links to a specific file open it without an extra wait." },
      { kind: "improved", feature: "To Do", text: "Large lists update only the task that changed, long completed sections render lazily, and the notes editor loads when you open a task's notes." },
      { kind: "improved", feature: "Responsiveness", text: "Opening menus, adding items and other page changes restyle far less of the page, so interactions respond sooner on every theme and motion setting." },
    ],
    details: {
      improved: [
        {
          title: "Preloading follows your intent",
          body: "The first screen no longer competes with automatic downloads for the To Do area, entry workspaces and the update log. Destination preloading starts on pointer or keyboard intent, with normal links and client-side navigation intact.",
          link: { href: "/", label: "Open Home" },
        },
        {
          title: "Upload code when it is needed",
          body: "The storage SDK used by legacy uploads no longer downloads just because a page has image-upload controls. R2 uploads and legacy uploads keep their existing authentication, confirmation and owner-scoped storage behavior.",
        },
        {
          title: "Right-sized, longer-lived artwork",
          body: "Home's first screen asks for roughly a sixth of the image pixels it used to. Resized copies of linked artwork refresh every 30 days (staggered) rather than daily, and sibling sizes reuse one download. Originals and the artwork viewer are unchanged.",
          link: { href: "/", label: "Open Home" },
        },
        {
          title: "Smoother To Do",
          body: "Checking, starring or editing a task no longer re-renders every other row, and the customize-fan editor on Home loads only when you open it.",
          link: { href: "/tasks", label: "Open To Do" },
        },
        {
          title: "Less restyling per interaction",
          body: "Themes and the motion setting now apply from the page root directly, and unused component styles that watched the whole page were removed. In testing, adding an element or opening a menu went from roughly 60–130 ms of style work to under 2 ms. Themes, motion settings and every component look the same.",
          link: { href: "/settings", label: "Open Settings" },
        },
      ],
    },
  },
  {
    id: "2026-11-12-performance",
    date: "2026-10-29",
    title: "A Quicker Archive",
    intro: "Artwork loads at a size suited to its place, collection searches keep their cards ready, and long notes do less repeated work. Your originals, effects and customization stay intact.",
    icon: "sparkles",
    highlights: [
      { kind: "fixed", feature: "Private uploads", text: "Restored the production R2 configuration for previously migrated images, without moving or replacing your originals." },
      { kind: "improved", feature: "Artwork", text: "Private, cached sizes for covers, banners and avatars, with the original still available in the artwork viewer." },
      { kind: "improved", feature: "Collections and notes", text: "Less card rebuilding during search and incremental task counting while typing in long notes." },
      { kind: "fixed", feature: "To Do sync", text: "The security policy now allows the account's authenticated realtime connection, with reconnect and polling fallback preserved." },
      { kind: "improved", feature: "Opening pages and previews", text: "Independent reads run together, achievements reconcile once per version in the background, and hidden game-shop previews pause." },
    ],
    details: {
      improved: [
        {
          title: "Artwork that fits",
          body: "Covers, banners and avatars request a size suited to their displayed size and screen density. Generated sizes stay in private storage and are reused rather than rebuilt for every visit. Animated images stay animated, transparency is preserved, and full-resolution viewing still uses the original.",
          link: { href: "/collections", label: "Open your archive" },
        },
        {
          title: "Search and long notes",
          body: "Searching a collection no longer rebuilds every unchanged card when you clear a query. Long notes reuse Markdown parsing work for their task counts; local draft backups, serialized saving and version-conflict protection are unchanged.",
        },
        {
          title: "Less waiting, less background work",
          body: "Home, entry workspaces and the shop overlap independent reads. Achievement backfill no longer runs during page rendering: a versioned account check reconciles it in the background without duplicate awards. Cosmetic previews stop drawing offscreen or in hidden tabs and resume without jumping ahead, at the same visible quality and motion settings.",
          link: { href: "/arcade/shop", label: "Open the Arcade Shop" },
        },
      ],
      fixed: [
        {
          title: "Private image delivery and task updates",
          body: "Production now has the required private R2 configuration for verified uploaded images. The security policy permits only the configured Supabase project's realtime origin, restoring live To Do updates without loosening account isolation or removing offline and polling fallbacks.",
          link: { href: "/tasks", label: "Open To Do" },
        },
      ],
    },
  },
  {
    id: "2026-11-11-game-shops",
    date: "2026-10-29",
    title: "Arcade - Minigame Shops",
    intro: "Each of the six Arcade games now has its own shop of cosmetics, bought with the coins you earn by playing. They change how a game looks, never how it plays.",
    icon: "gamepad",
    highlights: [
      { kind: "new", feature: "Game shops", text: "Skins, themes, effects, fonts and art styles for Snake, 2048, Flutter, Sudoku, Fruit Slice and Tower Stacker." },
      { kind: "new", feature: "Live previews", text: "Try anything on in an animated preview, and combine items across categories, before spending a coin." },
      { kind: "new", feature: "Shop button in every game", text: "Open the game’s shop mid-round: the game pauses and picks up exactly where you left it, with your new look applied." },
      { kind: "improved", feature: "Arcade Shop", text: "Six new buttons take you straight to each game’s shop." },
    ],
    details: {
      new: [
        {
          title: "Game shops",
          body: "Every game has its own shop with several categories, each holding seven items plus a free default you can always switch back to.",
          points: [
            "Snake: colors & patterns, map themes, eating & growth effects, and pixel, hand-drawn, clay and neon art styles.",
            "2048: tile colors & materials, board themes, number fonts, merge effects, and retro, candy, glass and wooden art styles.",
            "Flutter: playable characters, flight trails, obstacle skins and background scenery.",
            "Sudoku: board themes (including newspaper, notebook and chalkboard), number fonts, cell & grid styles and highlight colors.",
            "Fruit Slice: blades & trails, fruit skins, backgrounds, juice & particle effects, and cartoon, pixel and watercolor art styles.",
            "Tower Stacker: block colors & materials, tower themes (including skyscraper, toys and cake), scenery and perfect-placement effects.",
          ],
          where: "Arcade → any game → Shop, or Arcade Shop → Game shops",
          link: { href: "/arcade/shop", label: "Open the Arcade Shop" },
        },
        {
          title: "Buying, equipping and previews",
          body: "Picking an item only previews it. Buying needs a separate confirmation, and every purchase is a permanent unlock: equip it, switch to another or restore the default any time for free. Your items and choices are saved to your account, so they follow you to every device.",
          points: [
            "Each item shows whether it’s available, owned or equipped, and how many more coins you need if you can’t afford it yet.",
            "Art styles and other items layer together, so each thing you buy stays visible.",
            "Cosmetics never change hitboxes, speed, scoring, rewards or daily challenges, and they follow your motion settings.",
          ],
        },
      ],
    },
  },
  {
    id: "2026-11-10-sudoku-fruit-stacker",
    date: "2026-10-29",
    title: "Tower Stracker Rework & Sudoku, Fruit Slice improvements",
    intro: "Sudoku gets a daily puzzle and reliable saves, Fruit Slice gets sharper slicing, new modes and a daily run, and Tower Stacker is rebuilt in a three-quarter view with precise drops.",
    icon: "gamepad",
    highlights: [
      { kind: "new", feature: "Daily Sudoku", text: "One puzzle a day with a single solution, the same for everyone. It resets at midnight UTC, and results are kept separately and marked as assisted if you used hints." },
      { kind: "new", feature: "Fruit Slice modes and daily run", text: "Choose Classic, Arcade or Zen, each with its own records, or play the seeded daily Arcade run." },
      { kind: "new", feature: "Daily tower and Casual rules", text: "Tower Stacker has a seeded daily tower plus Classic and Casual rule sets, each with its own records." },
      { kind: "improved", feature: "Precise slicing and stacking", text: "Fruit Slice cuts along the whole swipe, even quick ones. Tower Stacker drops blocks at the moment you press." },
      { kind: "improved", feature: "Sudoku saves", text: "Entries, pencil marks, time and hints are saved automatically and restored after a refresh. The timer only runs while the puzzle is on screen." },
    ],
    details: {
      new: [
        {
          title: "Daily Sudoku",
          body: "Open the puzzle picker and choose Daily. Everyone gets the same medium puzzle, and the picker shows when the next one arrives.",
          points: [
            "Daily progress is saved separately from your regular puzzle, and the date change never replaces a puzzle you are playing.",
            "Hints fill in one cell. Any solve that uses a hint is marked as assisted and does not count toward fastest times.",
          ],
          where: "Arcade → Sudoku → Daily",
          link: { href: "/arcade/sudoku", label: "Play Sudoku" },
        },
        {
          title: "Fruit Slice modes",
          body: "Classic: three misses or a bomb ends the round. Arcade: 60 seconds, and a bomb costs points. Zen: 90 seconds with no bombs. Daily: today's seeded Arcade run, the same for everyone, with unlimited retries.",
          where: "Arcade → Fruit Slice",
          link: { href: "/arcade/fruit-slice", label: "Play Fruit Slice" },
        },
        {
          title: "Daily tower and rule sets",
          body: "Classic and Daily never give width back. Casual widens the block again from the third perfect in a row and continues your existing records. Daily uses the same slider sequence for everyone.",
          where: "Arcade → Tower Stacker",
          link: { href: "/arcade/stacker", label: "Play Tower Stacker" },
        },
      ],
      improved: [
        {
          title: "Satisfying cuts",
          body: "Fruit splits along your swipe, with juice and a smooth blade trail. Slicing several fruit in one stroke earns a single combo bonus, and swiping no longer scrolls the page.",
        },
        {
          title: "Tower Stacker, rebuilt",
          body: "Blocks now have visible depth in a three-quarter view. Overhangs fall away, and the camera follows the tower and pulls back to show it all when the run ends.",
          points: [
            "Perfect drops snap within a small, fixed tolerance. Streaks build up feedback and sound.",
            "Retry straight from the results panel. The press that ends a run can't start the next one by accident.",
          ],
        },
      ],
    },
  },
  {
    id: "2026-10-29-private-attachment-delivery",
    date: "2026-10-29",
    title: "Private attachment delivery fixed",
    intro: "Migrated note images and uploaded artwork now load from private R2 storage consistently, while existing documents and image links stay intact.",
    icon: "image",
    highlights: [
      { kind: "fixed", feature: "Attachment delivery", text: "Verified migrated images no longer return to the old storage service because of the upload setting." },
      { kind: "improved", feature: "Private uploads", text: "New image uploads use R2 by default, with the same account-only access." },
      { kind: "improved", feature: "Safe migration", text: "Interrupted migrations can resume from verified existing copies without downloading the originals again." },
    ],
    details: {
      fixed: [
        {
          title: "Existing images keep their links",
          body: "Note embeds, covers, banners and other uploaded images use their verified R2 copies without changing your documents. Images not yet migrated retain their legacy fallback, and originals are preserved.",
        },
      ],
      improved: [
        {
          title: "Private storage, verified copies",
          body: "Attachments still require your signed-in account and use expiring private links. Migration checks file contents before switching delivery, skips verified files and safely recovers interrupted copies.",
        },
      ],
    },
  },
  {
    id: "2026-11-03-2048-flutter-daily",
    date: "2026-10-29",
    title: "2048 & Flutter Upgrades + Daily Challenges",
    intro: "2048 and Flutter each get a daily challenge. 2048 also animates more smoothly, saves unfinished rounds and offers three board sizes. Flutter's flight is fairer and pausing is safer.",
    icon: "gamepad",
    highlights: [
      { kind: "new", feature: "Daily challenges", text: "Every player gets the same seeded 2048 board and Flutter course each day. They reset at midnight UTC, you can retry as often as you like, and each day keeps its own best." },
      { kind: "new", feature: "2048 board sizes and saves", text: "Play on 3×3, 4×4 or 5×5. Each size keeps its own best, and unfinished rounds pick up where you left off." },
      { kind: "improved", feature: "Smoother, bouncier 2048", text: "Tiles glide, squash and wobble as they land, merges pop with a thump, and quick swipes are never lost. After reaching 2048 you can keep going." },
      { kind: "improved", feature: "Fairer Flutter", text: "Flight feels the same at any frame rate, hitboxes match what you see, and the gaps ramp up gradually." },
      { kind: "improved", feature: "Safe pausing", text: "Flutter pauses when you switch away and only resumes after you press Resume and a short countdown." },
    ],
    details: {
      new: [
        {
          title: "Daily 2048 challenge",
          body: "Choose Daily above the board for a 4×4 round in which every tile appears in the same place for everyone. The board shows when the next challenge arrives.",
          points: [
            "Retry as often as you like. Your best for the day is kept separately from your regular records.",
            "An unfinished daily round is saved and can be finished even after the reset.",
          ],
          where: "Arcade → 2048 → Daily",
          link: { href: "/arcade/2048", label: "Play 2048" },
        },
        {
          title: "Daily Flutter course",
          body: "Choose Daily for the same course as everyone else, whatever your device or display. A run that starts before midnight UTC counts for the day it started.",
          where: "Arcade → Flutter → Daily",
          link: { href: "/arcade/flutter", label: "Play Flutter" },
        },
        {
          title: "2048 board sizes",
          body: "Switch between 3×3, 4×4 and 5×5. Your existing 4×4 best stays where it is, and the other sizes record their own.",
          where: "Arcade → 2048",
          link: { href: "/arcade/2048", label: "Play 2048" },
        },
        {
          title: "Saved 2048 rounds",
          body: "Your board, score and progress are saved as you play and restored when you come back, even after a refresh. Each board size and the daily challenge keep their own round, so the daily never replaces your regular game.",
          link: { href: "/arcade/2048", label: "Play 2048" },
        },
      ],
      improved: [
        {
          title: "Smoother, bouncier 2048",
          body: "Every tile now slides smoothly, even during quick moves. Moving tiles stretch, squash against whatever stops them and wobble back. Merged tiles pop out where they land, the board thumps in the direction of the move (harder for bigger tiles), and merges of 128 and up glow. A move that changes nothing gives the board a little shake. On phones that support it, merges give a light buzz. Quick moves are queued and played in order, none twice. Reduced motion keeps only gentle fades, and with animations off tiles move instantly.",
          points: [
            "Reaching 2048 is celebrated once per round. Continue keeps your board and score, or start a new game.",
            "The game ends only when no moves are left. The final board stays visible with your score, best and a button to play again.",
          ],
          link: { href: "/arcade/2048", label: "Play 2048" },
        },
        {
          title: "Fairer Flutter",
          body: "Flaps take effect immediately and only once, and the bird flies the same at any frame rate. Collisions follow the shapes you see, with a little forgiveness at the edges. The distance between gaps grows gradually, and every gap stays reachable.",
          link: { href: "/arcade/flutter", label: "Play Flutter" },
        },
        {
          title: "Safe pausing in Flutter",
          body: "The game freezes when you switch tabs, leave the window or open a menu, and time spent away doesn't count. Press Resume (or P) for a three-second countdown before play continues.",
          link: { href: "/arcade/flutter", label: "Play Flutter" },
        },
      ],
    },
  },
  {
    id: "2026-11-02-snake-speed-game-colors",
    date: "2026-10-29",
    title: "Snake Upgrades + Performance",
    intro: "Snake runs more smoothly and lets you pick a speed, and every Arcade game now has its own colors instead of following your app theme.",
    icon: "gamepad",
    highlights: [
      { kind: "improved", feature: "Smoother Snake", text: "Movement stays fluid on any display, turns register reliably, and busy boards no longer stutter." },
      { kind: "new", feature: "Speeds", text: "Choose Slow, Normal or Fast. Each speed keeps its own best, and timers and effects last just as long at every speed." },
      { kind: "improved", feature: "Game colors", text: "Snake, 2048, Flutter, Fruit Slice, Tower Stacker and Sudoku each have their own look. The Arcade menu and navigation keep your theme." },
    ],
    details: {
      new: [
        {
          title: "Snake speeds",
          body: "Pick the turtle, gauge or rabbit in the setup panel. The speed applies from the next round, and the game speeds up gradually as you eat, just like before.",
          points: [
            "Normal is the pace you already know, so your existing bests stay where they are.",
            "Slow and Fast record their own bests for every mode, mix, board size and fruit amount.",
            "Landmine fuses now count down in seconds, so they last the same at every speed.",
          ],
          where: "Arcade → Snake → Setup",
          link: { href: "/arcade/snake", label: "Play Snake" },
        },
      ],
      improved: [
        {
          title: "Smoother Snake",
          body: "The snake is drawn between moves in step with your screen's refresh rate, the board and scenery are drawn once and reused, and the setup panel no longer refreshes while you play.",
          link: { href: "/arcade/snake", label: "Play Snake" },
        },
        {
          title: "Each game has its own colors",
          body: "Snake has a green snake on a sunny board, 2048 uses its familiar tile colors, Flutter has a daytime sky with green pipes, Fruit Slice a wooden board, Tower Stacker a dusk skyline and Sudoku ink on paper. Scores, overlays and controls in each game stay readable whatever app theme you use.",
          where: "Arcade",
          link: { href: "/arcade", label: "Open the Arcade" },
        },
      ],
    },
  },
  {
    id: "2026-11-01-snake-v2",
    date: "2026-10-29",
    title: "Snake V2: 15 New Gamemodes",
    intro: "Snake has a new hand-drawn look, an icon-based setup, many new modes you can play alone or mix in Blender, and more fruit.",
    icon: "gamepad",
    highlights: [
      { kind: "improved", feature: "New look", text: "An expressive cartoon snake, outlined fruit and objects, and a compact icon setup with tooltips." },
      { kind: "new", feature: "Modes", text: "Peace, Wall, Portal, Two Heads, Winged, Yin Yang, Cheese, Ghost, Key, Boxes, Poison, Statue, Light, Dimension and Landmines." },
      { kind: "new", feature: "Blender", text: "Mix several modes into one round. Combinations that can't work together are greyed out with the reason." },
      { kind: "new", feature: "More fruit", text: "Lemon, pineapple, pear, peach, kiwi, blueberry, plum and mango join the menu and Fruit Salad." },
      { kind: "improved", feature: "Separate bests", text: "Every mode and every mix keeps its own best per board size and fruit amount. Wrap is now called No Borders." },
    ],
    details: {
      new: [
        {
          title: "Modes and Blender",
          body: "Pick a mode icon in the setup panel; hover or focus it for a one-line hint. Choose Blender, then tap the modes to mix.",
          points: [
            "Peace can't end your run: you pass through yourself and the edges. In a mix it overrides every danger.",
            "Wall leaves a brick per fruit, Portal opens linked portal pairs, Statue turns your tail to stone now and then. New objects never cut the board apart or appear right in front of you.",
            "Two Heads swaps head and tail on every fruit; Yin Yang steers two mirrored snakes at once.",
            "Winged fruit flies around, Key fruit waits in a locked box until you grab its key, and in Boxes you push crates onto their targets to open them.",
            "Cheese leaves safe holes in your body, Ghost makes your body passable for a few seconds, and Poison scrambles your controls for a while (the chip above the board shows the new mapping).",
            "Light only shows the area around your head, Dimension flips between two layers each time you eat, and Landmines count down while you stay in a danger zone.",
          ],
          where: "Arcade → Snake → Setup",
          link: { href: "/arcade/snake", label: "Play Snake" },
        },
      ],
      improved: [
        {
          title: "Cartoon art and icon setup",
          body: "The snake has a face that reacts to food, danger and crashes, and every fruit, rock, portal, crate and key shares the same outlined style. The setup panel uses icons instead of descriptions. Reduced motion settings turn off decorative animation.",
          where: "Arcade → Snake",
          link: { href: "/arcade/snake", label: "Play Snake" },
        },
      ],
    },
  },
  {
    id: "2026-10-31-snake-modes",
    date: "2026-10-29",
    title: "Snake: smoother play, modes, fruits and board sizes",
    intro: "Snake glides between cells, reacts when it eats or crashes, and now lets you pick a mode, a fruit, how many fruits appear and the board size before each round.",
    icon: "gamepad",
    highlights: [
      { kind: "improved", feature: "Snake feel", text: "Smooth movement, a rounded snake with a turning head, new fruit art and clear eat, grow and crash feedback." },
      { kind: "new", feature: "Modes", text: "Classic, Wrap (edges loop around), Obstacles and Timed (60 seconds)." },
      { kind: "new", feature: "Fruits", text: "Choose apple, cherry, orange, strawberry, grapes, banana, watermelon or a Fruit Salad mix." },
      { kind: "new", feature: "Fruit amount & board size", text: "Keep 1 to 12 fruits on the board at once, on a Small, Medium or Large board." },
      { kind: "improved", feature: "Separate bests", text: "Each mode, size and fruit amount keeps its own best. Your existing best stays as Classic · Medium · 1 fruit." },
    ],
    details: {
      new: [
        {
          title: "Set up your round",
          body: "One setup panel next to the board holds every option, each with a short description. Your choices are saved and restored next time. Changes made during a round apply when the next round starts.",
          points: [
            "Classic: walls end the round. Wrap: leaving one edge brings you back on the other side. Obstacles: short walls appear across the board, always leaving a path. Timed: score as much as you can in 60 seconds.",
            "Fruit Salad mixes every fruit; the chosen fruit is what you see on the board.",
            "Fruit amount presets are 1, 3, 5 and 10, or step anywhere from 1 to 12. Eaten fruit is replaced on a free cell; if the board fills up, the round ends as cleared.",
            "Boards are Small (14×14), Medium (20×20) and Large (26×26).",
          ],
          where: "Arcade → Snake → Setup",
          link: { href: "/arcade/snake", label: "Play Snake" },
        },
      ],
      improved: [
        {
          title: "Smoother, clearer Snake",
          body: "The snake now moves smoothly between cells with rounded turns and a tapered tail. Eating makes a small burst and a bulge travels down the body; crashing shows a brief shake and dims the snake. Reduced motion settings turn the extra effects off.",
          points: [
            "Quick turns are queued, so fast key presses or swipes aren't lost.",
            "The game pauses when you switch tabs or windows.",
            "Press R to restart; arrows or WASD, swipes and the on-screen pad still work.",
          ],
          link: { href: "/arcade/snake", label: "Play Snake" },
        },
      ],
    },
  },
  {
    id: "2026-10-30-amethyst",
    date: "2026-10-29",
    title: "Meet Amethyst: chosen covers and a calmer Home",
    intro: "Amethyst Archives is now simply Amethyst. Choose the artwork each collection shows, customize Home in a roomy dialog, and enjoy clearer contrast in every theme.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "Collection covers", text: "Pick and order up to 3 covers or images per collection, or reset to automatic artwork. Your entries keep their own covers." },
      { kind: "improved", feature: "Customize Home", text: "Opens in a spacious dialog with clear groups, scrolling on small screens and full keyboard support." },
      { kind: "improved", feature: "Home hub", text: "Archive, To Do and Arcade cards have matching weight, clearer status lines and a comfortable layout on phones." },
      { kind: "fixed", feature: "Contrast", text: "2048 tiles never blend into the board, and muted labels, icons, borders and warnings are easier to read in every theme." },
      { kind: "improved", feature: "Amethyst", text: "The new name covers Archive, To Do and Arcade. Links, data and preferences are unchanged." },
    ],
    details: {
      new: [
        {
          title: "Choose a collection's cover art",
          body: "Choose which artwork a collection shows on Home, on the Archive page and in the hub. Pick entry covers from that collection or add your own images, then arrange them so your favorite sits on top. A live preview shows the result before you save.",
          points: [
            "Up to 3 covers per collection, in the order you choose.",
            "“Use automatic” returns the collection to its most recently updated covers.",
            "Removing a cover here never changes or deletes the entry or its artwork.",
            "If a chosen entry is deleted, the remaining choices are kept; with none left, automatic artwork returns.",
          ],
          where: "A collection's ⋯ menu → Choose cover art",
          link: { href: "/collections", label: "Open Archive" },
        },
      ],
      improved: [
        {
          title: "Customize Home in a proper dialog",
          body: "Customize Home now opens a wide, scrollable dialog instead of a panel squeezed above your sections. Layout, Welcome and Artwork settings are grouped with clearer spacing and descriptions.",
          points: [
            "Close with the × button, Done, or Escape; focus returns to the Customize Home button.",
            "All settings and saved choices are unchanged, and changes still save as you make them.",
          ],
          where: "Home → Customize Home",
          link: { href: "/", label: "Go to Home" },
        },
        {
          title: "A more balanced Home hub",
          body: "The Archive, To Do and Arcade cards share the same structure: artwork, a title with its icon, a short description and a status line. On phones and narrow windows they stack as compact rows, and they switch to three columns once there's room.",
          link: { href: "/", label: "Go to Home" },
        },
        {
          title: "Amethyst",
          body: "Amethyst Archives is now called Amethyst, reflecting Archive, To Do and Arcade together. The Archive section keeps its name, and your links, bookmarks and settings work exactly as before.",
        },
      ],
      fixed: [
        {
          title: "Clearer contrast in every theme",
          body: "Colors now come from shared theme tokens, so text and controls stay readable whichever theme you pick.",
          points: [
            "2048 uses a neutral board and a distinct fill for every tile value, so 8 no longer blends into the background, and numbers stay readable.",
            "Sudoku conflicts show a wavy underline as well as a color.",
            "Warnings use a theme-aware amber that stays readable on light themes.",
            "Borders, input outlines, muted labels, icons and placeholders are a step stronger.",
          ],
          link: { href: "/arcade/2048", label: "Play 2048" },
        },
      ],
    },
  },
  {
    id: "2026-10-29-task-quality",
    date: "2026-10-29",
    title: "Larger task additions and clearer forms",
    intro: "Add longer task lists with visible progress, use natural list names, and get clearer feedback when something needs attention.",
    icon: "tasks",
    highlights: [
      { kind: "improved", feature: "Multi Add", text: "Add up to 10,000 tasks at a time in To Do or entry checklists, saved in batches of 500 with visible progress." },
      { kind: "improved", feature: "List names", text: "Multi-word names stay separate from list links. Surrounding whitespace is trimmed and empty names are rejected." },
      { kind: "fixed", feature: "Helpful errors", text: "Name errors appear beside the field. Connection and server failures keep your input and no longer show database details." },
      { kind: "improved", feature: "Consistent controls", text: "Aligned form controls, theme-aware borders and clearer dialogs, plus sign-in wording that reflects Archive, To Do and Arcade." },
    ],
    details: {
      improved: [
        {
          title: "Multi Add, without the 500-task ceiling",
          body: "Paste up to 10,000 tasks per addition. Tasks are saved in batches of 500, with a running saved count. Task order and completed markers are preserved in both To Do and entry checklists.",
          points: [
            "If a batch fails, the dialog keeps the unfinished tasks and shows how many are confirmed saved.",
            "Retry remaining safely reuses the failed batch rather than adding it twice, even if its earlier response was lost.",
            "Split additions larger than 10,000 tasks into separate parts. Each title can contain up to 500 characters.",
          ],
          link: { href: "/tasks", label: "Open To Do" },
        },
        {
          title: "Names are names, not addresses",
          body: "Use names such as Weekend plans or Books to read. Surrounding whitespace is trimmed on save, spaces between words are kept, and names must contain 1–120 characters without line breaks. Existing lists and their direct links are unchanged.",
          link: { href: "/tasks", label: "Open your lists" },
        },
        {
          title: "A more consistent interface",
          body: "Default buttons, inputs and selectors have matching heights, with consistent focus and validation styling. Multi Add and list dialogs work more comfortably on small screens and across themes. Sign-in and page descriptions now reflect organizing anything across Archive, To Do and Arcade.",
        },
      ],
      fixed: [
        {
          title: "Feedback you can act on",
          body: "List and group name validation appears next to the name field, without losing what you typed. Connection failures and server problems have separate messages. Database constraint details stay out of user-facing errors.",
        },
      ],
    },
  },
  {
    id: "2026-11-03-hub",
    date: "2026-10-27",
    title: "A Home hub, and a calmer To Do",
    intro: "Home now opens onto Archive, To Do and Arcade, and each area shows only its own navigation. Tasks is now called To Do, with simpler lists and a cleaner layout.",
    icon: "home",
    highlights: [
      { kind: "new", feature: "Home hub", text: "Large Archive, To Do and Arcade cards near the top of Home, each with a live summary. Your personal Home sections are still below." },
      { kind: "new", feature: "Archive page", text: "Collections have their own page, with buttons to create collections and entries and to arrange collections." },
      { kind: "improved", feature: "Simpler lists", text: "Inbox, All and Completed are gone. Completed tasks stay inside each list, under a section you can collapse." },
      { kind: "improved", feature: "Clear quick add", text: "In My Day, Important and Planned, quick add shows which list it adds to and lets you change it." },
      { kind: "improved", feature: "Calmer layout", text: "Simpler sidebar and task rows. Details open only when you ask, full width on phones." },
    ],
    details: {
      new: [
        {
          title: "Home is the hub",
          body: "The Archive | Tasks switch is gone. Home has a card for each area, and the logo always brings you back. Inside an area, the top bar shows where you are and only that area's navigation: the collection strip appears only in the Archive.",
          points: [
            "Archive shows your collection and entry counts and some of your covers.",
            "To Do shows how much of My Day is left.",
            "Arcade shows your coin balance.",
          ],
          link: { href: "/", label: "Open Home" },
        },
        {
          title: "An Archive page",
          body: "All your collections, your most recent entry and the create and arrange buttons are now on one page.",
          link: { href: "/collections", label: "Open Archive" },
        },
      ],
      improved: [
        {
          title: "To Do keeps only the views you use",
          body: "My Day, Important and Planned stay, followed by your lists and groups. Inbox is no longer special. If it had tasks, it is now a normal list named Inbox that you can rename, move or delete. An empty Inbox was removed and won't come back.",
          points: [
            "Completed tasks are shown under each list, in a section you can collapse.",
            "When you add a task in a smart view, it goes to the last list you used. You can pick a different list right next to the input. If you have no lists yet, you can create one there.",
            "Old links to Inbox, All or Completed still work. They open the list named Inbox if you have one, or My Day.",
          ],
          link: { href: "/tasks", label: "Open To Do" },
        },
        {
          title: "Calmer layout",
          body: "The sidebar has clearer group headings and fewer buttons. New list is still at the bottom, and New group is in its menu. Task rows show less extra information. The details panel opens only when you select a task, and on phones it fills the screen.",
          where: "To Do",
        },
      ],
    },
  },
  {
    id: "2026-10-27-tasks",
    date: "2026-10-27",
    title: "Tasks: a to-do workspace next to your archive",
    intro: "Switch between Archive and Tasks next to the logo. Tasks has its own lists, groups and smart views, and stays in sync across your devices.",
    icon: "tasks",
    highlights: [
      { kind: "new", feature: "Lists and groups", text: "A permanent Inbox plus your own lists with icons and colors, organized into collapsible groups by drag and drop or menus." },
      { kind: "new", feature: "Task details", text: "Importance, due dates, Markdown notes, ordered steps and an optional link to an archive entry." },
      { kind: "new", feature: "Smart views", text: "My Day, Important, Planned, All and Completed gather tasks from every list without copying them." },
      { kind: "new", feature: "Fast capture and search", text: "Press Enter to add, paste several lines to add many at once, and search titles, steps and notes." },
      { kind: "new", feature: "Sync", text: "Changes from another device appear without reloading." },
    ],
    details: {
      new: [
        {
          title: "A separate Tasks workspace",
          body: "Use the Archive | Tasks switch beside the logo. Each side remembers where you were. The logo still takes you to Home. Tasks keeps its own lists, separate from entry checklists and cover progress.",
          link: { href: "/tasks", label: "Open Tasks" },
        },
        {
          title: "Lists and groups",
          body: "Every task lives in exactly one list. Inbox is always there; create, rename, color, reorder and delete your own lists, and put them in groups.",
          points: [
            "Drag lists and groups in the sidebar, or use Move up/down and Move to group from their menus. Order and collapsed groups are saved to your account.",
            "Deleting a group keeps its lists. Deleting a list asks first and says how many tasks, steps and notes go with it.",
          ],
          where: "Tasks → sidebar",
        },
        {
          title: "Tasks, steps and notes",
          body: "Open a task to edit its title, steps, due date, list, notes and linked archive entry. Completing every step offers to complete the task, but never does it on its own.",
          points: [
            "Notes use the same live Markdown editor as the archive. They save automatically and keep a local copy until saved. If another device changed them, you choose which version to keep.",
            "Reorder tasks by dragging in a list or with Alt+↑/↓. A collapsible Completed section keeps finished work out of the way.",
            "Use “Add multiple” or paste several lines; “- [x]” lines are added as completed.",
          ],
        },
        {
          title: "Smart views",
          body: "My Day holds what you pick for today, whatever the due date, and starts empty each new day. Important shows starred open tasks, Planned groups due tasks into overdue, today and later, All shows every open task, and Completed lists finished tasks by completion date.",
          points: ["Outside its own list, a task shows which list it belongs to."],
        },
      ],
      improved: [
        {
          title: "My Day on Home, and a time zone setting",
          body: "An optional My Day section can be turned on under Customize Home. A new Time zone setting decides when the day rolls over; by default it follows your device.",
          where: "Home → Customize Home; Settings → General → Date and time",
          link: { href: "/settings#time", label: "Time zone setting" },
        },
      ],
    },
  },
  {
    id: "2026-10-27-settings-customization-search",
    date: "2026-10-27",
    title: "Settings and Customization, easier to find",
    intro: "Account tools stay in Settings. Profile, themes, artwork frames and appearance now have their own Customization destination, with one search across both.",
    icon: "sparkles",
    highlights: [
      { kind: "new", feature: "Customization", text: "Find your profile and visual preferences together in the account menu. All saved choices stay as they are." },
      { kind: "new", feature: "Shared search", text: "Find sections or individual controls across both destinations, then jump straight to the matching setting." },
      { kind: "improved", feature: "Compact navigation", text: "Simpler section lists; What's new keeps its own tab, and Showcase looks and presets stay inside Showcase." },
    ],
    details: {
      improved: [{
        title: "One search, two destinations",
        body: "Search by setting name or words such as font, avatar and animation. Results identify their destination and section, and highlight the matching setting when opened. Arrow keys move through results, Enter opens one, and Escape dismisses the list. Old bookmarked preference pages redirect to their new home.",
        where: "Account menu → Settings or Customization",
        link: { href: "/customization", label: "Open Customization" },
      }],
    },
  },
  {
    id: "2026-10-27-private-image-storage",
    date: "2026-10-27",
    title: "A new private home for your images",
    intro: "Images you upload are moving to new private storage built for frequent viewing. Nothing changes in how you add, embed or view them.",
    icon: "upload",
    highlights: [
      { kind: "improved", feature: "Image storage", text: "New uploads can be stored in a private Cloudflare R2 bucket, and existing images are copied over and checked one by one." },
      { kind: "improved", feature: "Same links", text: "Note embeds, covers, banners, avatars and Home artwork keep their names and links. Nothing needs to be re-added." },
      { kind: "improved", feature: "Fewer repeat downloads", text: "Your browser reuses an image privately for several hours instead of downloading it again." },
    ],
    details: {
      improved: [
        {
          title: "Private image storage",
          body: "Uploaded images are only ever delivered to your signed-in account, through short-lived links. Images are moved only after each copy has been verified, and the originals are kept as a fallback.",
          points: [
            "Pasting, dropping and uploading images works as before, with the same formats (PNG, JPEG, GIF, WebP, AVIF, BMP) and the same 10 MB limit.",
            "Duplicate file names still get a number, like “Pasted image … 1.png”.",
            "Signing out clears cached images from this browser, so the next person to sign in never sees yours.",
            "Images linked from other websites still load through the secure image proxy and are not copied.",
          ],
          where: "Notes, covers, banners, profile picture and Home artwork",
          link: { href: "/customization/profile", label: "Open your profile" },
        },
      ],
    },
  },
  {
    id: "2026-10-24-home-cover-fan",
    date: "2026-10-24",
    title: "A cover fan you arrange yourself",
    intro: "The cover fan on Home is now your own display: pick the artwork, set the order, and enjoy a redesigned, livelier fan.",
    icon: "home",
    highlights: [
      { kind: "new", feature: "Choose your fan", text: "Pick up to 9 entry covers or your own images. Opening entries no longer changes the fan." },
      { kind: "new", feature: "Arrange the order", text: "Drag, use the arrow buttons or the keyboard, with a live preview of the fan." },
      { kind: "improved", feature: "Fan redesign", text: "Cards now have depth, shadows and a dealing entrance, and lift, straighten and shine when hovered or focused." },
    ],
    details: {
      new: [
        {
          title: "Choose your fan",
          body: "Open Customize Home, then Customize fan to search your entries with cover art, filter by collection and select several at once, or add an image by link or upload. Your choices save to your account.",
          points: [
            "Removing artwork from the fan never deletes the entry or the image.",
            "If a chosen entry is deleted, it simply leaves the fan, and nothing replaces it.",
            "With nothing chosen, Home leaves the fan out entirely.",
          ],
          where: "Home → Customize Home → Cover fan → Customize fan",
          link: { href: "/", label: "Open Home" },
        },
        {
          title: "Arrange the order",
          body: "Number 1 sits on the left. Reorder by dragging a handle, with the move buttons, or by focusing a handle and pressing the arrow keys. The preview shows exactly how the fan will look.",
          where: "Home → Customize Home → Cover fan",
        },
      ],
      improved: [
        {
          title: "Fan redesign",
          body: "The fan deals its cards in once per visit. Hovering or focusing a card lifts it upright, scales it up and sweeps a reflection across it. Artwork stays sharp, keeps its shape and uses your frames and theme colors. The fan now also fits on phones.",
          points: ["Follows your animation intensity and hover scale settings, and stays still with reduced motion.", "Cards are decorative and don't open entries."],
        },
      ],
    },
  },
  {
    id: "2026-10-24-arcade-shop",
    date: "2026-10-24",
    title: "Arcade coins and the prize shop",
    intro: "Good Arcade runs now earn coins, and a new shop trades them for artwork frames and avatar decorations.",
    icon: "gamepad",
    highlights: [
      { kind: "new", feature: "Arcade shop", text: "Six original cosmetics: three artwork frames and three avatar decorations, previewed on your own artwork and picture before you buy." },
      { kind: "new", feature: "Coins from play", text: "All six games pay coins for qualifying runs, shown in the result card. Sudoku pays by difficulty." },
      { kind: "improved", feature: "Arcade hall", text: "The Arcade is now a hall of game cabinets, each with its own light, artwork, records and Play button." },
      { kind: "improved", feature: "Home marquee", text: "Home's Arcade link is now a small illuminated ARCADE sign that shows your coins." },
    ],
    details: {
      new: [
        {
          title: "Arcade shop",
          body: "Spend coins on Pixel Quest, Neon Marquee and Constellation frames, and Laurel wreath, Orbit ring and Gem crown avatar decorations. Preview any item on your own artwork or picture without changing what you're using. Every purchase asks you to confirm the item, price and balance afterwards, then offers Equip now or Keep for later.",
          points: [
            "Bought items are yours for good and never need buying again.",
            "Filter by frames, avatar decorations or what you own.",
            "Not enough coins, a changed price or a connection problem is always shown clearly, and no coins are taken.",
            "Cosmetics only: nothing in the shop changes how games play, and coins can't be bought with money.",
          ],
          where: "Arcade → Visit the shop",
          link: { href: "/arcade/shop", label: "Open the shop" },
        },
        {
          title: "Coins from play",
          body: "2048, Flutter, Snake, Fruit Slice and Tower Stacker pay coins for runs that reach a minimum score and length, with more for better scores up to a limit per run. Solving a Sudoku pays 20, 35 or 60 coins by difficulty. Each run or puzzle pays once, even after a reload, and play pays at most 600 coins in any 24 hours. Coins are counted from now on; earlier games don't pay retroactively.",
          points: ["The result card shows the coins earned, or why a run didn't qualify.", "The shop lists the earning rules and your recent coin history."],
          where: "Arcade",
          link: { href: "/arcade", label: "Open the Arcade" },
        },
        {
          title: "Shop items in your settings",
          body: "Frames you own appear in Artwork frames and in each entry's frame choice, alongside the free frames and No frame. Avatar decorations are chosen in Profile and are drawn around your picture without changing it.",
          where: "Customization → Artwork frames, Customization → Profile",
          link: { href: "/customization/profile", label: "Open Profile" },
        },
      ],
      improved: [
        {
          title: "Arcade hall",
          body: "Each game sits in its own cabinet with a lit title, its artwork on a screen, your records and a Play button. A prize counter at the top shows your coins and leads to the shop. Cabinets light up on hover and hold still when animations are reduced or off.",
          where: "Home → Arcade",
          link: { href: "/arcade", label: "Open the Arcade" },
        },
        {
          title: "Home marquee",
          body: "The Arcade link on Home is now a compact ARCADE sign with tiny game artwork and your coin balance. A short light sweep plays when you point at it, and it stays still when motion is reduced. Achievements stays right next to it.",
          where: "Home",
          link: { href: "/", label: "Go Home" },
        },
      ],
    },
  },
  {
    id: "2026-10-24-update-log",
    date: "2026-10-24",
    title: "A clearer update log",
    intro: "Each update now starts with a short overview, and the full notes are one click away.",
    icon: "megaphone",
    highlights: [
      { kind: "improved", feature: "Update overview", text: "Every release shows its date, a one-line intro and a few highlights marked New, Improved or Fixed." },
      { kind: "new", feature: "Full release notes", text: "Read full update opens a page with organized sections, where to find things and links." },
      { kind: "new", feature: "Shareable links", text: "Each release has its own address you can bookmark or come back to." },
      { kind: "improved", feature: "Rewritten history", text: "Earlier updates were reorganized in this format with their original dates." },
    ],
    details: {
      new: [
        {
          title: "Full release notes",
          body: "Every release has a Read full update link that opens its own page. Notes are grouped into New features, Improvements and Fixes, and each topic says where to find the change.",
          points: ["All updates at the top takes you back to the overview.", "Newer and Older at the bottom step through releases in order."],
        },
        {
          title: "Stable, shareable addresses",
          body: "Each release page has its own address under /whats-new, so bookmarks keep working. /whats-new still opens the overview, and the megaphone in the top bar still shows a dot until you’ve opened the latest update.",
        },
      ],
      improved: [
        {
          title: "A scannable overview",
          body: "The overview shows only what you need to understand an update in seconds: its title, date, a short intro and a handful of highlights.",
          points: [
            "New, Improved and Fixed each have their own marker, explained at the top of the page.",
            "Full explanations live on the detail pages and are never expanded on the overview.",
            "On wide screens, an index beside the feed jumps straight to older releases.",
          ],
          where: "Top bar → megaphone, or Settings → What’s new",
          link: { href: "/whats-new", label: "Open the overview" },
        },
        {
          title: "Earlier updates rewritten",
          body: "All previous releases follow the same format. Dates and facts are unchanged; longer explanations moved to each release’s detail page.",
        },
      ],
    },
  },
  {
    id: "2026-10-24-make-it-yours",
    date: "2026-10-24",
    title: "Make it yours",
    intro: "Give each collection its own layout, set up a personal profile, save looks for the 3D Showcase and frame individual entries.",
    icon: "palette",
    highlights: [
      { kind: "new", feature: "Collection layouts", text: "Show a collection as a cover gallery, compact list or information table." },
      { kind: "new", feature: "Personal profile", text: "A display name, picture and motto for Home and your achievement cabinet." },
      { kind: "new", feature: "3D Showcase looks", text: "Pick a built-in look for the 3D viewer or save your own presets." },
      { kind: "new", feature: "Per-entry frames", text: "Give one entry its own frame or no frame, or keep your default." },
    ],
    details: {
      new: [
        {
          title: "Collection layouts",
          body: "Each collection can use one of three layouts and remembers its own choice.",
          points: [
            "Cover gallery: the artwork-focused view you already know, and still the default.",
            "Compact list: small thumbnails with the entry details lined up.",
            "Information table: columns for title, labels and progress.",
            "Search, filters, sorting and labels work the same in every layout.",
          ],
          where: "Any collection → layout switcher next to the filters",
          link: { href: "/", label: "Choose a collection" },
        },
        {
          title: "Personal profile",
          body: "Set a display name, a profile picture and a short motto. They appear in the account menu, in your Home greeting and on your achievement cabinet.",
          points: [
            "Upload a picture or paste a link, see it previewed, and use Remove picture to clear it.",
            "Without a picture, your initials are shown.",
            "Your profile is private, and your email is only shown to you.",
          ],
          where: "Account menu → Customization → Profile",
          link: { href: "/customization/profile", label: "Edit your profile" },
        },
        {
          title: "3D Showcase looks",
          body: "Change how the 3D artwork viewer is lit and how it moves, and save the result as a preset.",
          points: [
            "Built-in looks: Classic, Neutral studio, Dramatic and Minimal. Classic matches the previous look.",
            "Fine-tune background, lighting, reflections, glow, hover tilt, follow speed and idle sway.",
            "Save your tweaks as named presets, then update, rename or delete them.",
            "Reset brings Classic back at any time.",
          ],
          where: "Collection → Showcase → artwork → sliders button",
          link: { href: "/", label: "Open your archive" },
        },
        {
          title: "Per-entry artwork frames",
          body: "When you create an entry or edit its details, choose its frame with a live preview on the entry’s artwork.",
          points: [
            "Use my default follows your account frame; choosing it again removes an override.",
            "No frame keeps the entry bare, even if you change your default later.",
            "The frame is used wherever the artwork appears: Showcase, the 3D viewer and the flat view.",
            "Existing entries keep following your account frame.",
          ],
          where: "Entry → ⋯ → Edit details → Artwork frame",
          link: { href: "/customization/frames", label: "Your default frame" },
        },
      ],
    },
  },
  {
    id: "2026-10-24-showcase-3d",
    date: "2026-10-24",
    title: "A more dimensional 3D Showcase",
    intro: "The 3D artwork viewer responds faster and presents each cover as a thicker, richly lit card.",
    icon: "sparkles",
    highlights: [
      { kind: "improved", feature: "Faster hover", text: "The card follows your pointer closely and settles smoothly when you move away." },
      { kind: "improved", feature: "Richer cards", text: "Thicker cards with rounded edges, rim lighting and colors from your theme." },
      { kind: "improved", feature: "Livelier frames", text: "Each frame has its own materials, sheen and effects in 3D." },
      { kind: "improved", feature: "Card reveal", text: "Cards glide in with a short light sweep and follow the direction you browse." },
    ],
    details: {
      improved: [
        {
          title: "Faster, steadier hover",
          body: "Hover rotation follows your pointer closely, with a slightly wider lean so the card’s depth shows.",
          points: [
            "Movement is smooth at any frame rate, and the card glides back to rest when the pointer leaves.",
            "Grabbing the card continues from where it is, without jumping.",
            "Hovering the toolbar or arrows never tilts the card.",
            "The tilt pauses while you’re zoomed in, so close inspection stays steady.",
          ],
          where: "Any collection → Showcase → open an artwork",
          link: { href: "/", label: "Choose a collection" },
        },
        {
          title: "Thicker, better-lit cards",
          body: "Cards are thicker, with rounded edges and rim lighting that catches as they turn. A soft shadow shifts with the angle, and a gentle highlight drifts across the art without washing it out. Lighting takes its colors from your theme and frame instead of always being purple.",
          where: "Showcase, or a library card → View artwork",
        },
        {
          title: "More spectacular frames",
          body: "Frames are raised above the art for real depth, and No frame stays completely bare.",
          points: [
            "Gilt: a moving metallic sheen and glinting corner studs.",
            "Amethyst: glittering facets and a crest that flashes.",
            "Holographic: a rainbow film that shifts with the angle.",
            "Aurora: its travelling thread plus a color-shifting curtain.",
          ],
          where: "Customization → Artwork frames",
          link: { href: "/customization/frames", label: "Choose a frame" },
        },
        {
          title: "Entrances and exits",
          body: "Each card glides into place as a single light sweep crosses it.",
          points: [
            "When you browse, the next card comes in from the side you’re heading to.",
            "Reset gives a quick sweep, and closing sends the card back into the scene.",
            "You can interact straight away; controls fade back while you turn the card.",
          ],
          where: "Showcase → open an artwork",
        },
        {
          title: "Motion and performance",
          body: "Your Motion setting and reduced-motion preference are respected.",
          points: [
            "Subtle shortens every animation, and Off gives a still, static inspection view.",
            "Rendering pauses when the card is still or the tab is hidden.",
            "The flat 2D view is unchanged.",
          ],
          where: "Customization → Appearance → Motion and effects",
          link: { href: "/customization/appearance#motion", label: "Adjust motion" },
        },
      ],
    },
  },
  {
    id: "2026-10-24-achievement-cabinet",
    date: "2026-10-24",
    title: "A medal cabinet for your achievements",
    intro: "Achievements move into a cabinet of dimensional medals, with a detail view and a short celebration for each unlock.",
    icon: "medal",
    notice: "Achievements left the Settings sidebar. Open them from Home or the Arcade; the celebrations toggle is now in Settings → General.",
    highlights: [
      { kind: "new", feature: "Medal cabinet", text: "Every achievement is a layered medal, with its own shape and color per group." },
      { kind: "new", feature: "Medal details", text: "Select a medal to see its goal, your progress and when you earned it." },
      { kind: "new", feature: "Unlock celebrations", text: "New medals assemble, catch the light and settle into a notification." },
      { kind: "new", feature: "Achievements on Home", text: "A link beside Arcade shows how many medals you’ve earned." },
    ],
    details: {
      new: [
        {
          title: "Medal cabinet",
          body: "Every achievement is a layered medal with a metal rim, enamel face and engraved icon.",
          points: [
            "Arcade, Archive and Discovery each have their own shape and color.",
            "Earned medals shine; locked ones rest in dark iron with their goal still readable.",
            "The header shows overall completion and progress per group.",
            "The earned, in-progress, group and game filters are still available.",
          ],
          where: "Achievements",
          link: { href: "/achievements", label: "Open the cabinet" },
        },
        {
          title: "Medal details",
          body: "Select any medal by click, tap or keyboard to see it up close: a larger badge, its description, the exact goal, your progress and the date and time you earned it.",
          points: ["Earned medals have Replay celebration, which plays the unlock again without changing anything."],
          where: "Achievements → select a medal",
          link: { href: "/achievements", label: "View achievements" },
        },
        {
          title: "Unlock celebrations",
          body: "A new medal assembles, catches the light and gives off a brief burst of sparks, then settles into a notification with View achievement and Dismiss.",
          points: [
            "Several unlocks queue one after another.",
            "It never takes focus and waits while you type or play.",
            "It follows your Motion setting and reduced-motion preference, with no sound and no flashing.",
          ],
          where: "Anywhere in the app",
        },
        {
          title: "Achievements on Home",
          body: "An Achievements link sits beside Arcade at the bottom of Home and shows how many medals you have earned.",
          where: "Home",
          link: { href: "/", label: "Go to Home" },
        },
      ],
      improved: [
        {
          title: "Settings changes",
          body: "Achievements no longer appear in the Settings sidebar; open them from Home, the Arcade or a direct link.",
          points: ["The celebrations toggle moved to a new Notifications group in Settings → General, and your existing choice is kept."],
          where: "Settings → General",
          link: { href: "/settings", label: "Adjust celebrations" },
        },
      ],
    },
  },
  {
    id: "2026-10-24-achievements",
    date: "2026-10-24",
    title: "Achievements",
    intro: "Personal milestones for the Arcade, your archive and feature discoveries, with progress and earned dates on one page.",
    icon: "trophy",
    highlights: [
      { kind: "new", feature: "Achievements", text: "Milestones across the Arcade, notes, checklists, collections, templates and the Showcase." },
      { kind: "new", feature: "Progress page", text: "Filter by earned or in progress, and narrow Arcade milestones by game." },
      { kind: "new", feature: "Unlock notifications", text: "A small notice when you earn one, never while you’re typing or playing." },
    ],
    details: {
      new: [
        {
          title: "Achievements",
          body: "Achievements recognize what you do across the six Arcade games, workspace notes and checklists, collection customization, templates, Showcase and the 3D artwork viewer.",
          points: [
            "Progress is based on saved archive state and completed game runs.",
            "Earned achievements stay earned if you later change or remove the content that proved them.",
            "There are no rewards, currencies, levels or feature unlocks.",
          ],
          where: "Achievements",
          link: { href: "/achievements", label: "View achievements" },
        },
        {
          title: "Your progress",
          body: "All milestones are grouped into Arcade, Archive and Discovery.",
          points: [
            "Filter to all, earned or in-progress achievements, and narrow Arcade milestones by game.",
            "Single-run challenges show your best qualifying run or streak.",
            "Earned milestones include their date.",
          ],
          where: "Arcade → Achievements",
          link: { href: "/achievements", label: "Open your progress" },
        },
        {
          title: "Unlock notifications",
          body: "New unlocks appear in a small queued notification when you are not typing or playing. Turning notifications off doesn’t stop milestone tracking.",
          points: ["Customize Home has an earned-achievements section, hidden until you turn it on."],
          where: "Settings → General → Notifications, or Home → Customize Home",
          link: { href: "/settings", label: "Adjust notifications" },
        },
      ],
    },
  },
  {
    id: "2026-10-24-arcade",
    date: "2026-10-24",
    title: "The Arcade",
    intro: "Six quick games for a break, with your personal bests saved to your account.",
    icon: "gamepad",
    highlights: [
      { kind: "new", feature: "Six games", text: "2048, Flutter, Snake, Sudoku, Fruit Slice and Tower Stacker, linked from the bottom of Home." },
      { kind: "new", feature: "Personal records", text: "Your best in every game is saved privately; there are no leaderboards." },
      { kind: "new", feature: "Saved Sudoku", text: "Your puzzle, notes and time are saved, so you can continue on any device." },
      { kind: "improved", feature: "Pause and sound", text: "Games pause when you switch tabs, and one button mutes all sound." },
    ],
    details: {
      new: [
        {
          title: "The Arcade",
          body: "Six quick games, each with a preview, a Play button and your personal record. Every game follows your theme, has Back to Arcade and Home links, and can go full screen.",
          where: "Home → Arcade",
          link: { href: "/arcade", label: "Open Arcade" },
        },
        {
          title: "2048",
          body: "Slide tiles with the arrow keys, WASD or a swipe. Matching tiles merge once per move, and a new tile appears only after a move that changes the board. Reach 2048 to win, then keep going or start over.",
          link: { href: "/arcade/2048", label: "Play 2048" },
        },
        {
          title: "Flutter",
          body: "Tap, click or press Space to keep a little gem-bird flying through gaps between crystal pillars. Touching a pillar or the ground ends the run, and a tap starts the next one right away.",
          link: { href: "/arcade/flutter", label: "Play Flutter" },
        },
        {
          title: "Snake",
          body: "Steer with the arrow keys or WASD, swipe on the board, or use the on-screen pad on touch screens. Eat to grow and speed up; walls and your own tail end the run. You can’t reverse straight into yourself, and the speed is the same on every screen.",
          link: { href: "/arcade/snake", label: "Play Snake" },
        },
        {
          title: "Sudoku",
          body: "Easy, Medium and Hard puzzles, each with exactly one solution.",
          points: [
            "Type or tap digits, add pencil notes (Notes mode or Shift+digit), erase and undo.",
            "Conflicts are highlighted, and givens can’t be changed.",
            "Placing a digit clears that note from the same row, column and box.",
            "The timer runs only while you play, and your fastest time is kept for each difficulty.",
            "Values, notes and time are saved as you play, so you can continue later, even on another device.",
            "Starting a new puzzle asks first if the current one isn’t finished.",
          ],
          link: { href: "/arcade/sudoku", label: "Play Sudoku" },
        },
        {
          title: "Fruit Slice",
          body: "Drag the mouse or swipe through flying fruit. Slicing three or more in one quick swipe earns a combo bonus. Missing 3 fruit ends the run, and slicing a bomb (dark, with a red cross) ends it instantly.",
          link: { href: "/arcade/fruit-slice", label: "Play Fruit Slice" },
        },
        {
          title: "Tower Stacker",
          body: "Click, tap or press Space to drop the sliding block. Only the part that overlaps the block below stays. Perfect drops keep the full width, and three or more in a row widen the block again. The camera follows your tower as it grows.",
          link: { href: "/arcade/stacker", label: "Play Tower Stacker" },
        },
        {
          title: "Personal records",
          body: "Records for every game are saved to your account and shown on each game and in the Arcade. There are no leaderboards; only you see your scores.",
        },
      ],
      improved: [
        {
          title: "Pausing and sound",
          body: "Games stay out of the way when you step away.",
          points: [
            "Action games and the Sudoku timer pause when you switch tabs or windows, and P or the Pause button pauses them yourself.",
            "Sound effects start only after you interact, and the speaker button mutes them across the Arcade.",
            "Decorative effects follow your animation setting and reduced-motion preference.",
          ],
          where: "Any game → sound and full-screen buttons",
        },
        {
          title: "Game keys",
          body: "While you play, keys such as the arrows and Space control the game instead of scrolling the page or triggering archive shortcuts. Everything works as before once you leave the game.",
        },
      ],
    },
  },
  {
    id: "2026-10-24-themes-urls",
    date: "2026-10-24",
    title: "Five new themes and readable addresses",
    intro: "Five more light and dark themes, and pages now have addresses you can read.",
    icon: "link",
    highlights: [
      { kind: "new", feature: "Five new themes", text: "Ocean Glass, Crimson Night, Monochrome OLED, Soft Sakura and Mint Paper." },
      { kind: "improved", feature: "Readable addresses", text: "Pages use names, like /collections/anime and /entries/one-piece." },
      { kind: "improved", feature: "Old links still work", text: "Old addresses and renamed pages redirect automatically." },
    ],
    details: {
      new: [
        {
          title: "Five new themes",
          body: "Your current theme stays as it is, and your own editor and heading colors still apply.",
          points: [
            "Ocean Glass: deep-sea navy with aqua and coral.",
            "Crimson Night: near-black with crimson and steel.",
            "Monochrome OLED: true black and white, no color.",
            "Soft Sakura: light blossom pink.",
            "Mint Paper: light cool mint.",
          ],
          where: "Customization → Themes",
          link: { href: "/customization/themes", label: "Open Themes" },
        },
      ],
      improved: [
        {
          title: "Readable addresses",
          body: "Collections and entries have addresses based on their names, such as /collections/anime and /entries/one-piece. Entries with the same name get a short number, like one-piece-2.",
        },
        {
          title: "Saved links keep working",
          body: "Old addresses redirect to the new ones, and renaming a collection or entry keeps its previous address pointing to it.",
        },
      ],
    },
  },
  {
    id: "2026-10-23-showcase",
    date: "2026-10-24",
    title: "Showcase and artwork frames",
    intro: "Show a collection’s artwork full screen, inspect covers as 3D cards and choose a decorative frame.",
    icon: "image",
    highlights: [
      { kind: "new", feature: "Showcase", text: "A full-screen gallery of a collection’s artwork that follows your search, filters and sort." },
      { kind: "new", feature: "Artwork viewer", text: "Open any cover full screen to zoom in and browse." },
      { kind: "new", feature: "3D cards", text: "Drag to turn and tilt artwork; pinch or scroll to zoom." },
      { kind: "new", feature: "Artwork frames", text: "Gilt, Amethyst filigree, Holographic and animated Aurora frames." },
    ],
    details: {
      new: [
        {
          title: "Showcase",
          body: "Showcase turns a collection into a full-screen gallery of its artwork, with nothing else on screen.",
          points: [
            "It shows exactly what your current search, filters and sort show.",
            "Hide titles for an even cleaner wall.",
            "Exit (or Esc) returns you to the library right where you were.",
          ],
          where: "Any collection → Showcase",
          link: { href: "/", label: "Choose a collection" },
        },
        {
          title: "Artwork viewer",
          body: "Click any artwork in Showcase, or use View artwork on a library card, to see it fitted to the full screen. Zoom in, browse with the arrows, arrow keys or a swipe, and go browser-full-screen. Opening the entry itself still works as before.",
          where: "Showcase, or a library card → View artwork",
        },
        {
          title: "3D cards",
          body: "In the viewer, artwork becomes a 3D card: drag to turn and tilt it, pinch or scroll to zoom, and Reset view to straighten it. Switch 3D off for a flat, still view; it follows your animation setting and reduced-motion preference.",
          where: "Artwork viewer → 3D",
        },
        {
          title: "Artwork frames",
          body: "Pick No frame, Gilt edge, Amethyst filigree, Holographic edge or the animated Aurora trace, previewed on your own portrait and square covers. Frames appear in Showcase and the viewer, follow the 3D card as it turns, and never cover the picture.",
          where: "Customization → Artwork frames",
          link: { href: "/customization/frames", label: "Open Artwork frames" },
        },
      ],
    },
  },
  {
    id: "2026-10-23-themes",
    date: "2026-10-23",
    title: "Themes, a calmer intro and a tighter Home",
    intro: "Five complete themes, control over the opening animation, a choosier cover fan, live search and an update log.",
    icon: "palette",
    highlights: [
      { kind: "new", feature: "Themes", text: "Amethyst, Rose Noir, Paper & Ink, Retro Terminal and Neon Arcade, with a live preview." },
      { kind: "new", feature: "Opening animation", text: "Play it every visit, once a day, once a week or never." },
      { kind: "improved", feature: "Setting resets", text: "Every setting has its own reset button and a Changed marker." },
      { kind: "improved", feature: "Live search", text: "Collection results update as you type and keep your filters." },
      { kind: "new", feature: "Update log", text: "This page, opened from the megaphone in the top bar." },
    ],
    details: {
      new: [
        {
          title: "Themes",
          body: "Amethyst (still the default), Rose Noir, Paper & Ink (a light theme), Retro Terminal and Neon Arcade. Each restyles backgrounds, surfaces, text, fonts, borders and accents, with a live preview. Your choice applies everywhere at once and follows your account.",
          where: "Customization → Themes",
          link: { href: "/customization/themes", label: "Open Themes" },
        },
        {
          title: "Opening animation frequency",
          body: "Choose how often the opening animation plays: every visit, once per day, once per week or never. Only a fresh load or reload counts as a visit.",
          points: ["Preview animation plays it without using up today’s showing."],
          where: "Customization → Appearance → Opening animation",
          link: { href: "/customization/appearance#motion", label: "Open Appearance" },
          action: "preview-intro",
        },
        {
          title: "Cover fan choice",
          body: "Pick which collections lend their artwork to the cover fan beside your greeting. Choosing none hides the fan.",
          where: "Home → Customize Home → Cover fan",
          link: { href: "/", label: "Go Home" },
        },
        {
          title: "New checklist and folder shortcuts",
          body: "New checklist and New folder keyboard shortcuts work in the open entry, next to New note. Rebind them like any other shortcut.",
          where: "Settings → Shortcuts",
          link: { href: "/settings/shortcuts", label: "Open Shortcuts" },
        },
        {
          title: "Update log",
          body: "A list of every update, available from the megaphone button in the top bar or from Settings.",
          where: "Top bar → What’s new",
        },
      ],
      improved: [
        {
          title: "Setting resets",
          body: "Every setting has its own reset button and a Changed marker when it differs from the default. Resetting never touches your entries or notes.",
          where: "Settings",
          link: { href: "/settings", label: "Open Settings" },
        },
        {
          title: "Live collection search",
          body: "Results update as you type without reloading the page, and keep your status, label and sort filters. Press Enter to search straight away.",
          where: "Any collection → Search",
        },
        {
          title: "Collection banners",
          body: "Banners are larger and framed, with the title, icon and accent set into the artwork. Collections without a banner keep a compact header.",
          where: "Any collection with a banner",
        },
        {
          title: "A tighter Home",
          body: "Home is more compact. The cover fan keeps square and portrait covers in shape, fits its column on every screen size and lifts more smoothly on hover.",
          where: "Home",
          link: { href: "/", label: "Go Home" },
        },
        {
          title: "Heading colors",
          body: "Heading colors follow the theme until you pick your own, and custom fonts and heading colors are kept when you switch themes.",
          where: "Settings → Editor → Writing",
          link: { href: "/settings/editor#writing", label: "Open Editor settings" },
        },
      ],
    },
  },
  {
    id: "2026-10-23-personalization",
    date: "2026-10-23",
    title: "A Home dashboard and much more to personalize",
    intro: "A new Home page, settings for nearly everything and collections with their own identity.",
    icon: "home",
    highlights: [
      { kind: "new", feature: "Home dashboard", text: "A greeting, cover fan, Continue card, pinned favorites, recent entries and upcoming tasks." },
      { kind: "new", feature: "Customize Home", text: "Write your own greeting, feature an entry, and reorder or hide sections." },
      { kind: "new", feature: "Collection identity", text: "Give each collection an icon, accent color, banner and description." },
      { kind: "new", feature: "Settings sidebar", text: "New pages for appearance, editor, checklists, shortcuts and startup." },
      { kind: "new", feature: "Templates", text: "Start new entries with your own folders, notes and checklists." },
    ],
    details: {
      new: [
        {
          title: "Home dashboard",
          body: "Home brings your archive together in one place.",
          points: [
            "A greeting and a cover fan of your own artwork.",
            "A Continue card for the last thing you opened.",
            "Featured, Pinned favorites, Recently opened and Your collections.",
            "Upcoming tasks and At a glance.",
          ],
          where: "Home",
          link: { href: "/", label: "Go Home" },
        },
        {
          title: "Customize Home",
          body: "Write your own greeting, feature an entry or image, and reorder or hide sections.",
          where: "Home → Customize Home",
          link: { href: "/", label: "Go Home" },
        },
        {
          title: "Collection identity",
          body: "Each collection can have an icon, accent color, banner and description.",
          where: "A collection’s menu → Edit collection",
          link: { href: "/settings/collections", label: "Open Collections" },
        },
        {
          title: "Settings sidebar",
          body: "Settings has a sidebar and new pages.",
          points: [
            "Appearance: animation level, card shine, hover size and library density.",
            "Editor: font, size, spacing, width and heading colors.",
            "Checklist behavior, rebindable keyboard shortcuts, and where the app opens.",
          ],
          where: "Settings",
          link: { href: "/settings", label: "Open Settings" },
        },
        {
          title: "Library cards",
          body: "Choose what library cards show and how pins look.",
          points: [
            "Card info presets choose between title, labels and progress.",
            "Pins can sit on the artwork, or stay in the card menu for a clean cover.",
          ],
          where: "Customization → Appearance → Library",
          link: { href: "/customization/appearance#library", label: "Open Appearance" },
        },
        {
          title: "Workspace templates",
          body: "Start new entries with your own folders, notes and checklists.",
          where: "Settings → Templates",
          link: { href: "/settings/templates", label: "Open Templates" },
        },
        {
          title: "Smaller additions",
          body: "A few more conveniences arrived alongside these.",
          points: [
            "Custom progress names per entry, such as “quests” instead of “tasks”.",
            "Arrange collections in the order you like, and delete a collection even when it still has entries.",
            "Add tasks adds several tasks at once, in checklists and the note editor toolbar.",
            "A short opening animation the first time you open the app each day. Click or press any key to skip it.",
          ],
        },
      ],
    },
  },
  {
    id: "2026-10-22-cover-shapes",
    date: "2026-10-22",
    title: "Cover shapes",
    intro: "Covers can be portrait or square.",
    icon: "shapes",
    highlights: [{ kind: "new", feature: "Cover shapes", text: "Choose portrait or square per entry; new entries start with the shape you used last." }],
    details: {
      new: [
        {
          title: "Portrait or square covers",
          body: "Pick a portrait or square cover for each entry. New entries start with the shape you used last.",
          where: "New entry or Edit entry → Cover",
        },
      ],
    },
  },
  {
    id: "2026-10-19-collections",
    date: "2026-10-19",
    title: "Your own collections",
    intro: "Collections are now entirely yours to create, rename and delete.",
    icon: "folder",
    highlights: [
      { kind: "new", feature: "Your own collections", text: "Create, rename and delete collections instead of using a fixed set." },
      { kind: "improved", feature: "Collection pages", text: "A cleaner look for collection pages and the collection bar." },
    ],
    details: {
      new: [
        {
          title: "Your own collections",
          body: "Create, rename and delete your own collections instead of using a fixed set.",
          where: "Top bar → New collection",
          link: { href: "/settings/collections", label: "Open Collections" },
        },
      ],
      improved: [{ title: "Collection pages", body: "A cleaner look for collection pages and the collection bar." }],
    },
  },
  {
    id: "2026-10-08-labels",
    date: "2026-10-08",
    title: "Labels per collection and per-file progress",
    intro: "Labels belong to a collection, filters match all selected labels, and you choose which files count toward progress.",
    icon: "tag",
    highlights: [
      { kind: "new", feature: "Collection labels", text: "Each collection has its own labels; filters show entries with all selected labels." },
      { kind: "new", feature: "Progress by file", text: "Choose which notes and checklists count toward an entry’s progress." },
      { kind: "fixed", feature: "Tasks in notes", text: "Tasks in Markdown notes now look the same as checklist tasks." },
    ],
    details: {
      new: [
        {
          title: "Labels per collection",
          body: "Labels are scoped to each collection, and filtering by several labels shows entries that have all of them.",
          where: "Any collection → Labels filter",
          link: { href: "/settings/labels", label: "Open Labels" },
        },
        { title: "Progress by file", body: "Choose which notes and checklists count toward an entry’s cover progress." },
      ],
      fixed: [{ title: "Tasks in notes", body: "Tasks written in Markdown notes now look the same as checklist tasks." }],
    },
  },
  {
    id: "2026-10-03-empty-workspaces",
    date: "2026-10-03",
    title: "A clean slate for new entries",
    intro: "New entries start with an empty workspace.",
    icon: "notebook",
    highlights: [{ kind: "improved", feature: "Empty workspaces", text: "New entries open with an empty workspace instead of pre-made files." }],
    details: {
      improved: [{ title: "Empty workspaces", body: "New entries open with an empty workspace instead of pre-made files." }],
    },
  },
  {
    id: "2026-10-02-uploads",
    date: "2026-10-02",
    title: "Upload your own artwork",
    intro: "Covers and banners can come straight from your device.",
    icon: "upload",
    highlights: [{ kind: "new", feature: "Artwork uploads", text: "Upload a cover or banner from your device, or paste a link as before." }],
    details: {
      new: [
        {
          title: "Artwork uploads",
          body: "Upload a cover or banner image from your device, as well as pasting a link.",
          where: "New entry or Edit entry → Cover / Banner",
        },
      ],
    },
  },
  {
    id: "2026-10-01-notes-and-labels",
    date: "2026-10-01",
    title: "Richer notes, labels and polish",
    intro: "Images and tasks inside notes, custom labels and smoother interactions.",
    icon: "notebook",
    highlights: [
      { kind: "new", feature: "Images in notes", text: "Paste, drop or embed images with ![[image]] links." },
      { kind: "new", feature: "Tasks in notes", text: "Checkboxes in notes appear as To Do-style cards." },
      { kind: "new", feature: "Custom labels", text: "Label entries and filter by label, with counts." },
      { kind: "improved", feature: "Livelier cards", text: "Library covers lift, glow and shine on hover." },
    ],
    details: {
      new: [
        { title: "Images in notes", body: "Paste or drop images into notes, or embed them with ![[image]] links." },
        { title: "Tasks in notes", body: "Task checkboxes inside notes, shown as To Do-style cards with round checks." },
        { title: "Custom labels", body: "Custom labels for entries, with a label filter that shows counts." },
        { title: "Auto-closing brackets", body: "Brackets and quotes close automatically while writing notes." },
      ],
      improved: [
        { title: "Livelier library cards", body: "Covers lift, glow and shine on hover." },
        { title: "Checklist rows", body: "Checklist task rows were redesigned." },
      ],
    },
  },
  {
    id: "2026-09-30-workspaces",
    date: "2026-10-01",
    title: "Amethyst Archives",
    intro: "A personal archive where every entry has its own workspace.",
    icon: "box",
    highlights: [
      { kind: "new", feature: "Entry workspaces", text: "Nested folders, Markdown notes and checklists that save automatically." },
      { kind: "new", feature: "Live Markdown editor", text: "Colored headings and a formatting toolbar." },
      { kind: "new", feature: "Checklists", text: "To Do-style tasks with steps, due dates and notes." },
      { kind: "new", feature: "Accounts", text: "Sign up, sign in and recover your password by email." },
    ],
    details: {
      new: [
        {
          title: "Entry workspaces",
          body: "A workspace for every entry, with nested folders, Markdown notes and checklists. Changes save automatically and unsaved drafts are recovered.",
        },
        { title: "Live Markdown editor", body: "A live Markdown editor with colored headings and a formatting toolbar." },
        { title: "Checklists", body: "To Do-style checklists with task details: steps, due dates and notes." },
        { title: "Cover artwork", body: "Cover artwork from any public image link, loaded through a secure image proxy." },
        { title: "Accounts", body: "Accounts with sign-up, sign-in and password recovery by email." },
      ],
    },
  },
];

export const LATEST_CHANGE_ID = CHANGELOG[0].id;

export function findRelease(id: string): { release: Release; newer?: Release; older?: Release } | null {
  const index = CHANGELOG.findIndex((release) => release.id === id);
  if (index < 0) return null;
  return { release: CHANGELOG[index], newer: CHANGELOG[index - 1], older: CHANGELOG[index + 1] };
}

export function releasePath(id: string): string {
  return `/whats-new/${id}`;
}

/** Formats a YYYY-MM-DD release date as that calendar day, independent of the viewer's time zone. */
export function formatChangeDate(date: string, style: "long" | "short" = "long"): string {
  const options: Intl.DateTimeFormatOptions = style === "long" ? { year: "numeric", month: "long", day: "numeric" } : { month: "short", day: "numeric" };
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { ...options, timeZone: "UTC" });
}
