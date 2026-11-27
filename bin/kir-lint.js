#!/usr/bin/env node
// kir-lint init   set an app up: install, eslint.config.mjs, a lint script
//                 (--baseline also records today's problems as exempt)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts"];
const LINT_SCRIPT = "eslint . --max-warnings 0";
const CONFIG_FILE = `import kirLint from "kir-lint";

export default await kirLint({ root: import.meta.dirname });
`;
const { version } = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
// Installed from GitHub by tag, not from npm.
const SOURCE = `github:Re11oy/kir-lint#v${version}`;

const [command, ...args] = process.argv.slice(2);
const cwd = fs.realpathSync(process.cwd());

function packageManager() {
  if (fs.existsSync(path.join(cwd, "bun.lock")) || fs.existsSync(path.join(cwd, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  return "npm";
}

function depends(pkg, name) {
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

function init() {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.error("kir-lint: run this in an app's folder (no package.json here).");
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  // kir-lint and its peers: the plugins come from the app, so the app's own
  // config blocks and the pack share one copy of each.
  const wanted = {
    "kir-lint": SOURCE,
    eslint: "eslint@^10",
    typescript: "typescript",
    "typescript-eslint": "typescript-eslint",
  };
  if (depends(pkg, "react") || depends(pkg, "react-native")) wanted["eslint-plugin-react-hooks"] = "eslint-plugin-react-hooks";
  if (depends(pkg, "convex")) wanted["@convex-dev/eslint-plugin"] = "@convex-dev/eslint-plugin";
  const missing = Object.keys(wanted).filter((name) => !depends(pkg, name));
  if (missing.length) {
    const pm = packageManager();
    const add = pm === "npm" ? ["install", "--save-dev"] : ["add", "--dev"];
    console.log(`Installing ${missing.join(", ")} with ${pm}`);
    const run = spawnSync(pm, [...add, ...missing.map((name) => wanted[name])], { cwd, stdio: "inherit" });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }

  const existing = CONFIGS.find((f) => fs.existsSync(path.join(cwd, f)));
  if (existing)
    console.log(
      `${existing} already exists. Add kir-lint to it:\n\n` +
        `  import kirLint from "kir-lint";\n  export default [...(await kirLint({ root: import.meta.dirname })), /* the app's own blocks */];\n`,
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
    const eslint = path.join(cwd, "node_modules", ".bin", "eslint");
    if (!fs.existsSync(eslint)) return console.error("kir-lint: eslint isn't installed here.");
    console.log("Recording today's problems in eslint-suppressions.json, so only new code has to pass");
    spawnSync(eslint, [".", "--suppress-all", "--max-warnings", "0"], { cwd, stdio: "inherit" });
  }
}

if (command === "init") init();
else {
  console.log("Usage: kir-lint init [--baseline]");
  process.exit(command ? 1 : 0);
}
