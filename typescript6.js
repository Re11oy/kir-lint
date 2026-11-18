// typescript-eslint supports TypeScript up to 6.0, and several apps are on
// TypeScript 7. Rather than make every app add a `typescript6` alias, the
// lint tooling loaded after this module gets this package's own TypeScript 6
// whenever it asks for "typescript". The app's own `tsc` is untouched.
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

// Packages whose `import "typescript"` should get TypeScript 6.
const LINT_TOOLING =
  /[\\/]node_modules[\\/](?:typescript-eslint|@typescript-eslint[\\/][^\\/]+|ts-api-utils|@convex-dev[\\/]eslint-plugin|@convex-dev[\\/]state-machines)[\\/]/;

let installed = false;

export function useTypeScript6() {
  if (installed) return;
  installed = true;
  if (typeof registerHooks !== "function") {
    process.emitWarning(
      "mikecann-lint: this Node has no module.registerHooks (needs Node 22.15+), so lint uses the app's own TypeScript. typescript-eslint only supports TypeScript up to 6.0.",
    );
    return;
  }
  const typescript6 = pathToFileURL(require.resolve("typescript6")).href;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "typescript" && LINT_TOOLING.test(context.parentURL ?? ""))
        return { url: typescript6, shortCircuit: true, format: "commonjs" };
      return nextResolve(specifier, context);
    },
  });
}
