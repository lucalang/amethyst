import catalogData from "./version-history-catalog.json";

export type DemoAvailabilityState = "available" | "not_prepared" | "unavailable";

export type EnabledDemoSpec = {
  sha: string;
  shortSha: string;
  milestone: string;
  eraSummary: string;
  port: number;
  nextPort: number;
  postgrestPort: number;
  dbName: string;
  retentionHours: number;
  defaultPath: string;
  features: readonly string[];
  containedIntegrations: readonly string[];
};

export type VersionCommitEntry = {
  /** Immutable 40-character lowercase hexadecimal Git commit SHA. */
  sha: string;
  /** 7-character short SHA for display. */
  shortSha: string;
  /** Sanitized commit title (subject line). */
  title: string;
  /** Sanitized commit body summary when present. */
  summary: string | null;
  /** ISO-8601 commit timestamp from Git. */
  commitTimestamp: string;
  /** Calendar date (YYYY-MM-DD, Europe/Zurich) when the commit was recorded in Git. */
  commitDate: string;
  /** Verified production deployment date (YYYY-MM-DD) when linked to a release in CHANGELOG. */
  releaseDate: string | null;
  /** Stable release ID in CHANGELOG (/whats-new/<releaseId>) when applicable. */
  releaseId: string | null;
  /** Release title from CHANGELOG when applicable. */
  releaseTitle: string | null;
  /** Concise release overview from CHANGELOG when applicable. */
  releaseDescription: string | null;
  /** Retained branches or tags from which this commit is reachable. */
  refs: readonly string[];
  /** Number of SQL migration files in supabase/migrations at this commit. */
  migrationCount: number;
  /** Latest SQL migration filename at this commit. */
  schemaVersion: string | null;
  /** Optional milestone label highlighting major product/architectural eras. */
  milestone: string | null;
  /** Explicit demo availability state. */
  state: DemoAvailabilityState;
  /** Concise, truthful explanation of the commit's demo availability state. */
  stateReason: string;
  /** Demo configuration when state === "available". */
  demo: {
    port: number;
    eraSummary: string;
    retentionHours: number;
    defaultPath: string;
    features: readonly string[];
    containedIntegrations: readonly string[];
  } | null;
};

export const DEMO_RETENTION_HOURS = 24;

/**
 * Operator-curated registry of enabled milestone demos.
 * Expanding to additional commits requires only adding a spec here (or passing --sha/--port
 * to `npm run demos -- prepare`) and running the preparation script.
 */
export const ENABLED_DEMO_SPECS: readonly EnabledDemoSpec[] = [
  {
    sha: "3c27ef532b3fa8bd60968b0f9841348fde95ca8b",
    shortSha: "3c27ef5",
    milestone: "Amethyst Archives Launch",
    eraSummary:
      "The original Amethyst Archives launch: fixed Anime, Games and Other libraries (/anime, /games, /other), automatic starter workspace files on new entries, nested folders, live CodeMirror 6 Markdown notes and To Do-style checklists.",
    port: 4101,
    nextPort: 4201,
    postgrestPort: 4301,
    dbName: "demo_3c27ef5",
    retentionHours: DEMO_RETENTION_HOURS,
    defaultPath: "/anime",
    features: [
      "Fixed Anime, Games and Other libraries",
      "Starter workspace files (Overview.md & Progress) created with each entry",
      "Nested folders, live Markdown editor and checklists with task steps",
    ],
    containedIntegrations: [
      "Remote cover URLs are rendered via an isolated local SVG artwork generator with no outbound internet requests",
      "Account emails (sign-up, OTP, password reset) are simulated locally without sending real email",
    ],
  },
  {
    sha: "7ec9aa4310412268843a6bd5db9da4f277405dd3",
    shortSha: "7ec9aa4",
    milestone: "User-Created Collections",
    eraSummary:
      "Predefined libraries give way to user-created Collections (/[collection] UUID routes), collection-scoped labels, per-file cover progress, device artwork uploads, Obsidian-style tasks/images in notes, and empty starter workspaces.",
    port: 4102,
    nextPort: 4202,
    postgrestPort: 4302,
    dbName: "demo_7ec9aa4",
    retentionHours: DEMO_RETENTION_HOURS,
    defaultPath: "/",
    features: [
      "Create, rename and delete your own Collections",
      "Collection-scoped custom labels and per-file cover progress",
      "Obsidian-style checkboxes and isolated local image uploads in notes",
    ],
    containedIntegrations: [
      "Device uploads are stored in an isolated per-visitor local bucket with a 5-file / 5 MB quota",
      "Remote image proxy requests return deterministic local SVG artwork with no external network calls",
    ],
  },
  {
    sha: "03070fca5ce3cf9635a182d93932f81623db2176",
    shortSha: "03070fc",
    milestone: "Home Dashboard & Five Themes",
    eraSummary:
      "The first Home dashboard (greeting, cover fan, Continue card, pinned favorites, recent entries and getting-started steps), the Settings sidebar, workspace templates, collection identities, 5 themes and the original single-page update log.",
    port: 4103,
    nextPort: 4203,
    postgrestPort: 4303,
    dbName: "demo_03070fc",
    retentionHours: DEMO_RETENTION_HOURS,
    defaultPath: "/",
    features: [
      "Original Home dashboard with customizable sections, greeting and cover fan",
      "Five themes (Amethyst, Rose Noir, Paper & Ink, Retro Terminal, Arcade)",
      "Workspace templates, collection icons/accents/descriptions and per-setting resets",
    ],
    containedIntegrations: [
      "Uploads and remote artwork are served from isolated demo storage and safe SVG replacements",
      "All account and email actions remain strictly local to the visitor's demo workspace",
    ],
  },
  {
    sha: "38824391ee82b53f9016a38ad5ad3385f44e094c",
    shortSha: "3882439",
    milestone: "Readable URLs, 3D Showcase & Arcade Hall",
    eraSummary:
      "Readable slug addresses (/collections/..., /entries/...), three collection layouts (gallery, list, table), full-screen 3D Collection Showcase & artwork frames, the Achievements medal cabinet, and the cabinet-style Arcade hall with all 6 games and prize shop.",
    port: 4104,
    nextPort: 4204,
    postgrestPort: 4304,
    dbName: "demo_3882439",
    retentionHours: DEMO_RETENTION_HOURS,
    defaultPath: "/",
    features: [
      "Readable URLs, collection layouts (gallery, list, table) and personal profiles",
      "Full-screen Showcase, 3D card viewer, artwork frames and Achievements cabinet",
      "Arcade hall with 2048, Flutter, Snake, Sudoku, Fruit Slice, Tower Stacker and demo-only coin shop",
    ],
    containedIntegrations: [
      "Arcade coins and cosmetic purchases exist solely inside your isolated demo database and never touch the real coin economy",
      "Remote artwork and uploads use isolated demo storage and safe SVG replacements",
    ],
  },
  {
    sha: "688565d1429381610f4ec0810348d66850031a3a",
    shortSha: "688565d",
    milestone: "Tasks Workspace & Archive | Tasks Switch",
    eraSummary:
      "The historical Archive | Tasks switcher next to the logo (before the 3-card Home Hub replaced it), introducing Tasks with the permanent Inbox list, custom lists/groups, and the original 5 smart views (My Day, Important, Planned, All, Completed).",
    port: 4105,
    nextPort: 4205,
    postgrestPort: 4305,
    dbName: "demo_688565d",
    retentionHours: DEMO_RETENTION_HOURS,
    defaultPath: "/",
    features: [
      "Top-bar Archive | Tasks workspace switcher",
      "Tasks with permanent Inbox, custom lists, collapsible groups, steps and Markdown notes",
      "All five original smart views (My Day, Important, Planned, All, Completed) and split Settings / Customization",
    ],
    containedIntegrations: [
      "ATTACHMENT_STORAGE is locked to isolated local demo storage (Cloudflare R2 is disabled)",
      "Realtime task sync falls back to local polling/optimistic updates within your isolated demo session",
    ],
  },
] as const;

export type UnavailableCommitReason = {
  sha: string;
  reason: string;
  milestone?: string;
};

/**
 * Commits that cannot run faithfully or safely as standalone demos, with exact technical reasons.
 */
export const UNAVAILABLE_COMMIT_REASONS: Readonly<Record<string, { reason: string; milestone?: string }>> = {
  "40299ceca6abeea9783ab6b0fc46337342042f64": {
    milestone: "Pre-Archive Prototype (Phase 1)",
    reason:
      "Unavailable: Initial prototype built around retired MyAnimeList/Jikan catalog tables and invite-only accounts; lacks standalone workspace creation.",
  },
  "bd01e8803519e1b20259eb92844eddaf489a9930": {
    milestone: "Pre-Archive Prototype (Phases 1–3)",
    reason:
      "Unavailable: Depends on external MyAnimeList OAuth, live Jikan API imports and retired Edge Function background workers that are disabled for security.",
  },
  "34dd75c715f5514554030b243df5868fc666b52c": {
    milestone: "Pre-Archive Prototype (Phases 4–7)",
    reason:
      "Unavailable: Depends on retired MyAnimeList OAuth credentials, live Jikan catalog sync jobs and pg_cron/pg_net Edge Function workers.",
  },
  "4baae8e46d43c1434009f95abd75cbe77dc56d1e": {
    milestone: "Pre-Squash Beta (MAL Sync)",
    reason:
      "Unavailable: Pre-workspace beta on backup/pre-squash; requires external MyAnimeList OAuth, Jikan API access and the retired sync-worker Edge Function.",
  },
  "38b204ae34eb9e2c48923624fd5081ef9f129e33": {
    milestone: "Squashed Beta (MAL Sync)",
    reason:
      "Unavailable: Pre-workspace beta; requires external MyAnimeList OAuth, Jikan API imports and the retired sync-worker Edge Function.",
  },
  "247e4f1845a0a8e54b57b1b6d77f341b6a364144": {
    reason:
      "Unavailable: Production build fails TypeScript validation on legacy test fixtures prior to 7ec9aa4 (fixed 4 hours later on the same day in 7ec9aa4, which is enabled as a playable demo).",
  },
  "d295b55e6d254afdc4411fd36148c484b8cd0c49": {
    reason:
      "Unavailable: Production build fails TypeScript validation on legacy test fixtures prior to 7ec9aa4 (use enabled demo 7ec9aa4 from 8 minutes later).",
  },
  "d8b23c2f67b63356fbd0e51ed59fb0604e97e448": {
    reason:
      "Unavailable: serverEnv() unconditionally required live Cloudflare R2 credentials on all write routes and Arcade lazy.tsx had an incomplete type signature (fixed in 2c844bb).",
  },
  "851d01f69186bd40fcba21288dd445b48908eec3": {
    milestone: "Per-Game Cosmetic Shops",
    reason:
      "Unavailable: Inherited d8b23c2's global serverEnv() R2 credential check, which rejected write routes whenever production R2 variables were omitted (fixed 27 minutes later in 2c844bb).",
  },
  "743b007654975b71f3a49ac3c09516bc0afecd7b": {
    reason:
      "Unavailable: Mid-rework commit where /vault and its 3D chamber components were out of sync and failed compilation (wired together 41 minutes later in c5de608).",
  },
};

/**
 * Redacts any accidental credentials, tokens, emails, or secret values from commit metadata.
 */
export function redactSensitiveText(input: string): string {
  return input
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[REDACTED_SUPABASE_KEY]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi, "[REDACTED_CREDENTIAL_URL]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
    .replace(/(--code\s+["'])([^"']+)(["'])/gi, "$1[REDACTED_CODE]$3");
}

export const VERSION_HISTORY_CATALOG: readonly VersionCommitEntry[] = catalogData as readonly VersionCommitEntry[];

export function findCommitBySha(sha: string): VersionCommitEntry | null {
  const normalized = sha.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) return null;
  return VERSION_HISTORY_CATALOG.find((entry) => entry.sha === normalized) ?? null;
}

export function findEnabledDemoSpec(sha: string): EnabledDemoSpec | null {
  const normalized = sha.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) return null;
  return ENABLED_DEMO_SPECS.find((spec) => spec.sha === normalized) ?? null;
}

export function getCatalogSummary() {
  let available = 0;
  let notPrepared = 0;
  let unavailable = 0;
  let milestones = 0;
  for (const commit of VERSION_HISTORY_CATALOG) {
    if (commit.state === "available") available++;
    else if (commit.state === "not_prepared") notPrepared++;
    else unavailable++;
    if (commit.milestone) milestones++;
  }
  return {
    total: VERSION_HISTORY_CATALOG.length,
    available,
    notPrepared,
    unavailable,
    milestones,
  };
}
