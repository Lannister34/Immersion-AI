import ts from 'typescript';
import { COMPONENT_KIND } from '../file-roles/role-kinds.mjs';

const PROPS_TYPE_ARGUMENT = new Map([
  ['memo', 0],
  ['forwardRef', 1],
]);
const TYPE_TEXT_LIMIT = 60;

function propsNameFor(componentName) {
  return `${componentName.charAt(0).toUpperCase()}${componentName.slice(1)}Props`;
}

function declaredPropsType(parameter, wrapper) {
  if (parameter.type !== undefined) return parameter.type;
  return wrapper === null ? undefined : wrapper.typeArguments[PROPS_TYPE_ARGUMENT.get(wrapper.name)];
}

function isNamed(type, name) {
  return ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === name;
}

function describeType(type) {
  if (ts.isTypeLiteralNode(type)) return 'an inline object type';
  const text = type.getText().replace(/\s+/g, ' ');
  return text.length > TYPE_TEXT_LIMIT ? `${text.slice(0, TYPE_TEXT_LIMIT - 3)}...` : text;
}

function propsProblem(name, type, typeAliases) {
  if (name === null) return 'an anonymous component takes props; name it, and name its props after it';
  const expected = propsNameFor(name);
  if (type === undefined) return `component ${name} declares no type for its props; declare them as ${expected}`;
  if (!isNamed(type, expected)) {
    return `component ${name} takes its props as ${describeType(type)}; declare them as ${expected}`;
  }
  if (typeAliases.has(expected)) {
    return `component ${name} takes its props as the type alias ${expected}; declare it as an interface`;
  }
  return null;
}

function typeAliasNames(statements) {
  return new Set(statements.filter(ts.isTypeAliasDeclaration).map((statement) => statement.name.text));
}

function isThisParameter(parameter) {
  return ts.isIdentifier(parameter.name) && parameter.name.text === 'this';
}

function componentFindings({ binding, name, wrapper, signatures }, declarations, typeAliases) {
  if (declarations.get(binding)?.kind !== COMPONENT_KIND) return [];
  return signatures.flatMap(({ declaration }) => {
    const props = declaration.parameters.find((parameter) => !isThisParameter(parameter));
    if (props === undefined) return [];
    const message = propsProblem(name, declaredPropsType(props, wrapper), typeAliases);
    return message === null ? [] : [{ node: props, message }];
  });
}

export const componentPropsNameRule = {
  id: 'component-props-name',
  coversTests: true,
  statement:
    'A component takes its props as its first parameter, typed by an interface named after it: Card takes ' +
    'CardProps, and renderCrumb takes RenderCrumbProps. An inline object type, a type of another name, a ' +
    'type alias of the right name declared in the file and a data model passed as the props fail; the data ' +
    'model is a field of the props. A component without parameters passes.',
  find({ source, declarations, functions }) {
    const typeAliases = typeAliasNames(source.statements);
    return functions.flatMap((entry) => componentFindings(entry, declarations, typeAliases));
  },
};
