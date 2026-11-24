import { describe, it } from "node:test";
import path from "node:path";
import { RuleTester } from "eslint";
import { useTypeScript6 } from "../typescript6.js";
import plugin from "../plugin.js";

useTypeScript6();
const { default: tseslint } = await import("typescript-eslint");

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const fixture = path.join(import.meta.dirname, "fixture");
const typed = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { projectService: true, tsconfigRootDir: fixture, ecmaFeatures: { jsx: true } },
  },
});
const untyped = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});
const tsx = path.join(fixture, "file.tsx");
const testFile = path.join(fixture, "file.test.ts");
const { rules } = plugin;

typed.run("click-shows-progress", rules["click-shows-progress"], {
  valid: [
    // Disabled while it works.
    { filename: tsx, code: `async function save() {}\nconst x = <button disabled={false} onClick={save}>Save</button>;` },
    { filename: tsx, code: `async function save() {}\nconst x = <button aria-busy={true} onClick={async () => { await save(); }}>Save</button>;` },
    // Synchronous work.
    { filename: tsx, code: `function open() {}\nconst x = <button onClick={open}>Open</button>;` },
    { filename: tsx, code: `function open() {}\nconst x = <button onClick={() => open()}>Open</button>;` },
    // A spread may carry disabled; can't tell, so leave it.
    { filename: tsx, code: `async function save() {}\nconst p = {};\nconst x = <button {...p} onClick={save}>Save</button>;` },
    // A component whose prop takes a promise awaits it and shows its own progress.
    {
      filename: tsx,
      code: `function AsyncButton(props: { onClick?: () => Promise<void>; children: string }) { return null; }\nasync function save() {}\nconst x = <AsyncButton onClick={save}>Save</AsyncButton>;`,
    },
    // Other events.
    { filename: tsx, code: `async function save() {}\nconst x = <form onSubmit={save} />;` },
  ],
  invalid: [
    { filename: tsx, code: `async function save() {}\nconst x = <button onClick={save}>Save</button>;`, errors: [{ messageId: "progress" }] },
    { filename: tsx, code: `async function save() {}\nconst x = <button onClick={async () => { await save(); }}>Save</button>;`, errors: [{ messageId: "progress" }] },
    // Throwing the promise away doesn't make the wait go away.
    { filename: tsx, code: `async function save() {}\nconst x = <button onClick={() => void save()}>Save</button>;`, errors: [{ messageId: "progress" }] },
    { filename: tsx, code: `async function save() {}\nconst x = <button onClick={() => { save(); }}>Save</button>;`, errors: [{ messageId: "progress" }] },
    { filename: tsx, code: `const api = { save: async () => {} };\nconst x = <Pressable onPress={api.save} />;\nfunction Pressable(p: { onPress?: () => void }) { return null; }`, errors: [{ messageId: "progress" }] },
  ],
});

untyped.run("click-shows-progress without types", rules["click-shows-progress"], {
  valid: [{ code: `const x = <button onClick={save}>Save</button>;` }],
  invalid: [
    { code: `const x = <button onClick={async () => { await save(); }}>Save</button>;`, errors: [{ messageId: "progress" }] },
    { code: `const x = <button onClick={() => void save()}>Save</button>;`, errors: [{ messageId: "progress" }] },
  ],
});

untyped.run("no-render-wait-timer", rules["no-render-wait-timer"], {
  valid: [
    { code: `setTimeout(() => setCopied(false), 1500);` },
    { code: `window.setTimeout(close, 300);` },
    { code: `setTimeout(tick, delayMs);` },
  ],
  invalid: [
    { code: `setTimeout(() => input.focus(), 50);`, errors: [{ messageId: "timer", data: { ms: "50" } }] },
    { code: `window.setTimeout(() => scroll(), 0);`, errors: [{ messageId: "timer" }] },
    { code: `setTimeout(() => setPhase("done"));`, errors: [{ messageId: "timer", data: { ms: "0" } }] },
    { code: `setTimeout(measure, 100);`, errors: [{ messageId: "timer" }] },
  ],
});

untyped.run("no-sleep-in-tests", rules["no-sleep-in-tests"], {
  valid: [
    // Polling: a sleep in a loop that ends when the condition holds.
    { filename: testFile, code: `async function f() { while (!done() && Date.now() < end) await new Promise((r) => setTimeout(r, 10)); }` },
    { filename: testFile, code: `async function f() { for (let i = 0; i < 200 && !ok(); i++) await sleep(10); }` },
    // A helper that returns the promise; its callers are what's checked.
    { filename: testFile, code: `const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));` },
    { filename: testFile, code: `async function f() { await vi.waitFor(() => expect(x).toBe(1)); }` },
    { filename: testFile, code: `setTimeout(() => done(), 10);` },
  ],
  invalid: [
    { filename: testFile, code: `async function f() { await new Promise((r) => setTimeout(r, 50)); }`, errors: [{ messageId: "sleep" }] },
    { filename: testFile, code: `async function f() { await new Promise((resolve) => { setTimeout(resolve, 600); }); }`, errors: [{ messageId: "sleep" }] },
    { filename: testFile, code: `async function f() { await sleep(500); expect(x).toBe(1); }`, errors: [{ messageId: "sleep" }] },
    { filename: testFile, code: `import { setTimeout } from "node:timers/promises";\nasync function f() { await setTimeout(100); }`, errors: [{ messageId: "sleep" }] },
    { filename: testFile, code: `async function f() { await page.waitForTimeout(1000); }`, errors: [{ messageId: "sleep" }] },
    // A sleep inside a callback inside a loop is still not a poll of the loop.
    { filename: testFile, code: `for (const x of xs) it(x, async () => { await sleep(50); });`, errors: [{ messageId: "sleep" }] },
  ],
});

untyped.run("prefer-kind-discriminant", rules["prefer-kind-discriminant"], {
  valid: [
    { code: `type Shape = { kind: "circle"; r: number } | { kind: "square"; side: number };` },
    { code: `type Props = { type: string; name: string };` },
    { code: `type T = { type: "a" };` },
  ],
  invalid: [
    {
      code: `type Shape = { type: "circle"; r: number } | { type: "square"; side: number };`,
      errors: [{ messageId: "kind" }, { messageId: "kind" }],
    },
    { code: `type E = { type: "a" | "b"; x: 1 } | { kind: "c" };`, errors: [{ messageId: "kind" }] },
  ],
});

const loopA = path.join(fixture, "loop-a.ts");
const loopB = path.join(fixture, "loop-b.ts");
const oneWay = path.join(fixture, "one-way.ts");
typed.run("no-import-cycle", rules["no-import-cycle"], {
  valid: [
    // Type-only imports and dynamic imports aren't a loop at runtime, so
    // one-way.ts, which reaches loop-a and loop-b only those ways, is in none.
    { filename: oneWay, code: `import type { a } from "./loop-a";\nimport { type b } from "./loop-b";\nexport type T = typeof a | typeof b;\nexport const lazy = () => import("./loop-a");\n` },
    // A package import is never part of a loop.
    { filename: tsx, code: `import { useState } from "react";\nexport const x = useState;` },
  ],
  invalid: [
    {
      filename: loopA,
      code: `import { b } from "./loop-b";\nexport const a = () => b;\n`,
      errors: [{ messageId: "cycle", data: { path: "loop-a.ts → loop-b.ts → loop-a.ts" } }],
    },
    {
      filename: loopB,
      code: `import { a } from "./loop-a";\nexport const b = 1;\nexport const c = () => a;\n`,
      errors: [{ messageId: "cycle", data: { path: "loop-b.ts → loop-a.ts → loop-b.ts" } }],
    },
  ],
});
