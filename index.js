// kir-lint: a small, strict ESLint setup for Convex + TypeScript + React
// apps. Every rule here is in because it caught a real bug or a correction we
// kept making; README.md says which. Usage, in eslint.config.mjs:
//
//   import kirLint from "kir-lint";
//   export default await kirLint({ root: import.meta.dirname });
import fs from "node:fs";
import path from "node:path";
import tseslint from "typescript-eslint";
import comments from "@eslint-community/eslint-plugin-eslint-comments";
import plugin from "./plugin.js";

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
  "**/tmp/**",
];

// The React Compiler's lint rules, all as errors, without the two that only
// say a library or syntax isn't supported by the compiler.
const COMPILER_NOISE = new Set(["react-hooks/incompatible-library", "react-hooks/unsupported-syntax"]);
function reactRules(reactHooks) {
  const rules = {};
  for (const name of Object.keys(reactHooks.configs["recommended-latest"].rules))
    if (!COMPILER_NOISE.has(name)) rules[name] = "error";
  return rules;
}

// Convex's recommended rules, warnings made errors, plus no-collect-in-query.
function convexRules(convex) {
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

/**
 * @param {object} options
 * @param {string} options.root The app's folder, usually `import.meta.dirname`.
 * @param {boolean} [options.react] Lint React code. Defaults to whether the app depends on react.
 * @param {boolean} [options.convex] Lint Convex functions. Defaults to whether the app depends on convex.
 * @param {string[]} [options.untyped] More files to lint without type information (files no tsconfig includes).
 * @param {string[]} [options.ignores] More files to skip.
 * @param {string[]} [options.notReact] Files that aren't React, such as server code with functions named use...,
 *   which the hook rules would take for hooks.
 * @returns {Promise<import("eslint").Linter.Config[]>}
 */
export default async function kirLint({ root, react, convex: useConvex, untyped = [], ignores = [], notReact = [] } = {}) {
  if (!root) throw new Error("kir-lint: pass { root: import.meta.dirname }");
  const pkg = readPackage(root);
  const withReact = react ?? (depends(pkg, "react") || depends(pkg, "react-native"));
  const withConvex = useConvex ?? depends(pkg, "convex");
  // Peer dependencies, loaded only for apps that use them.
  const reactHooks = withReact ? (await import("eslint-plugin-react-hooks")).default : null;
  const convex = withConvex ? (await import("@convex-dev/eslint-plugin")).default : null;

  const configs = [
    { name: "kir-lint/ignores", ignores: [...IGNORES, ...ignores] },
    {
      name: "kir-lint/base",
      files: CODE,
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { projectService: true, tsconfigRootDir: root, ecmaFeatures: { jsx: true } },
      },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      plugins: {
        "kir-lint": plugin,
        "@typescript-eslint": tseslint.plugin,
        "@eslint-community/eslint-comments": comments,
      },
      rules: {
        // Every way out of a rule says why.
        "@eslint-community/eslint-comments/require-description": ["error", { ignore: [] }],
        "@eslint-community/eslint-comments/no-unlimited-disable": "error",
        "@typescript-eslint/ban-ts-comment": "error",
        "kir-lint/prefer-kind-discriminant": "error",
      },
    },
    {
      name: "kir-lint/untyped",
      files: [...UNTYPED, ...untyped],
      languageOptions: { parserOptions: { projectService: false, project: null } },
    },
  ];

  if (withReact)
    configs.push(
      {
        name: "kir-lint/react",
        files: CODE,
        ignores: [...CONVEX, ...notReact],
        plugins: { "react-hooks": reactHooks },
        rules: { ...reactRules(reactHooks), "kir-lint/effect-returns-cleanup-only": "error" },
      },
      {
        name: "kir-lint/components",
        files: COMPONENTS,
        rules: {
          "kir-lint/click-shows-progress": "error",
          "kir-lint/no-render-wait-timer": "error",
        },
      },
    );

  if (withConvex)
    configs.push({
      name: "kir-lint/convex",
      files: CONVEX,
      ignores: TEST_FILES,
      plugins: { "@convex-dev": convex },
      rules: convexRules(convex),
    });

  configs.push(
    {
      // Rules that need types, so only where the pack has them: not tests,
      // tool configs, plain JS or the app's `untyped` files.
      name: "kir-lint/promises-and-switches",
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
        "kir-lint/no-import-cycle": "error",
      },
    },
    {
      // Needs no types, so everywhere there's TypeScript, tests too.
      name: "kir-lint/unused",
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
    name: "kir-lint/tests",
    files: TEST_FILES,
    rules: { "kir-lint/no-sleep-in-tests": "error" },
  });

  // Convex's rules need types, so they stay off where there are none.
  if (withConvex)
    configs.push({
      name: "kir-lint/convex-untyped",
      files: ["**/convex/**/*.config.{ts,mts,cts}", ...untyped],
      plugins: { "@convex-dev": convex },
      rules: Object.fromEntries(Object.keys(convexRules(convex)).map((name) => [name, "off"])),
    });

  return configs;
}

export { plugin };
