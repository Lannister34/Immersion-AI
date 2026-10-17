import ts from 'typescript';
import { hasModifier } from '../ast/has-modifier.mjs';
import { unwrapExpression } from '../ast/unwrap-expression.mjs';
import { DEFAULT_EXPORT_NAME } from '../file-roles/declaration-kinds.mjs';
import { COMPONENT_KIND } from '../file-roles/role-kinds.mjs';
import { functionValueOf } from './function-value.mjs';

const CLASS_KINDS = new Set(['class', 'error']);

function memberName(name) {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)
    ? name.text
    : name.getText();
}

function isPublic(member) {
  if (member.name !== undefined && ts.isPrivateIdentifier(member.name)) return false;
  return !hasModifier(member, ts.SyntaxKind.PrivateKeyword) && !hasModifier(member, ts.SyntaxKind.ProtectedKeyword);
}

function functionFindings({ binding, name, declaredType, wrapper, signatures }, declarations) {
  const declaration = declarations.get(binding);
  if (!declaration?.exported || declaration.kind === COMPONENT_KIND) return [];
  if (wrapper !== null || declaredType !== undefined) return [];
  return signatures
    .filter((signature) => signature.declaration.type === undefined)
    .map(({ anchor }) => ({
      node: anchor,
      message: `exported ${declaration.kind} ${name ?? DEFAULT_EXPORT_NAME} declares no return type`,
    }));
}

function classesOf(statements) {
  const classes = [];
  for (const statement of statements) {
    if (ts.isClassDeclaration(statement)) {
      classes.push({ binding: statement.name?.text ?? DEFAULT_EXPORT_NAME, node: statement });
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const value = declaration.initializer && unwrapExpression(declaration.initializer).value;
        if (ts.isIdentifier(declaration.name) && value && ts.isClassExpression(value)) {
          classes.push({ binding: declaration.name.text, node: value });
        }
      }
    } else if (ts.isExportAssignment(statement)) {
      const { value } = unwrapExpression(statement.expression);
      if (ts.isClassExpression(value)) classes.push({ binding: DEFAULT_EXPORT_NAME, node: value });
    }
  }
  return classes;
}

function methodGroups(members) {
  const groups = new Map();
  for (const member of members.filter(ts.isMethodDeclaration)) {
    const key = `${hasModifier(member, ts.SyntaxKind.StaticKeyword) ? 'static ' : ''}${memberName(member.name)}`;
    const group = groups.get(key) ?? { overloads: [], implementations: [] };
    (member.body ? group.implementations : group.overloads).push(member);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap(({ overloads, implementations }) =>
    overloads.length > 0 ? overloads : implementations,
  );
}

function propertyDeclaresNoReturnType(property) {
  if (property.type !== undefined || property.initializer === undefined) return false;
  const value = functionValueOf(property.initializer);
  return (
    value !== null && value.wrapper === null && value.assertedType === undefined && value.literal.type === undefined
  );
}

function memberFindings(classNode, className) {
  const members = classNode.members.filter(isPublic);
  const untyped = [
    ...methodGroups(members)
      .filter((method) => method.type === undefined)
      .map((method) => ({ member: method, what: 'method' })),
    ...members
      .filter((member) => ts.isGetAccessorDeclaration(member) && member.type === undefined)
      .map((getter) => ({ member: getter, what: 'getter' })),
    ...members
      .filter((member) => ts.isPropertyDeclaration(member) && propertyDeclaresNoReturnType(member))
      .map((property) => ({ member: property, what: 'function property' })),
  ];
  return untyped.map(({ member, what }) => ({
    node: member.name,
    message: `public ${what} ${className}.${memberName(member.name)} of an exported class declares no return type`,
  }));
}

function classFindings({ binding, node }, declarations) {
  const declaration = declarations.get(binding);
  if (!declaration?.exported || !CLASS_KINDS.has(declaration.kind)) return [];
  return memberFindings(node, binding);
}

export const explicitReturnTypeRule = {
  id: 'explicit-return-type',
  coversTests: false,
  statement:
    'Every exported function and every public method of an exported class declares its return type: a ' +
    'function declaration, or an arrow function or function expression bound to an exported name, and a ' +
    'public method, getter or function-valued property. A React component is exempt; a hook is not. A type ' +
    'annotation or an as assertion on the exported binding declares it too; satisfies does not.',
  find({ source, declarations, functions }) {
    return [
      ...functions.flatMap((entry) => functionFindings(entry, declarations)),
      ...classesOf(source.statements).flatMap((entry) => classFindings(entry, declarations)),
    ];
  },
};
