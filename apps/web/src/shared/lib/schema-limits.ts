import { z } from 'zod';

export interface NumberLimits {
  integer: boolean;
  maximum: number | null;
  minimum: number | null;
}

type JsonSchemaNode = z.core.JSONSchema.JSONSchema;

function numberNodeOf(root: JsonSchemaNode): JsonSchemaNode {
  const branches = (root.anyOf ?? [root]).filter((branch) => branch.type !== 'null');
  const [node] = branches;

  if (branches.length !== 1 || (node?.type !== 'number' && node?.type !== 'integer')) {
    throw new TypeError('Expected one number schema, optionally wrapped in optional, nullable or default.');
  }

  return node;
}

function refuseFractionalExclusiveBound(bound: number): never {
  throw new TypeError(`The exclusive bound ${bound} of a fractional number has no inclusive equivalent.`);
}

function declaredBound(bound: number | undefined): number | null {
  return bound === undefined || Math.abs(bound) >= Number.MAX_SAFE_INTEGER ? null : bound;
}

function inclusiveMinimum(node: JsonSchemaNode, integer: boolean): number | null {
  const { exclusiveMinimum, minimum } = node;

  if (typeof exclusiveMinimum !== 'number') {
    return declaredBound(minimum);
  }

  return integer ? Math.floor(exclusiveMinimum) + 1 : refuseFractionalExclusiveBound(exclusiveMinimum);
}

function inclusiveMaximum(node: JsonSchemaNode, integer: boolean): number | null {
  const { exclusiveMaximum, maximum } = node;

  if (typeof exclusiveMaximum !== 'number') {
    return declaredBound(maximum);
  }

  return integer ? Math.ceil(exclusiveMaximum) - 1 : refuseFractionalExclusiveBound(exclusiveMaximum);
}

export function numberLimitsOf(schema: z.ZodType<number | null | undefined>): NumberLimits {
  const node = numberNodeOf(z.toJSONSchema(schema));
  const integer = node.type === 'integer';

  return { integer, maximum: inclusiveMaximum(node, integer), minimum: inclusiveMinimum(node, integer) };
}
