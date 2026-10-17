import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findSignatureViolations } from '../src/signatures/find-signature-violations.mjs';
import { signatureScopeOf } from '../src/signatures/signature-scope.mjs';

function violationsOf(file, lines, scope = 'source') {
  return findSignatureViolations(file, lines.join('\n'), scope).map(
    ({ line, rule, message }) => `${line} ${rule}: ${message}`,
  );
}

function returnTypeViolation(line, what) {
  return `${line} explicit-return-type: ${what} declares no return type`;
}

describe('the explicit-return-type rule', () => {
  it('requires a return type on an exported function declaration, arrow function or function expression', () => {
    assert.deepEqual(
      violationsOf('format.ts', [
        'export function typed(): number { return 1; }',
        'export function untyped() { return 1; }',
        'export const arrow = () => 1;',
        'export const typedArrow = (): number => 1;',
        'export const expression = function () { return 1; };',
        'export const namedExpression = function inner(): number { return 1; };',
        'export let reassignable = (value: string) => value;',
        'export const value = 1;',
        'export const called = makeHandler();',
        'export const { destructured } = { destructured: () => 1 };',
        'export const wrapped = memo((value: number) => value);',
      ]),
      [
        returnTypeViolation(2, 'exported function untyped'),
        returnTypeViolation(3, 'exported function arrow'),
        returnTypeViolation(5, 'exported function expression'),
        returnTypeViolation(7, 'exported function reassignable'),
      ],
    );
  });

  it('leaves a function that is not exported to inference', () => {
    assert.deepEqual(
      violationsOf('format.ts', [
        'function helper() { return 1; }',
        'const arrow = () => helper();',
        'export function format(): number { return arrow(); }',
      ]),
      [],
    );
  });

  it('takes an export list, a renamed export and a default export of a name as exports, and a re-export as none', () => {
    assert.deepEqual(
      violationsOf('surface.ts', [
        'function listed() { return 1; }',
        'function renamed() { return 1; }',
        'function byDefault() { return 1; }',
        'const typedListed = (): number => 1;',
        'function hidden() { return hidden; }',
        'export { listed, renamed as publicName, typedListed };',
        'export default byDefault;',
        "export { elsewhere } from './elsewhere';",
        "export * from './everything';",
        "export * as grouped from './grouped';",
      ]),
      [
        returnTypeViolation(1, 'exported function listed'),
        returnTypeViolation(2, 'exported function renamed'),
        returnTypeViolation(3, 'exported function byDefault'),
      ],
    );
  });

  it('reads a type-only export as exporting the type alone, so a value of the same name stays private', () => {
    assert.deepEqual(
      violationsOf('parse.ts', [
        'const parse = () => 1;',
        'type parse = number;',
        'export type { parse };',
        'const format = () => "";',
        'type format = string;',
        'export { type format };',
        'const both = () => 1;',
        'type both = number;',
        'export { both };',
      ]),
      [returnTypeViolation(7, 'exported function both')],
    );
  });

  it('checks a default-exported function declaration, named or anonymous, and a default-exported arrow', () => {
    assert.deepEqual(violationsOf('a.ts', ['export default function () { return 1; }']), [
      returnTypeViolation(1, 'exported function default'),
    ]);
    assert.deepEqual(violationsOf('b.ts', ['export default function load() { return 1; }']), [
      returnTypeViolation(1, 'exported function load'),
    ]);
    assert.deepEqual(violationsOf('c.ts', ['export default (value: string) => value;']), [
      returnTypeViolation(1, 'exported function default'),
    ]);
    assert.deepEqual(violationsOf('d.ts', ['export default (value: string): string => value;']), []);
    assert.deepEqual(violationsOf('e.ts', ['export default function load(): number { return 1; }']), []);
    assert.deepEqual(violationsOf('f.ts', ['export = (value: string) => value;']), [
      returnTypeViolation(1, 'exported function default'),
    ]);
  });

  it('reads the overload signatures of an overloaded function and leaves its implementation signature alone', () => {
    assert.deepEqual(
      violationsOf('parse.ts', [
        'export function parse(value: string): number;',
        'export function parse(value: number): number;',
        'export function parse(value: string | number) { return Number(value); }',
        'export function format(value: string): string;',
        'export function format(value: number);',
        'export function format(value: unknown) { return String(value); }',
      ]),
      [returnTypeViolation(5, 'exported function format')],
    );
  });

  it('asks an async function or a generator for its Promise or Generator type like any other', () => {
    assert.deepEqual(
      violationsOf('load.ts', [
        'export async function load() { return 1; }',
        'export async function loadTyped(): Promise<number> { return 1; }',
        'export const fetchAll = async () => [];',
        'export const fetchTyped = async (): Promise<string[]> => [];',
        'export function* ids() { yield 1; }',
        'export function* typedIds(): Generator<number> { yield 1; }',
      ]),
      [
        returnTypeViolation(1, 'exported function load'),
        returnTypeViolation(3, 'exported function fetchAll'),
        returnTypeViolation(5, 'exported function ids'),
      ],
    );
  });

  it('takes a type annotation or an as assertion on the binding as declared, but not satisfies, which keeps the inferred type', () => {
    assert.deepEqual(
      violationsOf('handler.ts', [
        'type Handler = (input: string) => number;',
        'export const satisfied = ((input: string) => input.length) satisfies Handler;',
        'export const asserted = ((input: string) => input.length) as Handler;',
        'export const annotated: Handler = (input) => input.length;',
        'export const satisfiedTyped = ((input: string): number => input.length) satisfies Handler;',
      ]),
      [returnTypeViolation(2, 'exported function satisfied')],
    );
  });

  it('exempts a component, and only a component: a hook and a PascalCase function outside JSX need a return type', () => {
    assert.deepEqual(
      violationsOf('screen.tsx', [
        "import { forwardRef, memo } from 'react';",
        'export function useCount() { return 1; }',
        "export const useLabel = () => 'label';",
        'export function Card() { return <div />; }',
        'export const Badge = () => <span />;',
        'export function renderRow() { return <li />; }',
        'export function List<T>({ items }: ListProps<T>) { return <ul>{items.length}</ul>; }',
        'export const Memoized = memo(() => <div />);',
        'export const Forwarded = forwardRef<HTMLInputElement, ForwardedProps>((props, ref) => <input ref={ref} />);',
        "export function formatLabel() { return 'x'; }",
      ]),
      [
        returnTypeViolation(2, 'exported hook useCount'),
        returnTypeViolation(3, 'exported hook useLabel'),
        returnTypeViolation(10, 'exported function formatLabel'),
      ],
    );
    assert.deepEqual(violationsOf('card.ts', ['export function Card() { return 1; }']), [
      returnTypeViolation(1, 'exported function Card'),
    ]);
  });

  it('requires a return type on the public methods, getters and function properties of an exported class', () => {
    assert.deepEqual(
      violationsOf('store.ts', [
        'export class Store {',
        '  constructor(private readonly path: string) {}',
        '  read() { return 1; }',
        '  write(): void {}',
        "  static create() { return new Store(''); }",
        '  private hidden() { return 1; }',
        '  protected guarded() { return 1; }',
        '  #secret() { return 1; }',
        '  get size() { return 1; }',
        '  get typedSize(): number { return 1; }',
        '  set size(value: number) {}',
        '  handle = () => 1;',
        '  typedHandle = (): number => 1;',
        '  annotatedHandle: () => number = () => 1;',
        '  assertedHandle = (() => 1) as () => number;',
        '  wrappedHandle = memo((value: number) => value);',
        '  private hiddenHandle = () => 1;',
        '  #secretHandle = () => 1;',
        '  count = 0;',
        '  load(value: string): number;',
        '  load(value: number): number;',
        '  load(value: unknown) { return Number(value); }',
        '  static parse(text: string): number;',
        '  static parse(text: unknown) { return Number(text); }',
        '  parse() { return 1; }',
        '  override toString() { return this.path; }',
        "  'quoted'(value: number): number;",
        '  quoted(value: unknown) { return Number(value); }',
        "  'spaced name'() { return 1; }",
        '}',
      ]),
      [
        returnTypeViolation(3, 'public method Store.read of an exported class'),
        returnTypeViolation(5, 'public method Store.create of an exported class'),
        returnTypeViolation(9, 'public getter Store.size of an exported class'),
        returnTypeViolation(12, 'public function property Store.handle of an exported class'),
        returnTypeViolation(25, 'public method Store.parse of an exported class'),
        returnTypeViolation(26, 'public method Store.toString of an exported class'),
        returnTypeViolation(29, 'public method Store.spaced name of an exported class'),
      ],
    );
  });

  it('checks every exported class however it is exported, an error class too, and no private one', () => {
    assert.deepEqual(
      violationsOf('classes.ts', [
        'class Private { read() { return 1; } }',
        'class Listed { read() { return 1; } }',
        'export { Listed };',
        "export class AppError extends Error { describe() { return 'x'; } }",
        'export const Expression = class { run() { return 1; } };',
        'export abstract class Base { abstract run(); abstract typed(): number; }',
        'export class Merged { read() { return 1; } }',
        'export interface Merged { extra: number }',
        'export const Renamed = class Inner { run() { return 1; } };',
      ]),
      [
        returnTypeViolation(2, 'public method Listed.read of an exported class'),
        returnTypeViolation(4, 'public method AppError.describe of an exported class'),
        returnTypeViolation(5, 'public method Expression.run of an exported class'),
        returnTypeViolation(6, 'public method Base.run of an exported class'),
        returnTypeViolation(7, 'public method Merged.read of an exported class'),
        returnTypeViolation(9, 'public method Renamed.run of an exported class'),
      ],
    );
    assert.deepEqual(violationsOf('default.ts', ['export default class { run() { return 1; } }']), [
      returnTypeViolation(1, 'public method default.run of an exported class'),
    ]);
    assert.deepEqual(violationsOf('expression.ts', ['export default (class { run() { return 1; } });']), [
      returnTypeViolation(1, 'public method default.run of an exported class'),
    ]);
  });

  it('leaves ambient declarations, which declare nothing, to the type checker', () => {
    assert.deepEqual(
      violationsOf('ambient.ts', [
        'export declare function ambient(value: string);',
        'export declare class Ambient { read(); }',
      ]),
      [],
    );
  });
});

describe('the component-props-name rule', () => {
  function propsViolation(line, message) {
    return `${line} component-props-name: ${message}`;
  }

  it('wants the props of every component, exported or private, typed by a name that is its own plus Props', () => {
    assert.deepEqual(
      violationsOf('cards.tsx', [
        'interface CardProps { title: string }',
        'export function Card({ title }: CardProps) { return <h1>{title}</h1>; }',
        'export function Inline({ title }: { title: string }) { return <h1>{title}</h1>; }',
        'export function Misnamed(props: CardProps) { return <div>{props.title}</div>; }',
        'export function Plain() { return <div />; }',
        'function renderCrumb(crumb: Crumb) { return <li>{crumb.label}</li>; }',
        'const Row = ({ id }: RowProps) => <tr id={id} />;',
        'const Cell = (props: Readonly<CellProps>) => <td>{props.text}</td>;',
        'function Untyped(props) { return <div>{props}</div>; }',
        'export function List<T>({ items }: ListProps<T>) { return <ul>{items.length}</ul>; }',
        'export function Qualified(props: Types.QualifiedProps) { return <div>{props}</div>; }',
        'export function Joined(props: JoinedProps & { extra: string }) { return <div>{props}</div>; }',
      ]),
      [
        propsViolation(3, 'component Inline takes its props as an inline object type; declare them as InlineProps'),
        propsViolation(4, 'component Misnamed takes its props as CardProps; declare them as MisnamedProps'),
        propsViolation(6, 'component renderCrumb takes its props as Crumb; declare them as RenderCrumbProps'),
        propsViolation(8, 'component Cell takes its props as Readonly<CellProps>; declare them as CellProps'),
        propsViolation(9, 'component Untyped declares no type for its props; declare them as UntypedProps'),
        propsViolation(
          11,
          'component Qualified takes its props as Types.QualifiedProps; declare them as QualifiedProps',
        ),
        propsViolation(
          12,
          'component Joined takes its props as JoinedProps & { extra: string }; declare them as JoinedProps',
        ),
      ],
    );
  });

  it('wants a props type declared in the file to be an interface, not a type alias of the right name', () => {
    assert.deepEqual(
      violationsOf('cards.tsx', [
        "import type { ImportedProps } from './imported';",
        'interface CardProps { title: string }',
        'type BadgeProps = { label: string };',
        'export type ListProps<T> = { items: T[] };',
        'type Other = CardProps;',
        'export function Card({ title }: CardProps) { return <h1>{title}</h1>; }',
        'export function Badge({ label }: BadgeProps) { return <span>{label}</span>; }',
        'export function List<T>({ items }: ListProps<T>) { return <ul>{items.length}</ul>; }',
        'export function Imported(props: ImportedProps) { return <div>{props}</div>; }',
      ]),
      [
        propsViolation(7, 'component Badge takes its props as the type alias BadgeProps; declare it as an interface'),
        propsViolation(8, 'component List takes its props as the type alias ListProps; declare it as an interface'),
      ],
    );
  });

  it('reads the props type of a memo or forwardRef component from its parameter, or else from its type argument', () => {
    assert.deepEqual(
      violationsOf('fields.tsx', [
        "import { forwardRef, memo } from 'react';",
        'export const Memo = memo((props: MemoProps) => <div>{props.a}</div>);',
        'export const MemoArgument = memo<MemoArgumentProps>((props) => <div>{props.a}</div>);',
        'export const MemoInline = memo((props: { a: string }) => <div>{props.a}</div>);',
        'export const Field = forwardRef<HTMLInputElement, FieldProps>((props, ref) => <input ref={ref} />);',
        'export const FieldOther = forwardRef<HTMLInputElement, InputProps>((props, ref) => <input ref={ref} />);',
        'export const FieldTyped = forwardRef((props: FieldTypedProps, ref: Ref) => <input ref={ref} />);',
        'export const Untyped = memo((props) => <div>{props}</div>);',
        'export const Aliased = memo(Card);',
        'export const Dotted = React.memo((props: { a: string }) => <div>{props.a}</div>);',
        'export const Nested = memo(forwardRef((props: { a: string }, ref) => <input ref={ref} />));',
      ]),
      [
        propsViolation(
          4,
          'component MemoInline takes its props as an inline object type; declare them as MemoInlineProps',
        ),
        propsViolation(6, 'component FieldOther takes its props as InputProps; declare them as FieldOtherProps'),
        propsViolation(8, 'component Untyped declares no type for its props; declare them as UntypedProps'),
        propsViolation(10, 'component Dotted takes its props as an inline object type; declare them as DottedProps'),
      ],
    );
  });

  it('names a default-exported component after its own name, and fails an anonymous one that takes props', () => {
    const anonymous = 'an anonymous component takes props; name it, and name its props after it';

    assert.deepEqual(
      violationsOf('a.tsx', ['export default function Page({ id }: PageProps) { return <p>{id}</p>; }']),
      [],
    );
    assert.deepEqual(violationsOf('b.tsx', ['export default function ({ id }: PageProps) { return <p>{id}</p>; }']), [
      propsViolation(1, anonymous),
    ]);
    assert.deepEqual(violationsOf('c.tsx', ['export default () => <div />;']), []);
    assert.deepEqual(violationsOf('d.tsx', ['export default (props: PageProps) => <p>{props.id}</p>;']), [
      propsViolation(1, anonymous),
    ]);
    assert.deepEqual(
      violationsOf('e.tsx', [
        "import { memo } from 'react';",
        'export default memo(function Named(props: OtherProps) { return <p>{props.id}</p>; });',
      ]),
      [propsViolation(2, 'component Named takes its props as OtherProps; declare them as NamedProps')],
    );
  });

  it('reads the props past a this parameter, which declares the call context and no props', () => {
    assert.deepEqual(
      violationsOf('bound.tsx', [
        'export function Card(this: void, props: CardProps) { return <div>{props.title}</div>; }',
        'export function Inline(this: Window, props: { a: string }) { return <div>{props.a}</div>; }',
        'export function Bare(this: void) { return <div />; }',
      ]),
      [propsViolation(2, 'component Inline takes its props as an inline object type; declare them as InlineProps')],
    );
  });

  it('expects the props of a component named outside ASCII after its name, and truncates a long type', () => {
    assert.deepEqual(
      violationsOf('карточка.tsx', [
        'export function Карточка({ title }: КарточкаProps) { return <h1>{title}</h1>; }',
        'export function Шапка({ title }: Карточка) { return <h1>{title}</h1>; }',
        'export function Long(props: VeryLongPropsName & AnotherVeryLongPropsName & YetAnotherLongPropsName) {',
        '  return <div>{props}</div>;',
        '}',
      ]),
      [
        propsViolation(2, 'component Шапка takes its props as Карточка; declare them as ШапкаProps'),
        propsViolation(
          3,
          'component Long takes its props as VeryLongPropsName & AnotherVeryLongPropsName & YetAnother...; ' +
            'declare them as LongProps',
        ),
      ],
    );
  });
});

describe('the signature rules', () => {
  it('apply only the component-props-name rule to a test file', () => {
    const lines = [
      'export function helper() { return 1; }',
      'function Harness({ children }: { children: ReactNode }) { return <div>{children}</div>; }',
      'function Wrapper({ children }: WrapperProps) { return <div>{children}</div>; }',
    ];

    assert.deepEqual(violationsOf('screen.test.tsx', lines, 'test'), [
      '2 component-props-name: component Harness takes its props as an inline object type; declare them as HarnessProps',
    ]);
    assert.equal(violationsOf('screen.tsx', lines).length, 2);
  });

  it('report each violation at its line and column, in source order', () => {
    const violations = findSignatureViolations(
      'mixed.tsx',
      ['export class Store { read() { return 1; } }', 'export function Card(props: Shape) { return <div />; }'].join(
        '\n',
      ),
      'source',
    );

    assert.deepEqual(
      violations.map(({ line, column, rule }) => `${line}:${column} ${rule}`),
      ['1:22 explicit-return-type', '2:22 component-props-name'],
    );
  });

  it('parse a .tsx file as TSX, so JSX text that TypeScript would read as a template literal hides nothing', () => {
    assert.deepEqual(
      violationsOf('hint.tsx', [
        'export function Hint() { return <p>Press ` to open the console</p>; }',
        'export function format(value: number) { return String(value); }',
      ]),
      [returnTypeViolation(2, 'exported function format')],
    );
  });

  it('read what the parser recovers from a source that does not parse, without throwing', () => {
    assert.deepEqual(violationsOf('broken.ts', ['export function broken( { return 1;', 'export const ok = (']), []);
    assert.deepEqual(violationsOf('broken.tsx', ['export function Card(props: { a: string }) { return <div>;']), [
      '1 component-props-name: component Card takes its props as an inline object type; declare them as CardProps',
    ]);
  });
});

describe('the signature scope', () => {
  it('gates TypeScript sources under apps/*/src, the web dev server, the web smoke helpers and packages/*/src', () => {
    for (const file of [
      'apps/api/src/app.ts',
      'apps/api/src/test-support/harness.ts',
      'apps/web/src/modules/chats/screen.tsx',
      'apps/web/dev-server/refuse-cross-site-editor-launch.ts',
      'apps/web/tests/smoke-data-root.ts',
      'packages/contracts/src/common/file-id.ts',
      'apps/api/src/modules/providers/application/test-provider-connection.ts',
      'apps/api/src/клиент.ts',
    ]) {
      assert.equal(signatureScopeOf(file), 'source', file);
    }
  });

  it('gates a test only for its components, and leaves out specs, declarations, JavaScript and other folders', () => {
    for (const file of [
      'apps/api/src/app.test.ts',
      'apps/web/src/shared/ui/avatar.test.tsx',
      'apps/web/tests/smoke-data-root.test.ts',
      'apps/web/dev-server/dev-server-boundary.test.ts',
    ]) {
      assert.equal(signatureScopeOf(file), 'test', file);
    }
    for (const file of [
      'apps/web/tests/smoke.spec.ts',
      'apps/web/src/screen.spec.tsx',
      'apps/api/src/ambient.d.ts',
      'apps/api/src/check.mts',
      'apps/web/src/legacy.jsx',
      'packages/tooling/src/signatures/check-signatures.mjs',
      'packages/tooling/test/fixture.ts',
      'apps/api/tests/app.ts',
      'apps/web/vite.config.ts',
      'scripts/apps/api/src/app.ts',
      'apps/api/app.ts',
      'apps/api/src/app.json',
    ]) {
      assert.equal(signatureScopeOf(file), null, file);
    }
  });
});
