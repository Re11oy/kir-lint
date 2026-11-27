// `...(x ? { x } : {})` hides a plain field behind a spread. Convex drops
// undefined fields when it stores a document, so `x: x ? value : undefined`
// says the same thing. In ctx.db.patch an undefined field unsets it, so a
// spread that leaves the field out is allowed there.

function isEmptyObject(node) {
  return node.type === "ObjectExpression" && node.properties.length === 0;
}

function insidePatch(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      parent.type === "CallExpression" &&
      parent.callee.type === "MemberExpression" &&
      !parent.callee.computed &&
      parent.callee.property.type === "Identifier" &&
      parent.callee.property.name === "patch"
    )
      return true;
  }
  return false;
}

export default {
  meta: {
    type: "suggestion",
    docs: { description: "Write an optional field as `x ? value : undefined`, not a conditional spread" },
    schema: [],
    messages: {
      spread:
        "Undefined fields are dropped anyway: write the field as x ? value : undefined. (In ctx.db.patch, undefined unsets the field, so the spread is allowed there.)",
    },
  },
  create(context) {
    return {
      SpreadElement(node) {
        const arg = node.argument;
        if (arg.type !== "ConditionalExpression") return;
        if (!isEmptyObject(arg.consequent) && !isEmptyObject(arg.alternate)) return;
        if (insidePatch(node)) return;
        context.report({ node, messageId: "spread" });
      },
    };
  },
};
