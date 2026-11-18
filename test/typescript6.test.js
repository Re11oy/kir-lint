import { it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { useTypeScript6 } from "../typescript6.js";

useTypeScript6();
const require = createRequire(import.meta.url);

it("gives lint tooling TypeScript 6, including by subpath", () => {
  const fake = require(path.join(import.meta.dirname, "fixture/node_modules/@typescript-eslint/fake/index.cjs"));
  assert.match(fake.main, /^6\./);
  assert.match(fake.tsserver, /^6\./);
});
