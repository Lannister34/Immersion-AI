import ts from 'typescript';
import { calleeName } from '../ast/callee-name.mjs';
import { unwrapExpression } from '../ast/unwrap-expression.mjs';

const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef']);

export function readComponentWrapper(call) {
  const name = calleeName(unwrapExpression(call.expression).value);
  if (!COMPONENT_WRAPPERS.has(name)) return null;
  const wrapped = call.arguments[0] === undefined ? null : unwrapExpression(call.arguments[0]).value;
  const declaresBody = wrapped !== null && (ts.isArrowFunction(wrapped) || ts.isFunctionExpression(wrapped));
  return { name, body: declaresBody ? wrapped : null, typeArguments: [...(call.typeArguments ?? [])] };
}
