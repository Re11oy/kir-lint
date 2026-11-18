#!/usr/bin/env node
// mikecann-lint init     set an app up: install, eslint.config.mjs, a lint script
//                        (--baseline also records today's problems as exempt)
// mikecann-lint changed  lint only the files this checkout has changed; the
//                        Threadbear turn-end hook runs this
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CODE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts"];
const LINT_SCRIPT = "eslint . --max-warnings 0";
const CONFIG_FILE = `import mikecannLint from "mikecann-lint";

export default await mikecannLint({ root: import.meta.dirname });
`;

const [command, ...args] = process.argv.slice(2);
const cwd = fs.realpathSync(process.cwd());

function git(...gitArgs) {
  try {
    return execFileSync("git", gitArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function packageManager() {
  if (fs.existsSync(path.join(cwd, "bun.lock")) || fs.existsSync(path.join(cwd, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  return "npm";
}

function eslintBin() {
  const bin = path.join(cwd, "node_modules", ".bin", "eslint");
  return fs.existsSync(bin) ? bin : null;
}

function init() {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.error("mikecann-lint: run this in an app's folder (no package.json here).");
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const missing = ["eslint", "mikecann-lint"].filter((name) => !deps[name]);
  if (missing.length) {
    const pm = packageManager();
    const add = pm === "npm" ? ["install", "--save-dev"] : ["add", "--dev"];
    console.log(`Installing ${missing.join(", ")} with ${pm}`);
    const run = spawnSync(pm, [...add, ...missing.map((n) => (n === "eslint" ? "eslint@^10" : n))], { cwd, stdio: "inherit" });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }

  const existing = CONFIGS.find((f) => fs.existsSync(path.join(cwd, f)));
  if (existing)
    console.log(
      `${existing} already exists. Add mikecann-lint to it (import it first, so typescript-eslint gets TypeScript 6):\n\n` +
        `  import mikecannLint from "mikecann-lint";\n  export default [...(await mikecannLint({ root: import.meta.dirname })), /* the app's own blocks */];\n`,
    );
  else {
    fs.writeFileSync(path.join(cwd, "eslint.config.mjs"), CONFIG_FILE);
    console.log("Wrote eslint.config.mjs");
  }

  const fresh = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  fresh.scripts ??= {};
  if (!fresh.scripts.lint) {
    fresh.scripts.lint = LINT_SCRIPT;
    fs.writeFileSync(pkgPath, JSON.stringify(fresh, null, 2) + "\n");
    console.log(`Added "lint": "${LINT_SCRIPT}"`);
  } else if (!fresh.scripts.lint.includes("eslint")) console.log(`Note: the lint script doesn't run eslint: ${fresh.scripts.lint}`);

  if (args.includes("--baseline")) {
    const eslint = eslintBin();
    if (!eslint) return console.error("mikecann-lint: eslint isn't installed here.");
    console.log("Recording today's problems in eslint-suppressions.json, so only new code has to pass");
    spawnSync(eslint, [".", "--suppress-all", "--max-warnings", "0"], { cwd, stdio: "inherit" });
  }
}

// What this checkout changed: uncommitted and untracked files, plus commits
// not yet on the main branch (or not pushed, when it is the main branch).
function changedFiles() {
  const base =
    ["origin/HEAD", "origin/main", "origin/master", "main", "master"]
      .map((ref) => git("merge-base", "HEAD", ref))
      .find(Boolean) ?? "";
  const lists = [
    git("diff", "--name-only", "--diff-filter=ACMR", "HEAD"),
    git("ls-files", "--others", "--exclude-standard"),
    base ? git("diff", "--name-only", "--diff-filter=ACMR", base, "HEAD") : "",
  ];
  const top = fs.realpathSync(git("rev-parse", "--show-toplevel") || cwd);
  const files = new Set();
  for (const line of lists.join("\n").split("\n")) {
    if (!CODE.test(line)) continue;
    const abs = path.join(top, line);
    if (!abs.startsWith(cwd + path.sep) || !fs.existsSync(abs)) continue;
    files.add(path.relative(cwd, abs));
  }
  return [...files];
}

function changed() {
  const eslint = eslintBin();
  if (!eslint || !CONFIGS.some((f) => fs.existsSync(path.join(cwd, f)))) return;
  const files = changedFiles();
  if (!files.length) return;
  const run = spawnSync(
    eslint,
    ["--max-warnings", "0", "--no-warn-ignored", "--pass-on-unpruned-suppressions", ...files],
    { cwd, stdio: "inherit" },
  );
  process.exit(run.status ?? 1);
}

if (command === "init") init();
else if (command === "changed") changed();
else {
  console.log("Usage: mikecann-lint init [--baseline] | mikecann-lint changed");
  process.exit(command ? 1 : 0);
}
