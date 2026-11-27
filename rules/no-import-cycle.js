// Files that import each other in a circle, directly or round several files.
// None of them can then be read or changed alone, and at runtime one of them
// sees the other half-loaded. Most loops are small ones an agent made by
// putting a shared helper beside one of its users.
//
// Read from the TypeScript program typescript-eslint already built, so a run
// costs one walk of the project's imports, done once and shared by every file.
// `import type` and `export type` don't count: they're gone at runtime, and
// Convex's generated api.d.ts type-imports every module that imports it. Nor
// do dynamic `import()`s, which are how a loop is broken on purpose, or
// anything in node_modules, .d.ts files and `_generated` folders.

const graphs = new WeakMap();

function typeOnly(statement) {
  if (statement.importClause) {
    const clause = statement.importClause;
    if (clause.isTypeOnly) return true;
    const elements = clause.namedBindings?.elements;
    return !clause.name && Array.isArray(elements) && elements.length > 0 && elements.every((e) => e.isTypeOnly);
  }
  if (statement.isTypeOnly) return true;
  const elements = statement.exportClause?.elements;
  return Array.isArray(elements) && elements.length > 0 && elements.every((e) => e.isTypeOnly);
}

function counted(fileName) {
  return !/[\\/]node_modules[\\/]|\.d\.[cm]?ts$|[\\/]_generated[\\/]/.test(fileName);
}

function resolve(program, sourceFile, specifier) {
  const found = program.getResolvedModuleFromModuleSpecifier?.(specifier, sourceFile)?.resolvedModule;
  if (!found || found.isExternalLibraryImport || !counted(found.resolvedFileName)) return null;
  return found.resolvedFileName;
}

// Each file's runtime imports, and which loop (strongly connected set) it's in.
function graphOf(program) {
  let graph = graphs.get(program);
  if (graph) return graph;
  const edges = new Map();
  for (const sourceFile of program.getSourceFiles()) {
    if (!counted(sourceFile.fileName)) continue;
    const to = new Set();
    for (const statement of sourceFile.statements) {
      const specifier = statement.moduleSpecifier;
      if (!specifier || typeof specifier.text !== "string" || typeOnly(statement)) continue;
      const target = resolve(program, sourceFile, specifier);
      if (target && target !== sourceFile.fileName) to.add(target);
    }
    edges.set(sourceFile.fileName, to);
  }
  // Tarjan's strongly connected components, iterative so a long chain
  // can't overflow the stack.
  const index = new Map();
  const low = new Map();
  const loopOf = new Map();
  const stack = [];
  const onStack = new Set();
  let next = 0;
  for (const start of edges.keys()) {
    if (index.has(start)) continue;
    const work = [[start, [...(edges.get(start) ?? [])], 0]];
    index.set(start, next);
    low.set(start, next++);
    stack.push(start);
    onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const [node, targets] = frame;
      if (frame[2] < targets.length) {
        const target = targets[frame[2]++];
        if (!edges.has(target)) continue;
        if (!index.has(target)) {
          index.set(target, next);
          low.set(target, next++);
          stack.push(target);
          onStack.add(target);
          work.push([target, [...edges.get(target)], 0]);
        } else if (onStack.has(target)) {
          low.set(node, Math.min(low.get(node), index.get(target)));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
      if (low.get(node) === index.get(node)) {
        const members = new Set();
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          members.add(member);
        } while (member !== node);
        if (members.size > 1) for (const m of members) loopOf.set(m, members);
      }
    }
  }
  graph = { edges, loopOf };
  graphs.set(program, graph);
  return graph;
}

// The shortest way back from `from` to `to` inside their loop.
function wayBack(graph, loop, from, to) {
  const previous = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift();
    if (node === to) break;
    for (const next of graph.edges.get(node) ?? []) {
      if (!loop.has(next) || previous.has(next)) continue;
      previous.set(next, node);
      queue.push(next);
    }
  }
  const path = [];
  for (let node = to; node; node = previous.get(node)) path.unshift(node);
  return path;
}

function shortName(fileName, root) {
  const relative = root && fileName.startsWith(root) ? fileName.slice(root.length).replace(/^[\\/]/, "") : fileName;
  return relative.replace(/\\/g, "/");
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Disallow files that import each other in a circle" },
    schema: [],
    messages: {
      cycle:
        "This import closes a loop: {{path}}. Files in a loop can't be read or changed alone, and at runtime one sees the other half-loaded. Make the imports run one way: move what both sides share into a file of its own, or pass one side a callback. Don't hide it behind `import type` or a dynamic import unless that's what the code really needs.",
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    const program = services?.program;
    if (!program) return {};
    const fileName = program.getSourceFile(context.filename)?.fileName;
    if (!fileName) return {};
    const graph = graphOf(program);
    const loop = graph.loopOf.get(fileName);
    if (!loop) return {};
    const sourceFile = program.getSourceFile(fileName);
    // Paths in the message are from the project's tsconfig, wherever lint runs.
    const config = program.getCompilerOptions().configFilePath;
    const root = typeof config === "string" ? config.replace(/[\\/][^\\/]*$/, "") : context.cwd;
    function check(node) {
      if (!node.source || node.importKind === "type" || node.exportKind === "type") return;
      const statement = services.esTreeNodeToTSNodeMap?.get(node);
      if (!statement || typeOnly(statement)) return;
      const target = resolve(program, sourceFile, statement.moduleSpecifier);
      if (!target || !loop.has(target)) return;
      const path = wayBack(graph, loop, target, fileName);
      const shown = [fileName, ...path].map((f) => shortName(f, root)).join(" → ");
      context.report({ node: node.source, messageId: "cycle", data: { path: shown } });
    }
    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check };
  },
};
