import ts from 'typescript';
import { unwrapExpression } from '../ast/unwrap-expression.mjs';
import { readComponentWrapper } from '../file-roles/component-wrapper.mjs';

export function functionValueOf(expression) {
  const { value, assertedType } = unwrapExpression(expression);
  if (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
    return { literal: value, wrapper: null, assertedType };
  const wrapper = ts.isCallExpression(value) ? readComponentWrapper(value) : null;
  if (wrapper === null || wrapper.body === null) return null;
  return { literal: wrapper.body, wrapper, assertedType };
}
