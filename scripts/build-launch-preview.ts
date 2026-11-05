import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import ts from "typescript";
import { BROWSER_DEMO_SPECS, findBrowserDemoSpec, type BrowserDemoSpec } from "../src/lib/browser-version-demos";

const root = process.cwd();
const adapters = path.join(root, "src/components/version-history/launch-preview");

function libraryModule(source: string, filename: string) {
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const printer = ts.createPrinter();
  const imports = parsed.statements.filter((statement) => ts.isImportDeclaration(statement) &&
    !statement.importClause?.isTypeOnly && ts.isStringLiteral(statement.moduleSpecifier) &&
    /^(next\/link$|lucide-react$|@\/components\/|@\/lib\/collections$)/.test(statement.moduleSpecifier.text));
  const component = parsed.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) &&
    Boolean(statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  const returned = component?.body?.statements.find(ts.isReturnStatement);
  if (!returned?.expression) throw new Error(`No historical library render found in ${filename}.`);
  return `${imports.map((statement) => printer.printNode(ts.EmitHint.Unspecified, statement, parsed)).join("\n")}\nexport default function HistoricalLibrary({ library, visible, search, collection, slug }) { return ${printer.printNode(ts.EmitHint.Expression, returned.expression, parsed)}; }`;
}

async function buildPreview(spec: BrowserDemoSpec) {
  const SHA = spec.sha;
  const shortSha = SHA.slice(0, 7);
  const legacy = spec.defaultPath === "/";
  const snapshot = mkdtempSync(path.join(tmpdir(), "amethyst-launch-preview-"));
  const output = path.join(root, "public/demos", shortSha);
  const libraryPage = path.join(snapshot, legacy ? "src/app/(vault)/page.tsx" : "src/app/(vault)/[collection]/page.tsx");
  try {
  mkdirSync(output, { recursive: true });
  execFileSync("tar", ["-x", "-C", snapshot], {
    input: execFileSync("git", ["archive", SHA, "src"], { maxBuffer: 16 * 1024 * 1024 }),
  });
  const sources: string[] = [];
  await build({
    entryPoints: [path.join(adapters, "preview.tsx")],
    outfile: path.join(output, "preview.js"),
    bundle: true,
    minify: true,
    jsx: "automatic",
    platform: "browser",
    target: "es2022",
    nodePaths: [path.join(root, "node_modules")],
    define: {
      "process.env.NODE_ENV": '"production"',
      __PREVIEW_SHA__: JSON.stringify(shortSha),
      __PREVIEW_DEFAULT_PATH__: JSON.stringify(spec.defaultPath),
      __PREVIEW_LEGACY__: JSON.stringify(legacy),
    },
    plugins: [{
      name: "historical-launch",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/media-image$/ }, (args) => args.importer.startsWith(snapshot) ? { path: path.join(adapters, "media.tsx") } : undefined);
        builder.onResolve({ filter: /^(historical\/|@\/|next\/|server-only$)/ }, (args) => {
          if (args.path === "server-only") throw new Error("Server code must not enter the static preview.");
          if (args.path === "historical/preview-library") return { path: libraryPage };
          if (legacy && args.path === "historical/lib/collections") return { path: "legacy-collections", namespace: "preview" };
          if (args.path === "next/link") return { path: path.join(adapters, "navigation.tsx") };
          if (args.path === "next/navigation") return { path: path.join(adapters, "navigation.tsx") };
          if (args.path === "next/image") return { path: path.join(adapters, "media.tsx") };
          if (args.path === "@/lib/api-client") return { path: path.join(adapters, "state.ts") };
          if (args.path === "@/components/media/media-image") return { path: path.join(adapters, "media.tsx") };
          if (args.path === "@/components/media/image-url-field") return { path: path.join(adapters, "media.tsx") };
          const relative = args.path.replace(/^(historical\/|@\/)/, "");
          const base = path.join(snapshot, "src", relative);
          return { path: [".tsx", ".ts"].map((extension) => base + extension).find((file) => {
            try { readFileSync(file); return true; } catch { return false; }
          }) ?? base };
        });
        builder.onLoad({ filter: /^legacy-collections$/, namespace: "preview" }, () => ({ contents: "export const COLLECTIONS = {};", loader: "js" }));
        builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
          if (!args.path.startsWith(snapshot) && !args.path.startsWith(adapters + path.sep)) return;
          const original = readFileSync(args.path, "utf8");
          const source = args.path === libraryPage ? libraryModule(original, args.path) : original;
          sources.push(source);
          if (!args.path.startsWith(snapshot)) return;
          return { contents: source.replaceAll("archive:", `amethyst:preview:${shortSha}:archive:`), loader: args.path.endsWith(".tsx") ? "tsx" : "ts" };
        });
      },
    }],
  });
  const compiler = await compile(readFileSync(path.join(snapshot, "src/app/globals.css"), "utf8") + "\n@custom-variant hover (&:hover);\n", {
    base: root,
    onDependency() {},
  });
  const candidates = sources.flatMap((source) => source.split(/[\s"'`]+/)).filter((candidate) => candidate !== "scroll-fade");
  const fonts = [400, 500, 600, 700, 800].map((weight) => `@font-face{font-family:Manrope;font-style:normal;font-weight:${weight};font-display:swap;src:url('./manrope-${weight}.ttf') format('truetype')}`).join("\n");
  const previewStyles = `\n${fonts}\n:root{--font-manrope:Manrope}body{font-family:Manrope,ui-sans-serif,sans-serif}[data-preview-disabled=true]{opacity:.45!important;cursor:not-allowed}.preview-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 16px;background:#15121b;border-bottom:1px solid #342d43;font-size:12px}.preview-bar>div{display:flex;gap:16px}.preview-bar button,.preview-bar a{display:inline-flex;align-items:center;gap:6px;background:none;color:#ece8f4;border:0;padding:4px 0;cursor:pointer}.preview-bar :focus-visible{outline:2px solid #a57cff;outline-offset:4px}\n`;
  writeFileSync(path.join(output, "preview.css"), compiler.build(candidates) + previewStyles, "utf8");
  writeFileSync(path.join(output, "index.html"), `<!doctype html>
<html lang="en" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Amethyst Archives ${shortSha} demo</title><meta name="robots" content="noindex"><link rel="stylesheet" href="./preview.css"></head><body><div id="preview"></div><script src="./preview.js" defer></script></body></html>`, "utf8");
  writeFileSync(path.join(output, "source.json"), JSON.stringify({ sha: SHA, mode: "static-fixture", libraryPage: path.relative(snapshot, libraryPage), entry: "src/components/version-history/launch-preview/preview.tsx" }, null, 2), "utf8");
  if (shortSha !== "3c27ef5") {
    for (const asset of ["cover.jpg", "OFL.txt", ...[400, 500, 600, 700, 800].map((weight) => `manrope-${weight}.ttf`)]) {
      copyFileSync(path.join(root, "public/demos/3c27ef5", asset), path.join(output, asset));
    }
  }
  console.log(`Built browser-only historical preview from ${shortSha}.`);
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
  }
}

async function main() {
  const shaIndex = process.argv.indexOf("--sha");
  const requested = shaIndex >= 0 ? findBrowserDemoSpec(process.argv[shaIndex + 1] ?? "") : null;
  if (shaIndex >= 0 && !requested) throw new Error("Choose a registered historical preview commit.");
  for (const spec of requested ? [requested] : BROWSER_DEMO_SPECS) await buildPreview(spec);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});