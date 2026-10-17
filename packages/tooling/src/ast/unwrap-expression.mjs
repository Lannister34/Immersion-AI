import ts from 'typescript';

export function unwrapExpression(expression) {
  let value = expression;
  let assertedType;
  for (;;) {
    if (ts.isParenthesizedExpression(value) || ts.isSatisfiesExpression(value) || ts.isNonNullExpression(value)) {
      value = value.expression;
    } else if (ts.isAsExpression(value) || ts.isTypeAssertionExpression(value)) {
      assertedType ??= value.type;
      value = value.expression;
    } else {
      return { value, assertedType };
    }
  }
}
