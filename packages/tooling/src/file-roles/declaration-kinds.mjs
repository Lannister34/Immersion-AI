import ts from 'typescript';
import { TYPE_KIND } from './role-kinds.mjs';

const ZOD_MODULE = /^zod(?:\/|$)/;
const HOOK_NAME = /^use[A-Z0-9]/;
const COMPONENT_NAME = /^[A-Z]/;
const SCHEMA_NAME = /Schema$/;
const IMPORTED_SCHEMA_NAME = /^[A-Z]\w*Schema$/;
const ERROR_NAME = /Error$/;
const JSX_FILE = /\.[jt]sx$/;
const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef']);
const LOGICAL_OPERATORS = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);
const VALUE_METHODS = new Set([
  'config',
  'decode',
  'decodeAsync',
  'encode',
  'encodeAsync',
  'flattenError',
  'formatError',
  'isNullable',
  'isOptional',
  'parse',
  'parseAsync',
  'prettifyError',
  'registry',
  'safeDecode',
  'safeDecodeAsync',
  'safeEncode',
  'safeEncodeAsync',
  'safeParse',
  'safeParseAsync',
  'spa',
  'toJSONSchema',
  'treeifyError',
]);
const VALUE_METHODS_WITHOUT_ARGUMENTS = new Set(['meta']);
const DATA_PROPERTIES = new Set([
  '_def',
  '_zod',
  '~standard',
  'def',
  'description',
  'enum',
  'format',
  'globalRegistry',
  'isFinite',
  'isInt',
  'locales',
  'maxDate',
  'maxLength',
  'maxValue',
  'minDate',
  'minLength',
  'minValue',
  'NEVER',
  'options',
  'regexes',
  'TimePrecision',
  'type',
  'util',
  'value',
  'values',
  'ZodFirstPartyTypeKind',
  'ZodIssueCode',
]);

function scriptKindOf(fileName) {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return /\.[cm]?js$/.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function unwrap(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function calleeName(callee) {
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

function isValueCall(call, callee) {
  const name = calleeName(callee);
  return VALUE_METHODS.has(name) || (call.arguments.length === 0 && VALUE_METHODS_WITHOUT_ARGUMENTS.has(name));
}

function readsValue(member) {
  return DATA_PROPERTIES.has(member) || VALUE_METHODS.has(member) || VALUE_METHODS_WITHOUT_ARGUMENTS.has(member);
}

function isDataRead(access) {
  if (ts.isPropertyAccessExpression(access)) return readsValue(access.name.text);
  return ts.isStringLiteralLike(access.argumentExpression) && readsValue(access.argumentExpression.text);
}

function chainRoot(expression) {
  let current = unwrap(expression);
  let producesValue = false;
  for (;;) {
    if (ts.isCallExpression(current)) {
      const callee = unwrap(current.expression);
      producesValue ||= isValueCall(current, callee);
      current = ts.isPropertyAccessExpression(callee) ? unwrap(callee.expression) : callee;
    } else if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      producesValue ||= isDataRead(current);
      current = unwrap(current.expression);
    } else {
      return { root: ts.isIdentifier(current) ? current.text : null, producesValue };
    }
  }
}

function isSchemaExpression(expression, schemaRoots) {
  const value = unwrap(expression);
  if (ts.isConditionalExpression(value)) {
    return isSchemaExpression(value.whenTrue, schemaRoots) || isSchemaExpression(value.whenFalse, schemaRoots);
  }
  if (ts.isBinaryExpression(value) && LOGICAL_OPERATORS.has(value.operatorToken.kind)) {
    return isSchemaExpression(value.left, schemaRoots) || isSchemaExpression(value.right, schemaRoots);
  }
  const { root, producesValue } = chainRoot(value);
  return root !== null && !producesValue && schemaRoots.has(root);
}

function containsJsx(node) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true;
  return ts.forEachChild(node, containsJsx) ?? false;
}

function hasModifier(node, kind) {
  return ts.getModifiers?.(node)?.some((modifier) => modifier.kind === kind) ?? false;
}

function importedValueBindings(source) {
  const zod = new Set();
  const all = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    const names = [];
    if (clause.name) names.push(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) names.push(bindings.name.text);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (!element.isTypeOnly) names.push(element.name.text);
      }
    }
    for (const name of names) all.add(name);
    if (ZOD_MODULE.test(statement.moduleSpecifier.text)) {
      for (const name of names) zod.add(name);
    }
  }
  return { zod, all };
}

function boundNames(name) {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : boundNames(element.name)));
}

function classKind(node) {
  const base = node.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
  const baseName = base ? calleeName(unwrap(base.expression)) : null;
  return baseName !== null && ERROR_NAME.test(baseName) ? 'error' : 'class';
}

function functionKind(name, node, jsx) {
  if (HOOK_NAME.test(name)) return 'hook';
  if (jsx && (COMPONENT_NAME.test(name) || containsJsx(node))) return 'component';
  return 'function';
}

function componentWrapperKind(expression) {
  const wrapped = expression.arguments[0] ? unwrap(expression.arguments[0]) : null;
  const declaresBody = wrapped !== null && (ts.isArrowFunction(wrapped) || ts.isFunctionExpression(wrapped));
  return declaresBody ? 'component' : 'constant';
}

function variableKind(name, initializer, context) {
  if (HOOK_NAME.test(name)) return 'hook';
  if (!initializer) return 'constant';
  const value = unwrap(initializer);
  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return functionKind(name, value, context.jsx);
  if (ts.isClassExpression(value)) return classKind(value);
  if (context.jsx && ts.isCallExpression(value) && COMPONENT_WRAPPERS.has(calleeName(unwrap(value.expression)))) {
    return componentWrapperKind(value);
  }
  if (SCHEMA_NAME.test(name) || isSchemaExpression(value, context.schemaRoots)) return 'schema';
  return 'constant';
}

function isNameOfItsParent(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  if ('propertyName' in parent && parent.propertyName === node) return true;
  return 'name' in parent && parent.name === node && !ts.isShorthandPropertyAssignment(parent);
}

function referencedNames(nodes, topLevelNames) {
  const found = new Set();
  const visit = (child) => {
    if (ts.isIdentifier(child) && topLevelNames.has(child.text) && !isNameOfItsParent(child)) found.add(child.text);
    ts.forEachChild(child, visit);
  };
  for (const node of nodes) ts.forEachChild(node, visit);
  return found;
}

function collectSchemaRoots(statements, imported) {
  const roots = new Set(imported.zod);
  for (const name of imported.all) {
    if (IMPORTED_SCHEMA_NAME.test(name)) roots.add(name);
  }
  const variables = statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => statement.declarationList.declarations)
    .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.initializer);
  for (const declaration of variables) {
    const name = declaration.name.text;
    if (SCHEMA_NAME.test(name) || isSchemaExpression(declaration.initializer, roots)) roots.add(name);
  }
  return roots;
}

function declaredName(statement) {
  return statement.name?.text ?? 'default';
}

function overloadSignatures(statements) {
  const signatures = new Map();
  for (const statement of statements) {
    if (!ts.isFunctionDeclaration(statement) || statement.body) continue;
    const name = declaredName(statement);
    signatures.set(name, [...(signatures.get(name) ?? []), statement]);
  }
  return signatures;
}

function declarationsOf(statement, context) {
  const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
  const ambientValue =
    (ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isVariableStatement(statement)) &&
    hasModifier(statement, ts.SyntaxKind.DeclareKeyword);
  if (ambientValue) return [];
  if (ts.isClassDeclaration(statement)) {
    return [{ name: declaredName(statement), kind: classKind(statement), exported, nodes: [statement] }];
  }
  if (ts.isFunctionDeclaration(statement)) {
    if (!statement.body) return [];
    const name = declaredName(statement);
    const nodes = [...(context.overloads.get(name) ?? []), statement];
    return [{ name, kind: functionKind(name, statement, context.jsx), exported, nodes }];
  }
  if (
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement)
  ) {
    return [{ name: statement.name.text, kind: TYPE_KIND, exported, nodes: [statement] }];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      boundNames(declaration.name).map((identifier) => ({
        name: identifier.text,
        kind: variableKind(
          identifier.text,
          ts.isIdentifier(declaration.name) ? declaration.initializer : undefined,
          context,
        ),
        exported,
        nodes: [declaration],
      })),
    );
  }
  if (ts.isExportAssignment(statement) && !ts.isIdentifier(unwrap(statement.expression))) {
    return [
      {
        name: 'default',
        kind: variableKind('default', statement.expression, context),
        exported: true,
        nodes: [statement],
      },
    ];
  }
  return [];
}

function locallyExportedNames(statements) {
  const names = new Set();
  for (const statement of statements) {
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) names.add((element.propertyName ?? element.name).text);
      }
    } else if (ts.isExportAssignment(statement)) {
      const expression = unwrap(statement.expression);
      if (ts.isIdentifier(expression)) names.add(expression.text);
    }
  }
  return names;
}

export function classifyDeclarations(fileName, text) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKindOf(fileName));
  const context = {
    jsx: JSX_FILE.test(fileName),
    overloads: overloadSignatures(source.statements),
    schemaRoots: collectSchemaRoots(source.statements, importedValueBindings(source)),
  };
  const declarations = source.statements.flatMap((statement) => declarationsOf(statement, context));
  const exportedNames = locallyExportedNames(source.statements);
  const topLevelNames = new Set(declarations.map(({ name }) => name));

  return declarations.map(({ name, kind, exported, nodes }) => ({
    name,
    kind,
    exported: exported || exportedNames.has(name),
    line: source.getLineAndCharacterOfPosition(nodes[0].getStart(source)).line + 1,
    references: [...referencedNames(nodes, topLevelNames)].filter((reference) => reference !== name).sort(),
  }));
}
