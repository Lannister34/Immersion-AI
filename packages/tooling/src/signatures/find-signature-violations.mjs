import ts from 'typescript';
import { classifyDeclarations } from '../file-roles/declaration-kinds.mjs';
import { TYPE_KIND } from '../file-roles/role-kinds.mjs';
import { SIGNATURE_RULES } from './signature-rules.mjs';
import { listTopLevelFunctions } from './top-level-functions.mjs';

const TEST_SCOPE = 'test';

function valueDeclarations(file, text) {
  const values = classifyDeclarations(file, text).filter(({ kind }) => kind !== TYPE_KIND);
  return new Map(values.map((declaration) => [declaration.name, declaration]));
}

function byPosition(left, right) {
  return left.line - right.line || left.column - right.column;
}

export function findSignatureViolations(file, text, scope) {
  const scriptKind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind);
  const context = { source, declarations: valueDeclarations(file, text), functions: listTopLevelFunctions(source) };
  return SIGNATURE_RULES.filter((rule) => scope !== TEST_SCOPE || rule.coversTests)
    .flatMap((rule) =>
      rule.find(context).map(({ node, message }) => {
        const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
        return { rule: rule.id, line: line + 1, column: character + 1, message };
      }),
    )
    .sort(byPosition);
}
