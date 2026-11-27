# kir-lint

A small, strict ESLint setup for our Convex + TypeScript + React apps.

Adapted from Mike Cann's [mikecann-lint](https://github.com/mikecann/mikecann-lint): the rules, the approach and most of the code are his.

The idea: when you correct an agent, turn the correction into a check with an error message that says how to fix the cause, rather than another line in AGENTS.md. So every rule here is in because it caught a real bug or a correction we kept making, and the table below says which.

## Setup

kir-lint is installed from GitHub by tag, not from npm:

```sh
npx github:Re11oy/kir-lint#v1.0.0 init              # a new app
npx github:Re11oy/kir-lint#v1.0.0 init --baseline   # an existing app: today's problems are recorded as exempt
```

`init` installs `kir-lint` with its peers (`eslint`, `typescript`, `typescript-eslint`, plus `eslint-plugin-react-hooks` and `@convex-dev/eslint-plugin` when the app uses React or Convex), writes `eslint.config.mjs`, and adds `"lint": "eslint . --max-warnings 0"`. With `--baseline` it also runs `eslint --suppress-all`, which records every current problem in `eslint-suppressions.json`. Only new code has to pass, and you can burn the old ones down whenever. Run `npx eslint . --fix` first to clear the ones that fix themselves.

By hand:

```sh
pnpm add -D github:Re11oy/kir-lint#v1.0.0 eslint typescript typescript-eslint eslint-plugin-react-hooks @convex-dev/eslint-plugin
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
| `kir-lint/effect-returns-cleanup-only` | An effect's return value is its cleanup. `useEffect(() => box.current?.scrollTo({ top: 0 }), [key])` crashed an app: current Chrome makes `scrollTo`, `scrollBy` and `scrollIntoView` return a Promise, so React got a promise as the cleanup and leaving the page blanked the app with "destroy is not a function". TypeScript's DOM types still say `void`, so typecheck passed. Flags a concise-body effect (`() => expr`) unless `expr` is a function, or typed as one (`() => store.subscribe(cb)`); with types also a block body's `return` of a non-function, and any `async` effect. Fix: wrap the body in braces, `() => { expr; }`; `--fix` does it where the type says it's not a cleanup. |
| `kir-lint/no-sleep-in-tests` | Fixed sleeps in tests fail under load, such as on a busy CI runner. Sleeps inside a loop are polling, which is the fix, so they pass. |
| `kir-lint/no-render-wait-timer` | `setTimeout(..., 0-100)` in a component guesses when a render has landed: an element that slid and jumped back, "wait 50 ms then focus". Longer timers are real waits and pass. |
| `kir-lint/click-shows-progress` | Every click shows something at once and can't be pressed twice. Flags an `onClick`/`onPress` that starts async work on a control with no `disabled` (or `aria-busy`, `loading`) prop. A component whose prop type returns a promise is trusted to show its own progress. If the change is optimistic, say so in a disable comment. |
| `kir-lint/prefer-kind-discriminant` | Unions are tagged with `kind`, as Convex's state machines library does, so every union reads the same. |
| `@typescript-eslint/no-floating-promises`, `no-misused-promises` | A promise nobody awaits fails silently, or as an "unhandled rejection" in a log nobody reads; a promise tested for truthiness is always true. Fix the cause: `await` it, end it with `.catch(...)`, or mark it `void` when its failure really doesn't matter. An async `onClick` becomes `() => void save()` (and `click-shows-progress` still wants it disabled while it works). Typed, so off in tests, tool configs and `untyped` files. |
| `@typescript-eslint/switch-exhaustiveness-check` | A switch with no default must name every case of the union it switches on, so adding a `kind` shows every place that has to handle it. A `default:` counts as handling the rest on purpose. Fix: add the missing cases (or a `default` that says why the rest need nothing). |
| `kir-lint/no-import-cycle` | Files that import each other in a circle can't be read or changed alone, and at runtime one sees the other half-loaded. Most loops are a shared helper put beside one of its users. Read from the TypeScript program, so it costs one walk of the imports per run. `import type`, dynamic `import()`, packages and generated files don't count. Fix: move what both sides share into a file of its own, or pass one side a callback. Typed, so off in tests, tool configs and `untyped` files. |
| `@typescript-eslint/no-unused-vars` | Imports and locals left behind after code moves mislead the next reader. Delete it, or start its name with `_` when a signature needs it. |
| `eslint-comments/require-description`, `no-unlimited-disable`, `ban-ts-comment`, unused disables as errors | Every way out of a rule says why. Agents write justifications for skipping the right fix; at least they're visible this way. |

## Deliberately not in it

- **A ban on `useEffect` or `setTimeout`.** The bugs came from setting state in effects and from fixed sleeps in tests, and both have rules above. A ban would hit hundreds of fine effects and timers, and mostly teach agents to wrap their way around it. Timers in Convex actions are abort and retry delays, which are fine.
- **typescript-eslint's `strictTypeChecked`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, no `as`, no `switch`, `max-lines`.** On a real app they add hundreds of lint problems and type errors, mostly from rules no bug traces back to. Apps can still turn them on for themselves.

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

When an upgrade adds a rule, record what it finds today without touching the other exemptions: `npx eslint . --suppress-rule <rule>` for each new rule. If the app's own config already sets one of them, its setting still wins, as it comes after the pack.
