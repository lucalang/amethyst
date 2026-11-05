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

const files = git("ls-tree", "-r", "--name-only", "HEAD")
  .split("\n")
  .filter((file) => SOURCE.test(file) && !EXCLUDED.some((pattern) => pattern.test(file)));

let lines = 0;
let characters = 0;
for (const file of files) {
  const text = git("show", `HEAD:${file}`);
  characters += [...text].length;
  lines += text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

const stats = {
  generatedAt: new Date(Number(git("log", "-1", "--format=%ct", "HEAD").trim()) * 1000).toISOString(),
  commit: git("rev-parse", "--short", "HEAD").trim(),
  commits: Number(git("rev-list", "--count", "HEAD").trim()),
  files: files.length,
  lines,
  characters,
};

writeFileSync(path.join(process.cwd(), "src/lib/code-stats.json"), `${JSON.stringify(stats, null, 2)}\n`);
console.log(stats);
