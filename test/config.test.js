// The config as a whole: the typed rules run where the pack has types, stay
// off where it doesn't (rather than erroring), and the untyped ones run on
// every TypeScript file.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ESLint } from "eslint";
import kirLint from "../index.js";

const fixture = path.join(import.meta.dirname, "fixture");
const eslint = new ESLint({
  cwd: fixture,
  overrideConfigFile: true,
  overrideConfig: await kirLint({ root: fixture, react: false, convex: false, untyped: ["scripts/**"] }),
});

async function lint(file, code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(fixture, file) });
  return result.messages.map((m) => m.ruleId ?? m.message);
}

const FLOATING = `async function save() {}\nexport function go() { save(); }\n`;
const MISUSED = `async function ready() { return true; }\nexport function go() { if (ready()) return 1; return 0; }\n`;
const SWITCH = `type Shape = { kind: "circle" } | { kind: "square" };\nexport function area(s: Shape) { switch (s.kind) { case "circle": return 1; } }\n`;

describe("typed rules", () => {
  it("flag a promise nobody awaits", async () => {
    assert.deepEqual(await lint("file.tsx", FLOATING), ["@typescript-eslint/no-floating-promises"]);
  });
  it("pass a promise that's awaited, caught or voided", async () => {
    const code = `async function save() {}\nexport async function go() { await save(); save().catch(() => {}); void save(); }\n`;
    assert.deepEqual(await lint("file.tsx", code), []);
  });
  it("flag a promise tested for truthiness", async () => {
    // A promise is always truthy, so the condition is unnecessary too.
    assert.deepEqual(await lint("file.tsx", MISUSED), [
      "@typescript-eslint/no-misused-promises",
      "@typescript-eslint/no-unnecessary-condition",
    ]);
  });
  it("flag a switch missing a case of its union", async () => {
    assert.deepEqual(await lint("file.tsx", SWITCH), ["@typescript-eslint/switch-exhaustiveness-check"]);
  });
  it("count a default as handling the rest", async () => {
    const code = `type Shape = { kind: "circle" } | { kind: "square" };\nexport function area(s: Shape) { switch (s.kind) { case "circle": return 1; default: return 0; } }\n`;
    assert.deepEqual(await lint("file.tsx", code), []);
  });
  it("don't ask for a default on a switch over a plain string", async () => {
    const code = `export function f(s: string) { switch (s) { case "a": return 1; } return 0; }\n`;
    assert.deepEqual(await lint("file.tsx", code), []);
  });
  it("stay off, without erroring, in tests, tool configs and untyped files", async () => {
    for (const file of ["file.test.ts", "vite.config.ts", "scripts/tool.ts"]) {
      assert.deepEqual(await lint(file, FLOATING + MISUSED.replace("go", "go2")), [], file);
    }
  });
});

describe("unnecessary conditions and deprecated APIs", () => {
  it("flag a guard the types say is always true", async () => {
    const code = `export function f(s: string) { if (s) return s.length; return s ?? 0; }\n`;
    assert.deepEqual(await lint("file.tsx", code), ["@typescript-eslint/no-unnecessary-condition"]);
  });
  it("keep a guard on an array index (noUncheckedIndexedAccess)", async () => {
    const code = `export function f(xs: string[]) { const x = xs[0]; if (x) return x.length; return 0; }\n`;
    assert.deepEqual(await lint("file.tsx", code), []);
  });
  it("flag a deprecated API", async () => {
    const code = `/** @deprecated Use next. */\nexport function old() {}\nexport function go() { old(); }\n`;
    assert.deepEqual(await lint("file.tsx", code), ["@typescript-eslint/no-deprecated"]);
  });
});

describe("type assertions", () => {
  const CAST = `export const n = JSON.parse("1") as number;\nexport const k = ["a"] as const;\n`;
  it("flag a cast, not \`as const\`, outside tests", async () => {
    for (const file of ["file.tsx", "scripts/tool.ts"]) {
      assert.deepEqual(await lint(file, CAST), ["@typescript-eslint/consistent-type-assertions"], file);
    }
  });
  it("allow casts in tests", async () => {
    assert.deepEqual(await lint("file.test.ts", CAST), []);
  });
});

describe("no-unused-vars", () => {
  it("flags unused imports, locals and parameters, typed or not", async () => {
    const code = `import { a } from "./x";\nexport function f(x: number) { const y = 1; return 2; }\n`;
    for (const file of ["file.tsx", "file.test.ts", "scripts/tool.ts"]) {
      assert.deepEqual(await lint(file, code), Array(3).fill("@typescript-eslint/no-unused-vars"), file);
    }
  });
  it("lets a leading _ and rest siblings through", async () => {
    const code = `export function f(_x: number, o: { a: 1; b: 2 }) { const { a: _a, ...rest } = o; const [_first, second] = [1, 2]; try { return [rest, second]; } catch (_e) { return []; } }\n`;
    assert.deepEqual(await lint("file.tsx", code), []);
  });
});
