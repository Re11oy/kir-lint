# mikecann-lint

A small, strict ESLint setup for my Convex + TypeScript + React apps.

The idea comes from Lauren Tan's talk [All Code Is Slop (Except Mine)](https://www.youtube.com/watch?v=O_zcc6Xl12g): when you correct an agent, turn the correction into a check with an error message that says how to fix the cause, rather than another line in AGENTS.md. So every rule here is in because it caught a real bug or a correction I kept making, and the table below says which.

## Setup

```sh
npx mikecann-lint init              # a new app
npx mikecann-lint init --baseline   # an existing app: today's problems are recorded as exempt
```

`init` installs `eslint` and `mikecann-lint`, writes `eslint.config.mjs`, and adds `"lint": "eslint . --max-warnings 0"`. With `--baseline` it also runs `eslint --suppress-all`, which records every current problem in `eslint-suppressions.json`. Only new code has to pass, and you can burn the old ones down whenever. Run `npx eslint . --fix` first to clear the ones that fix themselves.

The config, if you'd rather write it yourself:

```js
// eslint.config.mjs
import mikecannLint from "mikecann-lint";

export default [
  ...(await mikecannLint({ root: import.meta.dirname })),
  // the app's own blocks
];
```

Import it before anything else that loads typescript-eslint (see TypeScript 7 below). Options:

- `root` (required): the app's folder.
- `react`, `convex`: on when the app depends on react / react-native or convex.
- `untyped`: more globs to lint without type information, for files no tsconfig includes ("was not found by the project service").
- `ignores`: more globs to skip.

## The rules

| Rule | Why it's here |
|---|---|
| React Compiler rules from `eslint-plugin-react-hooks` 7 (`set-state-in-effect`, `refs`, `purity`, `immutability`, `exhaustive-deps` and the rest of `recommended-latest`), all errors | Effects that set state caused real bugs, and Opus 5.5 still writes them: a render loop on the new tab dashboard (Oct 2026), an audio blip in Cannvas, a 30 ms timer loop in Let's Build It, inventory saving 55 tools to an old location, a production "too many re-renders" in cann-finances. Run on the files before those fixes, these rules flagged the bad line in 3 of 8. |
| `@convex-dev/eslint-plugin` recommended, warnings as errors | The Convex team's rules. On Threadbear's schema they found 10 indexes that duplicate the start of another. |
| `@convex-dev/no-collect-in-query` | Unbounded `.collect()` in queries: corrected in May 2026 and fixed again in Let's Build It (#918, #990), Cannvas and Agent Archive. |
| State machine rules, when the app uses `@convex-dev/state-machines` | Nothing writes a machine's state around it. Picked up from the app's own copy of the library, with type information. |
| `mikecann-lint/no-sleep-in-tests` | Fixed sleeps in tests failed under load four times in Threadbear (Oct-Nov 2026). Sleeps inside a loop are polling, which is the fix, so they pass. |
| `mikecann-lint/no-render-wait-timer` | `setTimeout(..., 0-100)` in a component guesses when a render has landed: a robot that slid and jumped back, "wait 50 ms then focus". Longer timers are real waits and pass. |
| `mikecann-lint/click-shows-progress` | Every click shows something at once and can't be pressed twice. Flags an `onClick`/`onPress` that starts async work on a control with no `disabled` (or `aria-busy`, `loading`) prop. A component whose prop type returns a promise is trusted to show its own progress. If the change is optimistic, say so in a disable comment. |
| `mikecann-lint/prefer-kind-discriminant` | Unions are tagged with `kind`, as the state machines library does. Asked for in at least five threads. |
| `eslint-comments/require-description`, `no-unlimited-disable`, `ban-ts-comment`, unused disables as errors | Every way out of a rule says why. Agents write justifications for skipping the right fix; at least they're visible this way. |

## Deliberately not in it

- **A ban on `useEffect` or `setTimeout`.** The bugs came from setting state in effects and from fixed sleeps in tests, and both have rules above. A ban would hit about 530 effects and 85 component timers across the apps, and mostly teach agents to wrap their way around it. Timers in Convex actions are abort and retry delays, which are fine.
- **typescript-eslint's `strictTypeChecked`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, no `as`, no `switch`, `max-lines`.** Measured on Cannvas they add about 650 lint problems and 135 type errors, mostly from rules no bug traces back to. Apps can still turn them on for themselves.

## Adding a rule

When an agent gets something wrong that a rule could catch:

1. If it's about this app only, add it to the app's own `eslint-rules/`. If it would apply to any of the apps, add it here.
2. Write the message for the agent: what's wrong and how to fix the cause.
3. Add valid and invalid cases to `test/rules.test.js`, including a false positive you expect.
4. Measure it on a couple of apps before turning it on. If most hits are fine code, it isn't ready.
5. Add a line to the table above saying what happened.

## In the agent's loop

A rule only helps if it runs while the agent works. Threadbear runs `mikecann-lint changed` at the end of every turn that edits code (a home patch in `~/.threadbear/patches/lint.ts`), and tells the agent about failures. It lints only the files the checkout changed, so it takes a few seconds.

## TypeScript 7

typescript-eslint supports TypeScript up to 6.0. This package carries its own TypeScript 6 and points typescript-eslint, the Convex plugin and the state machines rules at it, so apps on TypeScript 7 lint fine without an alias. The app's own `tsc` is untouched. It needs Node 22.15 or later (`module.registerHooks`).
