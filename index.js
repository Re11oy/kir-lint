// mikecann-lint: a small, strict ESLint setup for Convex + TypeScript + React
// apps. Every rule here caught a real bug or a correction Mike kept making;
// README.md says which. Usage, in eslint.config.mjs:
//
//   import mikecannLint from "mikecann-lint";
//   export default await mikecannLint({ root: import.meta.dirname });
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { loadedTypeScripts, useTypeScript6 } from "./typescript6.js";
import plugin from "./plugin.js";

// Before anything loads typescript-eslint, so it gets TypeScript 6.
useTypeScript6();
const { default: tseslint } = await import("typescript-eslint");
const { default: reactHooks } = await import("eslint-plugin-react-hooks");
const { default: convex } = await import("@convex-dev/eslint-plugin");
const { default: comments } = await import("@eslint-community/eslint-plugin-eslint-comments");

export const TEST_FILES = [
  "**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs}",
  "**/{test,tests,__tests__,e2e}/**/*.{ts,tsx,mts,cts,js,jsx,mjs}",
];
const CODE = ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"];
const TS = ["**/*.{ts,tsx,mts,cts}"];
const COMPONENTS = ["**/*.{tsx,jsx}"];
const CONVEX = ["**/convex/**/*.{ts,tsx,mts}"];
// Plain JS, tool config files and tests often sit outside every tsconfig.
// They're linted without type information rather than failing to parse; none
// of the rules that need types apply to them.
const UNTYPED = ["**/*.{js,jsx,mjs,cjs}", "**/*.config.{ts,mts,cts}", ...TEST_FILES];
const IGNORES = [
  "**/node_modules/**",
  "**/_generated/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.expo/**",
  "**/.next/**",
  "**/.convex/**",
  "**/vendor/**",
  "**/*.d.ts",
  "**/.claude/worktrees/**",
  "**/.codex/worktrees/**",
  "**/.threadbear/**",
  "**/tmp/**",
];

// The React Compiler's lint rules, all as errors, without the two that only
// say a library or syntax isn't supported by the compiler.
const COMPILER_NOISE = new Set(["react-hooks/incompatible-library", "react-hooks/unsupported-syntax"]);
function reactRules() {
  const rules = {};
  for (const name of Object.keys(reactHooks.configs["recommended-latest"].rules))
    if (!COMPILER_NOISE.has(name)) rules[name] = "error";
  return rules;
}

// Convex's recommended rules, warnings made errors, plus no-collect-in-query.
function convexRules() {
  const rules = {};
  for (const block of [convex.configs.recommended].flat())
    for (const [name, level] of Object.entries(block.rules ?? {})) rules[name] = level === "off" ? "off" : "error";
  rules["@convex-dev/no-collect-in-query"] = "error";
  return rules;
}

function readPackage(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

function depends(pkg, name) {
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? pkg.peerDependencies?.[name]);
}

// The state machines library's own lint rules, when the app uses it.
async function loadMachines(root) {
  const dir = path.join(root, "node_modules", "@convex-dev", "state-machines");
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
  const entry = pkg.exports?.["./eslint"];
  const file = typeof entry === "string" ? entry : (entry?.import ?? entry?.default);
  if (!file) return null;
  return (await import(pathToFileURL(path.join(dir, file)).href)).default;
}

/**
 * @param {object} options
 * @param {string} options.root The app's folder, usually `import.meta.dirname`.
 * @param {boolean} [options.react] Lint React code. Defaults to whether the app depends on react.
 * @param {boolean} [options.convex] Lint Convex functions. Defaults to whether the app depends on convex.
 * @param {string[]} [options.untyped] More files to lint without type information (files no tsconfig includes).
 * @param {string[]} [options.ignores] More files to skip.
 * @param {boolean} [options.allowSecondTypeScript] Skip the check for a second TypeScript, for a config that
 *   loads the app's TypeScript for its own use (lint tooling must still come from this package).
 * @param {string[]} [options.notReact] Files that aren't React, such as server code with functions named use...,
 *   which the hook rules would take for hooks.
 * @returns {Promise<import("eslint").Linter.Config[]>}
 */
export default async function mikecannLint({ root, react, convex: useConvex, untyped = [], ignores = [], notReact = [], allowSecondTypeScript = false } = {}) {
  if (!root) throw new Error("mikecann-lint: pass { root: import.meta.dirname }");
  const pkg = readPackage(root);
  const withReact = react ?? (depends(pkg, "react") || depends(pkg, "react-native"));
  const withConvex = useConvex ?? depends(pkg, "convex");

  const configs = [
    { name: "mikecann-lint/ignores", ignores: [...IGNORES, ...ignores] },
    {
      name: "mikecann-lint/base",
      files: CODE,
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { projectService: true, tsconfigRootDir: root, ecmaFeatures: { jsx: true } },
      },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      plugins: {
        "mikecann-lint": plugin,
        "@typescript-eslint": tseslint.plugin,
        "@eslint-community/eslint-comments": comments,
      },
      rules: {
        // Every way out of a rule says why.
        "@eslint-community/eslint-comments/require-description": ["error", { ignore: [] }],
        "@eslint-community/eslint-comments/no-unlimited-disable": "error",
        "@typescript-eslint/ban-ts-comment": "error",
        "mikecann-lint/prefer-kind-discriminant": "error",
      },
    },
    {
      name: "mikecann-lint/untyped",
      files: [...UNTYPED, ...untyped],
      languageOptions: { parserOptions: { projectService: false, project: null } },
    },
  ];

  if (withReact)
    configs.push(
      {
        name: "mikecann-lint/react",
        files: CODE,
        ignores: [...CONVEX, ...notReact],
        plugins: { "react-hooks": reactHooks },
        rules: { ...reactRules(), "mikecann-lint/effect-returns-cleanup-only": "error" },
      },
      {
        name: "mikecann-lint/components",
        files: COMPONENTS,
        rules: {
          "mikecann-lint/click-shows-progress": "error",
          "mikecann-lint/no-render-wait-timer": "error",
        },
      },
    );

  if (withConvex) {
    configs.push({
      name: "mikecann-lint/convex",
      files: CONVEX,
      ignores: TEST_FILES,
      plugins: { "@convex-dev": convex },
      rules: convexRules(),
    });
    const machines = await loadMachines(root);
    if (machines)
      configs.push(
        { name: "mikecann-lint/machines", files: CONVEX, ignores: TEST_FILES, ...machines.configs.recommended },
        {
          // The catalog registers the delivery that timers fire through.
          name: "mikecann-lint/machines-catalog",
          files: ["**/convex/machines.ts"],
          rules: { "machines/no-brand-bypass": ["error", { deliver: false }] },
        },
      );
  }

  configs.push(
    {
      // Rules that need types, so only where the pack has them: not tests,
      // tool configs, plain JS or the app's `untyped` files.
      name: "mikecann-lint/promises-and-switches",
      files: TS,
      ignores: [...UNTYPED, ...untyped],
      rules: {
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",
        // A switch with a default handles the rest on purpose.
        "@typescript-eslint/switch-exhaustiveness-check": [
          "error",
          { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: false },
        ],
        // Files that import each other in a circle, read from the program.
        "mikecann-lint/no-import-cycle": "error",
      },
    },
    {
      // Needs no types, so everywhere there's TypeScript, tests too.
      name: "mikecann-lint/unused",
      files: TS,
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
            destructuredArrayIgnorePattern: "^_",
            ignoreRestSiblings: true,
          },
        ],
      },
    },
  );

  configs.push({
    name: "mikecann-lint/tests",
    files: TEST_FILES,
    rules: { "mikecann-lint/no-sleep-in-tests": "error" },
  });

  // Convex's rules need types, so they stay off where there are none.
  if (withConvex)
    configs.push({
      name: "mikecann-lint/convex-untyped",
      files: ["**/convex/**/*.config.{ts,mts,cts}", ...untyped],
      plugins: { "@convex-dev": convex },
      rules: Object.fromEntries(Object.keys(convexRules()).map((name) => [name, "off"])),
    });

  const copies = loadedTypeScripts();
  if (copies.length > 1 && !allowSecondTypeScript)
    throw new Error(
      `mikecann-lint: two copies of TypeScript are loaded (${copies.join(", ")}), so lint rules would mix them and fail in odd ways. ` +
        "Something loaded typescript-eslint or @convex-dev/eslint-plugin before mikecann-lint could give it TypeScript 6. " +
        "Don't import them in eslint.config yourself: use `import { tseslint, convexPlugin, reactHooks } from \"mikecann-lint\"`, and import mikecann-lint first. If the config loads TypeScript for its own use, pass allowSecondTypeScript: true.",
    );
  return configs;
}

export { plugin, tseslint, reactHooks };
export const convexPlugin = convex;
