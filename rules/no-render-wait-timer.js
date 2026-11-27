// A short timer in a component is a guess at when React has rendered or the
// DOM has settled, and the guess is wrong on a slow device: a robot that slid
// and jumped back after a setTimeout(0), "wait 50 ms for the window, then
// focus". Longer timers
// (a "Copied" label that resets, a hover delay) are real waits and fine.

const LIMIT_MS = 100;

function isTimer(callee) {
  if (callee.type === "Identifier") return callee.name === "setTimeout";
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    callee.property.name === "setTimeout" &&
    callee.object.type === "Identifier" &&
    ["window", "globalThis", "self"].includes(callee.object.name)
  );
}

function shortDelay(node) {
  const delay = node.arguments[1];
  if (!delay) return true;
  return delay.type === "Literal" && typeof delay.value === "number" && delay.value <= LIMIT_MS;
}

export default {
  meta: {
    type: "problem",
    docs: { description: "No short timers that wait for a render in components" },
    schema: [],
    messages: {
      timer:
        "A timer of {{ms}} ms in a component is guessing when React has rendered or the DOM has settled, and it guesses wrong on a slow device. Do the work when the thing exists: a ref callback, useLayoutEffect, an effect that depends on the state that makes it appear, or autoFocus for focus. If you're waiting on an animation, use its end event.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isTimer(node.callee) || !shortDelay(node)) return;
        const delay = node.arguments[1];
        context.report({ node, messageId: "timer", data: { ms: delay ? String(delay.value) : "0" } });
      },
    };
  },
};
