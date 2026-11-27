# kir-lint

A small, strict ESLint setup for our Convex + TypeScript + React apps.

Adapted from Mike Cann's [mikecann-lint](https://github.com/mikecann/mikecann-lint): the rules, the approach and most of the code are his.

The idea: when you correct an agent, turn the correction into a check with an error message that says how to fix the cause, rather than another line in AGENTS.md. So every rule here is in because it caught a real bug or a correction we kept making, and the table below says which.

## Setup

kir-lint is installed from GitHub by tag, not from npm:

```sh
npx github:Re11oy/kir-lint#v1.1.0 init              # a new app
npx github:Re11oy/kir-lint#v1.1.0 init --baseline   # an existing app: today's problems are recorded as exempt
```

`init` installs `kir-lint` with its peers (`eslint`, `typescript`, `typescript-eslint`, plus `eslint-plugin-react-hooks` and `@convex-dev/eslint-plugin` when the app uses React or Convex), writes `eslint.config.mjs`, and adds `"lint": "eslint . --max-warnings 0"`. With `--baseline` it also runs `eslint --suppress-all`, which records every current problem in `eslint-suppressions.json`. Only new code has to pass, and you can burn the old ones down whenever. Run `npx eslint . --fix` first to clear the ones that fix themselves.

By hand:

```sh
pnpm add -D github:Re11oy/kir-lint#v1.1.0 eslint typescript typescript-eslint eslint-plugin-react-hooks @convex-dev/eslint-plugin
```

```js
// eslint.config.mjs
import kirLint from "kir-lint";

export default [
  ...(await kirLint({ root: import.meta.dirname })),
  // the app's own blocks
];
```

The plugins are peer dependencies, so the pack and the app's own blocks (or a framework config such as `eslint-config-next`) share one copy of each. Options:

- `root` (required): the app's folder.
- `react`, `convex`: on when the app depends on react / react-native or convex.
- `untyped`: more globs to lint without type information, for files no tsconfig includes ("was not found by the project service").
- `ignores`: more globs to skip.
- `notReact`: files that aren't React, such as server code with functions named `use...`, which the hook rules would take for hooks.

## The rules

| Rule | Why it's here |
|---|---|
| React Compiler rules from `eslint-plugin-react-hooks` 7 (`set-state-in-effect`, `refs`, `purity`, `immutability`, `exhaustive-deps` and the rest of `recommended-latest`), all errors | Effects that set state cause render loops, timer loops, saves to stale state and production "too many re-renders", and agents still write them. Run on the code before such fixes, these rules flagged the bad line in 3 of 8. |
| `@convex-dev/eslint-plugin` recommended, warnings as errors | The Convex team's rules, such as indexes that duplicate the start of another. |
| `@convex-dev/no-collect-in-query` | Unbounded `.collect()` in queries, a correction made again and again. |
| `@convex-dev/require-access-control` | Every public query, mutation and action checks access first, through a helper whose name says so: `require…`, `assert…`, `check…`, `ensure…`, `can…`, `has…`, or `verify…` for a signed token or secret link of a function that is public on purpose. Name your access helpers that way. |
| `@convex-dev/import-wrong-runtime` | Agents add `"use node"` to files that don't need it, then import them from the default runtime. A `"use node"` file stays a thin entry point that nothing imports. |
| `kir-lint/no-returns-validator` | Convex infers a function's return type from its handler. A hand-written `returns:` validator drifts from what the handler returns. Delete it. |
| `kir-lint/no-conditional-spread` | `...(x ? { x } : {})` hides a plain field behind a spread. Convex drops undefined fields when it stores a document, so write `x: x ? value : undefined`. Allowed inside `ctx.db.patch`, where undefined unsets the field. |
| `kir-lint/effect-returns-cleanup-only` | An effect's return value is its cleanup. `useEffect(() => box.current?.scrollTo({ top: 0 }), [key])` crashed an app: current Chrome makes `scrollTo`, `scrollBy` and `scrollIntoView` return a Promise, so React got a promise as the cleanup and leaving the page blanked the app with "destroy is not a function". TypeScript's DOM types still say `void`, so typecheck passed. Flags a concise-body effect (`() => expr`) unless `expr` is a function, or typed as one (`() => store.subscribe(cb)`); with types also a block body's `return` of a non-function, and any `async` effect. Fix: wrap the body in braces, `() => { expr; }`; `--fix` does it where the type says it's not a cleanup. |
| `kir-lint/no-sleep-in-tests` | Fixed sleeps in tests fail under load, such as on a busy CI runner. Sleeps inside a loop are polling, which is the fix, so they pass. |
| `kir-lint/no-render-wait-timer` | `setTimeout(..., 0-100)` in a component guesses when a render has landed: an element that slid and jumped back, "wait 50 ms then focus". Longer timers are real waits and pass. |
| `kir-lint/click-shows-progress` | Every click shows something at once and can't be pressed twice. Flags an `onClick`/`onPress` that starts async work on a control with no `disabled` (or `aria-busy`, `loading`) prop. A component whose prop type returns a promise is trusted to show its own progress. If the change is optimistic, say so in a disable comment. |
| `kir-lint/prefer-kind-discriminant` | Unions are tagged with `kind`, as Convex's state machines library does, so every union reads the same. |
| `@typescript-eslint/no-floating-promises`, `no-misused-promises` | A promise nobody awaits fails silently, or as an "unhandled rejection" in a log nobody reads; a promise tested for truthiness is always true. Fix the cause: `await` it, end it with `.catch(...)`, or mark it `void` when its failure really doesn't matter. An async `onClick` becomes `() => void save()` (and `click-shows-progress` still wants it disabled while it works). Typed, so off in tests, tool configs and `untyped` files. |
| `@typescript-eslint/switch-exhaustiveness-check` | A switch with no default must name every case of the union it switches on, so adding a `kind` shows every place that has to handle it. A `default:` counts as handling the rest on purpose. Fix: add the missing cases (or a `default` that says why the rest need nothing). |
| `kir-lint/no-import-cycle` | Files that import each other in a circle can't be read or changed alone, and at runtime one sees the other half-loaded. Most loops are a shared helper put beside one of its users. Read from the TypeScript program, so it costs one walk of the imports per run. `import type`, dynamic `import()`, packages and generated files don't count. Fix: move what both sides share into a file of its own, or pass one side a callback. Typed, so off in tests, tool configs and `untyped` files. |
| `@typescript-eslint/no-unused-vars` | Imports and locals left behind after code moves mislead the next reader. Delete it, or start its name with `_` when a signature needs it. |
| `@typescript-eslint/no-unnecessary-condition`, `no-unnecessary-type-assertion` | A guard the types say can never be true, or a cast to the type a value already has, is noise that hides the checks that matter. Needs `noUncheckedIndexedAccess` in the tsconfig: without it a real guard on `array[i]` reads as unnecessary. Typed, so off in tests, tool configs and `untyped` files. |
| `@typescript-eslint/no-deprecated` | A deprecated API still works until the next major version removes it; this lists every use while the replacement is one line away (an AI SDK `system` → `instructions`, `totalUsage` → `usage`). Typed. |
| `@typescript-eslint/consistent-type-assertions` (`never`) | `x as T` tells the type checker to stop checking. Prove the type instead: a validator, a type guard, a typed helper. `as const` is fine, and tests may cast their fakes. Where a cast really can't be avoided, a disable comment says why. |
| `eslint-comments/require-description`, `no-unlimited-disable`, `ban-ts-comment`, unused disables as errors | Every way out of a rule says why. Agents write justifications for skipping the right fix; at least they're visible this way. |

## Deliberately not in it

Measured on seo-claw (Nov 2026) before deciding:

- **A ban on `useEffect` or `setTimeout`.** The bugs came from setting state in effects and from fixed sleeps in tests, and both have rules above. A ban would hit hundreds of fine effects and timers, and mostly teach agents to wrap their way around it.
- **typescript-eslint's `strictTypeChecked` as a whole.** About 1,900 problems, nearly all style: numbers in template strings (568), `any` from mocks in tests (about 460), `!` in tests, void expressions, `require-await`. Its one rule that found real work, `no-deprecated`, is in the table above.
- **`exactOptionalPropertyTypes`.** 244 type errors, and it fights `x: x ? value : undefined`, which `no-conditional-spread` asks for.
- **A ban on `switch`.** `switch-exhaustiveness-check` relies on it.
- **`max-lines`.** 41 files over 400 lines; the rule would split files to meet a number rather than along their seams.

## Adding a rule

When an agent gets something wrong that a rule could catch:

1. If it's about one app only, add it to that app's own config. If it would apply to any of our apps, add it here.
2. Write the message for the agent: what's wrong and how to fix the cause.
3. Add valid and invalid cases to `test/rules.test.js`, including a false positive you expect.
4. Measure it on our apps before turning it on. If most hits are fine code, it isn't ready.
5. Add a line to the table above saying what happened.
6. Bump the version in `package.json`. Merging to main tags it `v<version>` (`.github/workflows/tag.yml`).

A rule the pack configures is replaced, not merged, when an app sets the same rule. So a check here is a named rule of its own, not a `no-restricted-syntax` or `no-restricted-imports` entry an app would overwrite.

## Upgrading

Change the tag in the app's `package.json` (`github:Re11oy/kir-lint#v<version>`), install, then `npx eslint . --prune-suppressions`. When a rule gets narrower, problems you'd recorded as exempt stop happening, and ESLint fails until the exemptions file is pruned. The same goes for fixing an old problem by hand: prune, and the file shrinks.

When an upgrade adds a rule, fix what it finds, or record it without touching the other exemptions: `npx eslint . --suppress-rule <rule>` for each new rule (1.1.0 added the Convex access, runtime, `returns` and spread rules, `no-unnecessary-condition`, `no-unnecessary-type-assertion`, `no-deprecated` and the ban on `as`). Recorded problems are the app's lint debt: new code can't add to them, and fixing one shrinks the file after `--prune-suppressions`. If the app's own config already sets one of them, its setting still wins, as it comes after the pack.
