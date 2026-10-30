import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { CHANGELOG } from "../src/lib/changelog";
import {
  ENABLED_DEMO_SPECS,
  UNAVAILABLE_COMMIT_REASONS,
  redactSensitiveText,
  type VersionCommitEntry,
} from "../src/lib/version-history";

const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(REPO_ROOT, "src/lib/version-history-catalog.json");

/**
 * Mapping from full commit SHA to its verified release ID in CHANGELOG (when that commit
 * delivered or completed a public release in the update log).
 */
const COMMIT_TO_RELEASE_ID: Readonly<Record<string, string>> = {
  a4b36ec4f662d3d063d8fe53ef4a4635f76e5ad2: "2026-10-30-vault-forged",
  c5de608d48c60b37f219c4f7f368022a5eac839c: "2026-10-30-vault-rework",
  "9e07dd9382f374111bbdc04325e681dc1fdc0641": "2026-10-30-vault-lab-slots",
  "3c4dc11fe0f116906e2b1aba9dd0259ac4d8b7aa": "2026-10-30-big-lists-shops-search",
  "318a93df52e2bed8151947d7405f919fb2181b24": "2026-11-13-first-load",
  a996450c096224c850feaaab73121a725b9dd267: "2026-11-12-performance",
  "851d01f69186bd40fcba21288dd445b48908eec3": "2026-11-11-game-shops",
  d8b23c2f67b63356fbd0e51ed59fb0604e97e448: "2026-10-29-private-attachment-delivery",
  "5de9328152bbbb2d2c6b06e6aa686c6675c38fda": "2026-11-10-sudoku-fruit-stacker",
  ea01ac2bd7fd1bb07c7d0665ac6e92e261bf5ad0: "2026-11-03-2048-flutter-daily",
  "7e70babc70ae9ccf8e6553b7e4e95e927c317e34": "2026-11-02-snake-speed-game-colors",
  "252aa7e4ecb823ee4f95374fcbe01b6e11aeed8e": "2026-11-01-snake-v2",
  "5d1f4b24afb7986bcb4adb868b8dea6fff4cfc34": "2026-10-31-snake-modes",
  "478654d9260e40bbac00972e7f20a860553218b2": "2026-10-30-amethyst",
  "5918121829b69026dfeabf78ecd249a69b5cf514": "2026-10-29-task-quality",
  "732f468cef99676ebb6dc3e8a124c8d0913b913d": "2026-11-03-hub",
  "688565d1429381610f4ec0810348d66850031a3a": "2026-10-27-tasks",
  "623d96bfab752c1b6ef7d92d4fb5eec84d4a8949": "2026-10-27-settings-customization-search",
  "43222638cf9d29106132062edc22d3cee6c08ac6": "2026-10-27-private-image-storage",
  "6586ee9c1b3c6b15a8f21f576ac0a6c74179fc8c": "2026-10-24-home-cover-fan",
  "38824391ee82b53f9016a38ad5ad3385f44e094c": "2026-10-24-arcade-shop",
  "3cf9130141a86ed81b285b0940845b8baae25dea": "2026-10-24-update-log",
  d18e183145eec3f4f6cfc174504a4d88ed34f3cb: "2026-10-24-make-it-yours",
  c9b10bb4a32729e32064b84248e8d4d93d961a8c: "2026-10-24-showcase-3d",
  "9dd07bb6ec32ee0b8c0d3d331faeeb31f1915d0d": "2026-10-24-achievement-cabinet",
  "7b61f2c20b0a08001b6cfc808ad4bef82e35e3e9": "2026-10-24-achievements",
  af84c1c2b5f556b999194d50abd568fc408bddb9: "2026-10-24-arcade",
  "5909060bd6451edab50de3b937476dad06e3f461": "2026-10-24-themes-urls",
  d9775bedb3f541f2d73dc591be6b3e62002cab01: "2026-10-23-showcase",
  "03070fca5ce3cf9635a182d93932f81623db2176": "2026-10-23-themes",
  "67c1a922ba7a5c5757dc77f5ca8995351a5e712f": "2026-10-23-personalization",
  e3d163e68c26bd9157a79b63af5d2880cd110eda: "2026-10-22-cover-shapes",
  "7ec9aa4310412268843a6bd5db9da4f277405dd3": "2026-10-19-collections",
  "247e4f1845a0a8e54b57b1b6d77f341b6a364144": "2026-10-19-collections",
  "649289526de279bfb294f9d0fb20516a03ba4063": "2026-10-08-labels",
  "46cd8e0d3a12b19b1a239b17b62db27635580677": "2026-10-08-labels",
  "94ca646616cf9be62383358dd5862de5617b7196": "2026-10-03-empty-workspaces",
  "8bbce4f009fbe8dfaf7626757fadbbe4baf162e5": "2026-10-02-uploads",
  d95906990c3921b209cb554f8798ef0935b923a3: "2026-10-01-notes-and-labels",
  "3c27ef532b3fa8bd60968b0f9841348fde95ca8b": "2026-09-30-workspaces",
};

/**
 * Curated milestone labels for commits that mark major architectural or product transitions.
 */
const MILESTONE_LABELS: Readonly<Record<string, string>> = {
  a4b36ec4f662d3d063d8fe53ef4a4635f76e5ad2: "3D Forged Vault",
  "9e07dd9382f374111bbdc04325e681dc1fdc0641": "The Vault, Lab & Coin Slots",
  "3c4dc11fe0f116906e2b1aba9dd0259ac4d8b7aa": "Virtualized To Do & Catalog Search",
  "5de9328152bbbb2d2c6b06e6aa686c6675c38fda": "Daily Sudoku & Isometric Stacker",
  ea01ac2bd7fd1bb07c7d0665ac6e92e261bf5ad0: "2048 & Flutter Daily Challenges",
  "252aa7e4ecb823ee4f95374fcbe01b6e11aeed8e": "Snake V2 & Blender",
  "478654d9260e40bbac00972e7f20a860553218b2": "Amethyst Rebrand & Collection Covers",
  "732f468cef99676ebb6dc3e8a124c8d0913b913d": "Home Destination Hub",
  "688565d1429381610f4ec0810348d66850031a3a": "Tasks Workspace & Archive | Tasks Switch",
  "623d96bfab752c1b6ef7d92d4fb5eec84d4a8949": "Settings & Customization Split",
  "43222638cf9d29106132062edc22d3cee6c08ac6": "Private R2 Image Storage",
  "38824391ee82b53f9016a38ad5ad3385f44e094c": "Readable URLs, 3D Showcase & Arcade Hall",
  d18e183145eec3f4f6cfc174504a4d88ed34f3cb: "Collection Layouts & Personal Profiles",
  "7b61f2c20b0a08001b6cfc808ad4bef82e35e3e9": "Achievements System",
  af84c1c2b5f556b999194d50abd568fc408bddb9: "The Arcade (Six Games)",
  "5909060bd6451edab50de3b937476dad06e3f461": "Readable Slug URLs",
  d9775bedb3f541f2d73dc591be6b3e62002cab01: "Collection Showcase & 3D Cards",
  "03070fca5ce3cf9635a182d93932f81623db2176": "Home Dashboard & Five Themes",
  "25eba906bdb6cab046c130102ac41197cc7451b7": "First Home Dashboard",
  e3d163e68c26bd9157a79b63af5d2880cd110eda: "Selectable Cover Shapes",
  "7ec9aa4310412268843a6bd5db9da4f277405dd3": "User-Created Collections",
  "8bbce4f009fbe8dfaf7626757fadbbe4baf162e5": "Device Artwork Uploads",
  "205cd8435d120c4f93a3dd7ab155833242c8d9dd": "Custom Entry Categories",
  "3c27ef532b3fa8bd60968b0f9841348fde95ca8b": "Amethyst Archives Launch",
  "4cd98fceef80408437788fe99a203bf3a079a218": "Personal Entry Workspaces",
};

function toZurichDate(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function summarizeBody(rawBody: string): string | null {
  const cleaned = redactSensitiveText(rawBody)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (cleaned.length === 0) return null;
  const preview = cleaned.slice(0, 6).join(" ");
  return preview.length > 420 ? `${preview.slice(0, 417).trimEnd()}...` : preview;
}

function getRetainedRefs(): string[] {
  const out = execFileSync(
    "git",
    ["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/tags"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getReachableRefsForCommit(sha: string, retainedRefs: readonly string[]): string[] {
  const matched: string[] = [];
  for (const ref of retainedRefs) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", sha, ref], { cwd: REPO_ROOT });
      matched.push(ref);
    } catch {
      // Not an ancestor of this ref
    }
  }
  return matched;
}

function generateCatalog(): VersionCommitEntry[] {
  const retainedRefs = getRetainedRefs();
  const raw = execFileSync(
    "git",
    [
      "log",
      "--branches",
      "--tags",
      "--date-order",
      "--format=%H%x00%h%x00%cI%x00%s%x00%b%x1e",
    ],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );

  const releaseById = new Map(CHANGELOG.map((r) => [r.id, r]));
  const enabledBySha = new Map(ENABLED_DEMO_SPECS.map((s) => [s.sha, s]));
  const seenShas = new Set<string>();
  const entries: VersionCommitEntry[] = [];

  for (const record of raw.split("\x1e")) {
    const trimmed = record.trim();
    if (!trimmed) continue;
    const [shaRaw, shortShaRaw, commitTimestampRaw, subjectRaw, bodyRaw = ""] = trimmed.split("\x00");
    const sha = shaRaw.trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(sha) || seenShas.has(sha)) continue;
    seenShas.add(sha);

    const shortSha = shortShaRaw.trim();
    const commitTimestamp = commitTimestampRaw.trim();
    const commitDate = toZurichDate(commitTimestamp);
    const title = redactSensitiveText(subjectRaw.trim());
    const summary = summarizeBody(bodyRaw);

    let migrations: string[] = [];
    try {
      migrations = execFileSync("git", ["ls-tree", "--name-only", sha, "supabase/migrations/"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      })
        .split(/\r?\n/)
        .filter((line) => line.endsWith(".sql"))
        .map((line) => line.replace(/^supabase\/migrations\//, ""))
        .sort();
    } catch {
      migrations = [];
    }

    const migrationCount = migrations.length;
    const schemaVersion = migrations[migrations.length - 1] ?? null;

    const releaseId = COMMIT_TO_RELEASE_ID[sha] ?? null;
    const release = releaseId ? (releaseById.get(releaseId) ?? null) : null;

    const enabledSpec = enabledBySha.get(sha) ?? null;
    const unavailableSpec = UNAVAILABLE_COMMIT_REASONS[sha] ?? null;
    const milestone =
      enabledSpec?.milestone ?? unavailableSpec?.milestone ?? MILESTONE_LABELS[sha] ?? null;

    let state: VersionCommitEntry["state"];
    let stateReason: string;
    let demo: VersionCommitEntry["demo"] = null;

    if (enabledSpec) {
      state = "available";
      stateReason = `Available Demo: Prepared in an isolated environment with its matching schema (${migrationCount} migrations through ${schemaVersion ?? "base"}) and fresh-account provisioning.`;
      demo = {
        port: enabledSpec.port,
        eraSummary: enabledSpec.eraSummary,
        retentionHours: enabledSpec.retentionHours,
        defaultPath: enabledSpec.defaultPath,
        features: enabledSpec.features,
        containedIntegrations: enabledSpec.containedIntegrations,
      };
    } else if (unavailableSpec) {
      state = "unavailable";
      stateReason = unavailableSpec.reason;
    } else {
      state = "not_prepared";
      stateReason = `Not Prepared: Cataloged from Git history (${migrationCount} migrations through ${schemaVersion ?? "base"}), but not currently built as an active demo instance. Can be prepared via the operator CLI.`;
    }

    const refs = getRetainedRefsForCommitCached(sha, retainedRefs);

    entries.push({
      sha,
      shortSha,
      title,
      summary,
      commitTimestamp,
      commitDate,
      releaseDate: release?.date ?? null,
      releaseId: release?.id ?? null,
      releaseTitle: release ? redactSensitiveText(release.title) : null,
      releaseDescription: release ? redactSensitiveText(release.intro) : null,
      refs,
      migrationCount,
      schemaVersion,
      milestone,
      state,
      stateReason,
      demo,
    });
  }

  return entries;
}

function getRetainedRefsForCommitCached(sha: string, retainedRefs: readonly string[]): string[] {
  return getReachableRefsForCommit(sha, retainedRefs);
}

const catalog = generateCatalog();
writeFileSync(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${catalog.length} commits to ${path.relative(REPO_ROOT, OUTPUT_PATH)} ` +
    `(available: ${catalog.filter((c) => c.state === "available").length}, ` +
    `not_prepared: ${catalog.filter((c) => c.state === "not_prepared").length}, ` +
    `unavailable: ${catalog.filter((c) => c.state === "unavailable").length}).`,
);
