// An effect's return value is its cleanup: React calls it when the effect
// re-runs or the component unmounts. A real crash (Nov 2026) came from
// `useEffect(() => box.current?.scrollTo({ top: 0 }), [key])`. Current Chrome
// makes Element.scrollTo, scrollBy and scrollIntoView return a Promise, so the
// arrow handed React a promise as its cleanup and navigating away crashed the
// whole app with "destroy is not a function". TypeScript's DOM types still say
// those methods return void, so typecheck passed.
//
// So a concise-body effect (`() => expr`) is flagged unless the expression is
// a function, or, with type information, has a function (or undefined) type,
// as in `() => store.subscribe(cb)`. With type information it also checks a
// block body's `return` values. Async effects always return a promise.

const HOOKS = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect"]);
const FUNCTIONS = new Set(["ArrowFunctionExpression", "FunctionExpression"]);

function isEffectHook(callee) {
  if (callee.type === "Identifier") return HOOKS.has(callee.name);
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    HOOKS.has(callee.property.name)
  );
}

function typeServices(context) {
  const services = context.sourceCode.parserServices;
  if (!services?.program || !services.esTreeNodeToTSNodeMap) return null;
  const checker = services.program.getTypeChecker();
  return (node) => {
    const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
    const parts = type.isUnion() ? type.types : [type];
    const names = parts.map((t) => checker.typeToString(t));
    // Can't tell, so don't guess.
    if (names.some((n) => n === "any" || n === "unknown")) return "unknown";
    const cleanup = parts.every((t, i) => names[i] === "undefined" || t.getCallSignatures().length > 0);
    return cleanup ? "cleanup" : "value";
  };
}

export default {
  meta: {
    type: "problem",
    docs: { description: "An effect returns nothing or a cleanup function, never another value" },
    fixable: "code",
    schema: [],
    messages: {
      concise:
        "This effect returns the value of its expression, which React treats as a cleanup and calls on unmount; a non-function crashes the app with \"destroy is not a function\" (DOM scroll methods now return Promises). Wrap the body in braces: `() => { expr; }`. If it really returns a cleanup, write `() => { return expr; }`.",
      returned:
        "This effect returns a value that isn't a function, which React treats as a cleanup and calls on unmount, crashing with \"destroy is not a function\". Call it as a statement and return nothing, or return a cleanup function.",
      async:
        "An async effect returns a Promise, which React treats as a cleanup and calls on unmount, crashing with \"destroy is not a function\". Define an async function inside the effect and call it: `useEffect(() => { void load(); }, [...])`.",
    },
  },
  create(context) {
    const typeOf = typeServices(context);
    const effects = new Set();

    return {
      CallExpression(node) {
        if (!isEffectHook(node.callee)) return;
        const effect = node.arguments[0];
        if (!effect || !FUNCTIONS.has(effect.type)) return;
        if (effect.async) {
          context.report({ node: effect, messageId: "async" });
          return;
        }
        if (effect.body.type === "BlockStatement") {
          if (typeOf) effects.add(effect);
          return;
        }
        const body = effect.body;
        if (FUNCTIONS.has(body.type)) return;
        const kind = typeOf ? typeOf(body) : body.type === "Identifier" ? "unknown" : "value";
        if (kind !== "value") return;
        // Only fix when types say it's not a function, so a cleanup is never dropped.
        const fix = typeOf
          ? (fixer) => {
              const arrow = context.sourceCode.getTokenBefore(body, (t) => t.value === "=>");
              const start = arrow.range[1];
              const text = context.sourceCode.text.slice(start, effect.range[1]).trim();
              return fixer.replaceTextRange([start, effect.range[1]], ` { ${text}; }`);
            }
          : null;
        context.report({ node: body, messageId: "concise", fix });
      },
      ReturnStatement(node) {
        if (!node.argument || effects.size === 0) return;
        let fn = node.parent;
        while (fn && !FUNCTIONS.has(fn.type) && fn.type !== "FunctionDeclaration") fn = fn.parent;
        if (!effects.has(fn)) return;
        const arg = node.argument;
        if (FUNCTIONS.has(arg.type)) return;
        if (typeOf(arg) === "value") context.report({ node: arg, messageId: "returned" });
      },
    };
  },
};
