// Discriminated unions are tagged with `kind`, the way Convex's state machines
// library does, so every union in a codebase reads the same.

function isLiteralUnion(node) {
  if (node?.type === "TSLiteralType") return true;
  return node?.type === "TSUnionType" && node.types.every((t) => t.type === "TSLiteralType");
}

function typeTag(member) {
  if (member.type !== "TSTypeLiteral") return null;
  for (const m of member.members) {
    if (m.type !== "TSPropertySignature" || m.key.type !== "Identifier" || m.key.name !== "type") continue;
    if (isLiteralUnion(m.typeAnnotation?.typeAnnotation)) return m;
  }
  return null;
}

export default {
  meta: {
    type: "suggestion",
    docs: { description: "Tag discriminated unions with `kind`, not `type`" },
    schema: [],
    messages: {
      kind: "Tag this union with `kind` instead of `type`, as the rest of the code (and the state machines library) does. Rename the field in every member and where it's read.",
    },
  },
  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        if (node.typeAnnotation.type !== "TSUnionType") return;
        for (const member of node.typeAnnotation.types) {
          const tag = typeTag(member);
          if (tag) context.report({ node: tag.key, messageId: "kind" });
        }
      },
    };
  },
};
