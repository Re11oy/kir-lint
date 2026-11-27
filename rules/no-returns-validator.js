// Convex infers a function's return type from its handler. A `returns:`
// validator restates it by hand, and agents kept adding them, then letting
// them drift from what the handler returns.

export default {
  meta: {
    type: "suggestion",
    docs: { description: "No `returns` validators on Convex functions" },
    schema: [],
    messages: {
      returns: "No returns validators: let Convex infer the type from the handler. Delete the `returns` field.",
    },
  },
  create(context) {
    return {
      "CallExpression > ObjectExpression > Property[key.name='returns']"(node) {
        context.report({ node: node.key, messageId: "returns" });
      },
    };
  },
};
