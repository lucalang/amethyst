/**
 * Writes src/lib/code-stats.json, the codebase snapshot shown in Settings → Amethyst Stats.
 * Counts tracked source files at HEAD (not the working tree), so the result is reproducible per commit.
 * Usage: npm run stats:code
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const SOURCE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|css|sql)$/;
const EXCLUDED = [/^public\//, /(?:^|\/)next-env\.d\.ts$/, /\.min\.(?:js|css)$/, /^src\/lib\/supabase\/database\.types\.ts$/];

const blobCounts = new Map<string, { lines: number; characters: number }>();

function countCommit(commit: string) {
  const blobs = git("ls-tree", "-r", "-z", "--format=%(objectname)%x09%(path)", commit)
    .split("\0")
    .filter(Boolean)
    .flatMap((record) => {
      const separator = record.indexOf("\t");
      const file = record.slice(separator + 1);
      return SOURCE.test(file) && !EXCLUDED.some((pattern) => pattern.test(file)) ? [record.slice(0, separator)] : [];
    });
  const missing = [...new Set(blobs.filter((blob) => !blobCounts.has(blob)))];
  if (missing.length) {
    const batch = execFileSync("git", ["cat-file", "--batch"], { input: `${missing.join("\n")}\n`, maxBuffer: 256 * 1024 * 1024 });
    let offset = 0;
    for (const blob of missing) {
      const headerEnd = batch.indexOf(10, offset);
      const header = batch.subarray(offset, headerEnd).toString("utf8").split(" ");
      const length = Number(header[2]);
      if (header[1] !== "blob" || !Number.isFinite(length)) throw new Error(`Cannot read source blob ${blob}`);
      const text = batch.subarray(headerEnd + 1, headerEnd + 1 + length).toString("utf8");
      blobCounts.set(blob, { characters: [...text].length, lines: text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0) });
      offset = headerEnd + 1 + length + 1;
    }
  }
  return {
    files: blobs.length,
    lines: blobs.reduce((sum, blob) => sum + blobCounts.get(blob)!.lines, 0),
    characters: blobs.reduce((sum, blob) => sum + blobCounts.get(blob)!.characters, 0),
    commits: Number(git("rev-list", "--count", commit).trim()),
  };
}

const dates = new Map<string, string>();
for (const record of git("log", "--first-parent", "--format=%H %ct", "HEAD").trim().split("\n")) {
  const [commit, timestamp] = record.split(" ");
  const date = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
  if (!dates.has(date)) dates.set(date, commit);
}
const history = [...dates.entries()].sort(([left], [right]) => left.localeCompare(right))
  .map(([date, commit]) => ({ date, commit: git("rev-parse", "--short", commit).trim(), ...countCommit(commit) }));
const stats = {
  generatedAt: new Date(Number(git("log", "-1", "--format=%ct", "HEAD").trim()) * 1000).toISOString(),
  commit: git("rev-parse", "--short", "HEAD").trim(),
  ...countCommit("HEAD"),
  history,
};

writeFileSync(path.join(process.cwd(), "src/lib/code-stats.json"), `${JSON.stringify(stats, null, 2)}\n`);
console.log({ commit: stats.commit, files: stats.files, lines: stats.lines, characters: stats.characters, historyDates: history.length });
