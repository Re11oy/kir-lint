// A test that sleeps a fixed time and then checks passes on a quiet machine
// and fails on a busy one. Threadbear needed four fixes for this in
// Oct-Nov 2026 (89dc7f0d7, 13111c29d, 0e8af1019, bb5b88bc3). A sleep inside a
// loop is polling, which is the fix, so it's allowed.

const SLEEP_NAMES = new Set(["sleep", "delay", "wait", "pause"]);
const LOOPS = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
]);
const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

function calleeName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier")
    return callee.property.name;
  return null;
}

function isTimerCall(node) {
  return node?.type === "CallExpression" && calleeName(node.callee) === "setTimeout";
}

// `new Promise((r) => setTimeout(r, 50))`, with or without a block body.
function isPromisifiedTimeout(node) {
  if (node.type !== "NewExpression" || node.callee.type !== "Identifier" || node.callee.name !== "Promise") return false;
  const executor = node.arguments[0];
  if (!executor || !FUNCTIONS.has(executor.type)) return false;
  const body = executor.body;
  if (isTimerCall(body)) return true;
  if (body.type !== "BlockStatement") return false;
  return body.body.some((s) => s.type === "ExpressionStatement" && isTimerCall(s.expression));
}

// The loop (or function) this node is in, whichever is nearer.
function insideLoop(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (LOOPS.has(p.type)) return true;
    if (FUNCTIONS.has(p.type)) return false;
  }
  return false;
}

// `await sleep(50)`, `await delay(50)`, `await setTimeout(50)` from
// node:timers/promises, and Playwright's `page.waitForTimeout(50)`.
function isSleepCall(node) {
  if (node.type !== "CallExpression") return false;
  const name = calleeName(node.callee);
  if (name === "waitForTimeout") return true;
  if (!node.arguments.length) return false;
  const first = node.arguments[0];
  if (name === "setTimeout") return first.type !== "ArrowFunctionExpression" && first.type !== "FunctionExpression" && first.type !== "Identifier";
  return name !== null && SLEEP_NAMES.has(name) && node.callee.type === "Identifier";
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Tests wait for the thing they expect, not a fixed time" },
    schema: [],
    messages: {
      sleep:
        "A fixed sleep in a test passes on a quiet machine and fails on a busy one (taskpolicy -b, a loaded CI box). Wait for the condition itself instead: poll it until it holds, with a generous deadline (expect.poll, vi.waitFor, Testing Library's waitFor, or a small loop), or use fake timers when the code under test waits on time.",
    },
  },
  create(context) {
    function check(node) {
      if (insideLoop(node)) return;
      context.report({ node, messageId: "sleep" });
    }
    return {
      // Only when awaited right there: a `sleep` helper that returns one is
      // fine, and its callers are checked below.
      NewExpression(node) {
        if (node.parent.type === "AwaitExpression" && isPromisifiedTimeout(node)) check(node);
      },
      AwaitExpression(node) {
        if (isSleepCall(node.argument)) check(node);
      },
      "CallExpression[callee.property.name='waitForTimeout']"(node) {
        if (node.parent.type !== "AwaitExpression") check(node);
      },
    };
  },
};
