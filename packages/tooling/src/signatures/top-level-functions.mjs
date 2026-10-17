import ts from 'typescript';
import { DEFAULT_EXPORT_NAME } from '../file-roles/declaration-kinds.mjs';
import { functionValueOf } from './function-value.mjs';

function functionDeclarations(statements) {
  const groups = new Map();
  for (const statement of statements.filter(ts.isFunctionDeclaration)) {
    const name = statement.name?.text ?? null;
    const binding = name ?? DEFAULT_EXPORT_NAME;
    const group = groups.get(binding) ?? { binding, name, overloads: [], implementations: [] };
    (statement.body ? group.implementations : group.overloads).push(statement);
    groups.set(binding, group);
  }
  return [...groups.values()].map(({ binding, name, overloads, implementations }) => ({
    binding,
    name,
    declaredType: undefined,
    wrapper: null,
    signatures: (overloads.length > 0 ? overloads : implementations).map((declaration) => ({
      declaration,
      anchor: declaration.name ?? declaration,
    })),
  }));
}

function boundFunction(binding, name, expression, declaredType, anchor) {
  const value = functionValueOf(expression);
  if (value === null) return [];
  return [
    {
      binding,
      name,
      declaredType: declaredType ?? value.assertedType,
      wrapper: value.wrapper,
      signatures: [{ declaration: value.literal, anchor }],
    },
  ];
}

function variableFunctions(statement) {
  return statement.declarationList.declarations.flatMap((declaration) =>
    ts.isIdentifier(declaration.name) && declaration.initializer
      ? boundFunction(
          declaration.name.text,
          declaration.name.text,
          declaration.initializer,
          declaration.type,
          declaration.name,
        )
      : [],
  );
}

function defaultExportedFunction(statement) {
  const value = functionValueOf(statement.expression);
  const name = value?.literal.name?.text ?? null;
  return boundFunction(DEFAULT_EXPORT_NAME, name, statement.expression, undefined, statement);
}

export function listTopLevelFunctions(source) {
  return [
    ...functionDeclarations(source.statements),
    ...source.statements.filter(ts.isVariableStatement).flatMap(variableFunctions),
    ...source.statements.filter(ts.isExportAssignment).flatMap(defaultExportedFunction),
  ];
}
