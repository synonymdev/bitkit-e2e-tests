import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type Platform = 'ios' | 'android';
export type Backend = 'local' | 'regtest' | 'mainnet';
export type Disposition = 'required' | 'gap' | 'inapplicable' | 'manual';
export type Assignment = {
  backend: Backend;
  pack: string;
  disposition: Disposition;
  fixtures: string[];
  reason?: string;
  reference?: string;
};
export type InventoryCase = {
  id: string;
  file: string;
  kind: 'test' | 'fixture' | 'utility';
  platforms: Record<Platform, Assignment>;
};
export type Inventory = { schemaVersion: 1; cases: InventoryCase[] };
export type DiscoveredCase = { id: string; file: string; skipped: boolean };

export function caseId(title: string): string {
  const match = /^@([a-z][a-z0-9_]*)(?=[\s,]|$)/.exec(title);
  if (!match) throw new Error(`Test title needs a stable leading case ID: ${title}`);
  return match[1];
}

function uncast(node: ts.Expression): ts.Expression {
  return ts.isAsExpression(node) || ts.isParenthesizedExpression(node)
    ? uncast(node.expression)
    : node;
}

// Only resolve finite source literals; never import specs or execute their hooks during discovery.
function finiteValues(expr: ts.Expression, owner: ts.Node, source: ts.SourceFile): string[] {
  expr = uncast(expr);
  if (ts.isStringLiteral(expr)) return [expr.text];
  if (ts.isIdentifier(expr)) {
    for (let node: ts.Node | undefined = owner.parent; node; node = node.parent) {
      if (!ts.isForOfStatement(node) || !ts.isVariableDeclarationList(node.initializer)) continue;
      if (node.initializer.declarations[0].name.getText(source) !== expr.text) continue;
      const values = uncast(node.expression);
      if (ts.isArrayLiteralExpression(values)) {
        return values.elements.flatMap((value) =>
          finiteValues(value as ts.Expression, node, source)
        );
      }
    }
  }
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    const objectName = expr.expression.text;
    const propertyName = expr.name.text;
    for (let node: ts.Node | undefined = owner.parent; node; node = node.parent) {
      if (!ts.isFunctionDeclaration(node) || !node.name) continue;
      const index = node.parameters.findIndex((p) => p.name.getText(source) === objectName);
      if (index < 0) continue;
      const values: string[] = [];
      const functionName = node.name.text;
      function visit(call: ts.Node) {
        if (ts.isCallExpression(call) && call.expression.getText(source) === functionName) {
          const arg = call.arguments[index];
          if (!arg || !ts.isObjectLiteralExpression(arg)) {
            throw new Error(`Non-literal case factory argument: ${call.getText(source)}`);
          }
          const property = arg.properties.find(
            (p) => ts.isPropertyAssignment(p) && p.name.getText(source) === propertyName
          );
          if (!property || !ts.isPropertyAssignment(property)) {
            throw new Error(`Missing ${propertyName} in case factory ${functionName}`);
          }
          values.push(...finiteValues(property.initializer, call, source));
        }
        ts.forEachChild(call, visit);
      }
      visit(source);
      if (values.length) return values;
    }
  }
  throw new Error(`Cannot discover dynamic case ID: ${expr.getText(source)}`);
}

function titleIds(title: ts.Expression, call: ts.Node, source: ts.SourceFile): string[] {
  if (ts.isStringLiteralLike(title)) return [caseId(title.text)];
  if (!ts.isTemplateExpression(title)) {
    throw new Error(`Cannot discover test title: ${title.getText(source)}`);
  }
  let prefixes = [title.head.text];
  for (const span of title.templateSpans) {
    if (prefixes.every((s) => /^@[a-z][a-z0-9_]*[\s,]/.test(s))) break;
    const values = finiteValues(span.expression, call, source);
    prefixes = prefixes.flatMap((s) => values.map((value) => s + value + span.literal.text));
  }
  return prefixes.map(caseId);
}

function filesIn(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : entry.name.endsWith('.ts') ? [file] : [];
  });
}

export function discoverCases(root: string): DiscoveredCase[] {
  const cases: DiscoveredCase[] = [];
  for (const absolute of filesIn(path.join(root, 'test/specs')).sort()) {
    const file = path.relative(root, absolute).split(path.sep).join('/');
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(absolute, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(source);
        if (/^(?:ciIt|it|test|xit)(?:\.(?:skip|only))?$/.test(name)) {
          if (name.endsWith('.only')) throw new Error(`Focused test is forbidden: ${file}`);
          if (!node.arguments[0]) throw new Error(`Missing test title: ${file}`);
          let skipped = name.endsWith('.skip') || name === 'xit';
          for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
            if (ts.isCallExpression(parent)) {
              const parentName = parent.expression.getText(source);
              if (parentName === 'describe.only')
                throw new Error(`Focused suite is forbidden: ${file}`);
              if (parentName === 'describe.skip' || parentName === 'xdescribe') skipped = true;
            }
          }
          for (const id of titleIds(node.arguments[0], node, source))
            cases.push({ id, file, skipped });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const seen = new Set<string>();
  for (const item of cases) {
    if (seen.has(item.id)) throw new Error(`Duplicate source case ID: ${item.id}`);
    seen.add(item.id);
  }
  return cases;
}

export function loadInventory(root: string): Inventory {
  return JSON.parse(fs.readFileSync(path.join(root, 'test/inventory.json'), 'utf8'));
}

export function validateInventory(root: string, inventory = loadInventory(root)): DiscoveredCase[] {
  if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.cases) || !inventory.cases.length) {
    throw new Error('Invalid or empty inventory');
  }
  const discovered = discoverCases(root);
  const byId = new Map(discovered.map((item) => [item.id, item]));
  const seen = new Set<string>();
  for (const item of inventory.cases) {
    const source = byId.get(item.id);
    if (seen.has(item.id)) throw new Error(`Duplicate inventory case: ${item.id}`);
    seen.add(item.id);
    if (!source || source.file !== item.file)
      throw new Error(`Stale inventory case/file: ${item.id}`);
    if (!['test', 'fixture', 'utility'].includes(item.kind))
      throw new Error(`Invalid kind: ${item.id}`);
    for (const platform of ['ios', 'android'] as const) {
      const entry = item.platforms?.[platform];
      if (
        !entry ||
        !['local', 'regtest', 'mainnet'].includes(entry.backend) ||
        !entry.pack ||
        !['required', 'gap', 'inapplicable', 'manual'].includes(entry.disposition) ||
        !Array.isArray(entry.fixtures) ||
        !entry.fixtures.every((v) => typeof v === 'string')
      ) {
        throw new Error(`Invalid ${platform} assignment: ${item.id}`);
      }
      if (entry.disposition !== 'required' && (!entry.reason || !entry.reference)) {
        throw new Error(`Unexplained ${platform} disposition: ${item.id}`);
      }
      if (source.skipped && entry.disposition === 'required') {
        throw new Error(`Required case is statically skipped: ${platform}/${item.id}`);
      }
    }
  }
  const missing = discovered.filter((item) => !seen.has(item.id));
  if (missing.length)
    throw new Error(`Uninventoried cases: ${missing.map((item) => item.id).join(', ')}`);
  return discovered;
}
