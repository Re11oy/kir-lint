// Every click shows something at once, and nothing can be pressed twice while
// it works (Mike's standing order, 7 Nov 2026; Sammy Cam stuck on "sending...",
// a Cannvas tap that did nothing, Threadbear's approval buttons). This catches
// the mechanical part: a click or press that starts async work on a control
// that never disables. With type information it also sees named handlers
// (`onClick={save}`) and calls whose promise is thrown away (`void save()`).

const EVENTS = new Set(["onClick", "onPress"]);
// Props that show a control is busy or can't be pressed again.
const BUSY_PROPS = new Set(["disabled", "aria-disabled", "aria-busy", "loading", "isLoading", "pending", "busy"]);
const FUNCTIONS = new Set(["ArrowFunctionExpression", "FunctionExpression"]);

function typeServices(context) {
  const services = context.sourceCode.parserServices;
  if (!services?.program || !services.esTreeNodeToTSNodeMap) return null;
  const checker = services.program.getTypeChecker();
  const typeOf = (node) => checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
  // The type the prop asks for: a component whose handler prop returns a
  // promise awaits it and shows its own progress.
  const expectsAsync = (expression) => {
    const wanted = checker.getContextualType(services.esTreeNodeToTSNodeMap.get(expression));
    if (!wanted) return false;
    const options = wanted.isUnion() ? wanted.types : [wanted];
    return options.some((t) => t.getCallSignatures().some((s) => isThenable(s.getReturnType())));
  };
  return { typeOf, expectsAsync };
}

function isThenable(type) {
  if (!type) return false;
  if (type.isUnion?.()) return type.types.some(isThenable);
  const then = type.getProperty?.("then");
  return Boolean(then);
}

function returnsThenable(types, node) {
  if (!types) return false;
  return types.typeOf(node).getCallSignatures().some((s) => isThenable(s.getReturnType()));
}

// A call whose promise is dropped: `save()` or `void save()`.
function startsAsync(types, expression) {
  if (!expression) return false;
  if (expression.type === "AwaitExpression") return true;
  const call = expression.type === "UnaryExpression" && expression.operator === "void" ? expression.argument : expression;
  if (call.type !== "CallExpression") return false;
  if (!types) return expression !== call; // untyped: only an explicit `void call()`
  return isThenable(types.typeOf(call));
}

function handlerStartsAsync(types, handler) {
  if (FUNCTIONS.has(handler.type)) {
    if (handler.async) return true;
    if (handler.body.type !== "BlockStatement") return startsAsync(types, handler.body);
    return handler.body.body.some((s) => s.type === "ExpressionStatement" && startsAsync(types, s.expression));
  }
  if (handler.type === "Identifier" || handler.type === "MemberExpression") return returnsThenable(types, handler);
  return false;
}

function showsBusy(opening) {
  return opening.attributes.some(
    (a) => a.type === "JSXSpreadAttribute" || (a.name?.type === "JSXIdentifier" && BUSY_PROPS.has(a.name.name)),
  );
}

export default {
  meta: {
    type: "problem",
    docs: { description: "A click that starts async work shows progress and can't be pressed twice" },
    schema: [],
    messages: {
      progress:
        "This {{event}} starts async work, but the control never disables, so it looks idle while it waits and can be pressed twice. Show something at once: keep a pending state and pass disabled (plus a spinner) until the work settles, or make the change optimistic. If it really is instant, say so in an eslint-disable comment.",
    },
  },
  create(context) {
    const types = typeServices(context);
    return {
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !EVENTS.has(node.name.name)) return;
        if (node.value?.type !== "JSXExpressionContainer") return;
        if (showsBusy(node.parent)) return;
        const handler = node.value.expression;
        if (!handlerStartsAsync(types, handler)) return;
        if (types?.expectsAsync(handler)) return;
        context.report({ node, messageId: "progress", data: { event: node.name.name } });
      },
    };
  },
};
