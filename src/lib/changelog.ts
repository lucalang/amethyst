/**
 * The in-app update log ("What's new"): the single source of truth, newest first.
 * Each release has a short overview (intro + 3–5 highlights) shown on /whats-new and
 * detailed notes shown on /whats-new/<id>. Every user-visible change ships with a release
 * here in this same format. Dates are release dates (YYYY-MM-DD).
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
    date: "2026-10-23",
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
    date: "2026-09-30",
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

export function formatChangeDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
