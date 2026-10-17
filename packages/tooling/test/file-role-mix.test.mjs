import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCounts } from '../src/baseline/count-baseline-format.mjs';
import { classifyDeclarations } from '../src/file-roles/declaration-kinds.mjs';
import { roleMix } from '../src/file-roles/role-mix.mjs';

function mixOf(fileName, lines) {
  const mix = roleMix(classifyDeclarations(fileName, lines.join('\n')));
  return mix === null ? null : formatCounts(mix.signature);
}

function kindsOf(fileName, lines) {
  return classifyDeclarations(fileName, lines.join('\n')).map(
    ({ name, kind, exported }) => `${exported ? 'exported ' : ''}${kind} ${name}`,
  );
}

describe('declaration kinds', () => {
  it('reads zod schemas through any import form and derived chains, but not values parsed from them', () => {
    assert.deepEqual(
      kindsOf('format.ts', [
        "import * as zod from 'zod';",
        "import { CharacterIdSchema } from '@immersion/contracts';",
        'const Base = zod.object({ id: CharacterIdSchema });',
        'export const Extended = Base.extend({ name: zod.string() }).strict();',
        'export const Partial = Extended.partial();',
        'export const Picked = CharacterIdSchema.optional();',
        'export const defaults = Base.parse({ id: "a" });',
        'export const checked = Extended.safeParse({}).success;',
        'export const jsonDocument = zod.toJSONSchema(Extended);',
        'export const message = zod.prettifyError(checked);',
        'export const Either = flag ? zod.string() : Picked ?? zod.number();',
      ]),
      [
        'schema Base',
        'exported schema Extended',
        'exported schema Partial',
        'exported schema Picked',
        'exported constant defaults',
        'exported constant checked',
        'exported constant jsonDocument',
        'exported constant message',
        'exported schema Either',
      ],
    );
  });

  it('roots schemas in zod and its subpaths through default and renamed imports, and in no package merely named like zod', () => {
    assert.deepEqual(
      kindsOf('imports.ts', [
        "import { z } from 'zod/v4';",
        "import { object as obj } from 'zod';",
        "import FooSchema from './foo-schema.js';",
        "import { zodToJsonSchema } from 'zod-to-json-schema';",
        "import { form } from '@acme/form-zod';",
        'export const Versioned = z.object({});',
        'export const Renamed = obj({});',
        'export const Optional = FooSchema.optional();',
        'export const document = zodToJsonSchema(Versioned);',
        'export const field = form();',
      ]),
      [
        'exported schema Versioned',
        'exported schema Renamed',
        'exported schema Optional',
        'exported constant document',
        'exported constant field',
      ],
    );
  });

  it('reads a schema through a cast, satisfies, parentheses, a non-null assertion or an angle-bracket assertion, inside a chain too', () => {
    assert.deepEqual(
      kindsOf('casts.ts', [
        "import { z } from 'zod';",
        'export const Cast = z.object({}) as z.ZodType;',
        'export const Satisfied = z.object({}) satisfies z.ZodType;',
        'export const Parenthesized = (z.object({}));',
        'export const Asserted = z.object({})!;',
        'export const Angled = <z.ZodType>z.object({});',
        'export const Extended = (Cast as z.AnyZodObject).extend({});',
        'export const Inner = (Satisfied as z.AnyZodObject).shape.inner;',
      ]),
      [
        'exported schema Cast',
        'exported schema Satisfied',
        'exported schema Parenthesized',
        'exported schema Asserted',
        'exported schema Angled',
        'exported schema Extended',
        'exported schema Inner',
      ],
    );
  });

  it('reads a schema from the branch of a conditional or the side of &&, || or ?? that holds it, and from no other operator', () => {
    assert.deepEqual(
      kindsOf('branches.ts', [
        "import { z } from 'zod';",
        "import { ProfileSchema } from '@immersion/contracts';",
        'export const WhenTrue = flag ? z.string() : fallback;',
        'export const WhenFalse = flag ? fallback : z.number();',
        'export const Override = custom ?? z.string();',
        'export const Profile = ProfileSchema || LegacyProfile;',
        'export const Enabled = flag && z.boolean();',
        'export const isZod = value instanceof z.ZodType;',
      ]),
      [
        'exported schema WhenTrue',
        'exported schema WhenFalse',
        'exported schema Override',
        'exported schema Profile',
        'exported schema Enabled',
        'exported constant isZod',
      ],
    );
  });

  it('reads a variable named …Schema as a schema whatever builds it, a chain derived from it as one too, and no name that only starts with Schema or ends in SCHEMA', () => {
    assert.deepEqual(
      kindsOf('stored.ts', [
        'const StoredSchema = buildStoredSchema();',
        'export const StoredList = StoredSchema.array();',
        'export const SchemaVersion = 3;',
        "export const DB_SCHEMA = 'public';",
      ]),
      [
        'schema StoredSchema',
        'exported schema StoredList',
        'exported constant SchemaVersion',
        'exported constant DB_SCHEMA',
      ],
    );
  });

  it("reads zod's lazy in a .tsx file as a schema, and React's lazy beside it as a constant", () => {
    assert.deepEqual(
      kindsOf('tree.tsx', [
        "import { z } from 'zod';",
        "import { lazy } from 'react';",
        'const TreeSchema = z.lazy(() => z.string());',
        'export const Forest = z.lazy(() => TreeSchema.array());',
        'const Editor = lazy(() => import("./editor.js"));',
      ]),
      ['schema TreeSchema', 'exported schema Forest', 'constant Editor'],
    );
  });

  it('reads data a schema holds as a value, and what is built from that value as a constant', () => {
    assert.deepEqual(
      kindsOf('provider-types.ts', [
        "import { z } from 'zod';",
        "import { ProfileSchema, ProviderTypeSchema } from '@immersion/contracts';",
        'export const PROVIDER_TYPES = ProviderTypeSchema.options;',
        'export const PROVIDER_LABELS = ProviderTypeSchema.options.map((type) => type.toUpperCase());',
        'export const SORTED_TYPES = PROVIDER_TYPES.slice().sort();',
        'export const MAX_NAME_LENGTH = ProfileSchema.shape.name.maxLength;',
        'export const NAME_IS_OPTIONAL = ProfileSchema.shape.name.isOptional();',
        'export const roles = ProviderTypeSchema.enum;',
        'export const about = ProfileSchema.description;',
        "export const standard = ProfileSchema['~standard'];",
        'export const metadata = ProfileSchema.meta();',
        'export const optionalAbout = ProfileSchema.optional().description;',
        'export const emailPattern = z.regexes.email;',
        'export const nameField = ProfileSchema.shape.name;',
        "export const nameByKey = ProfileSchema.shape['name'];",
        'export const Described = ProfileSchema.meta({ title: "profile" });',
        'export const ProviderType = z.enum(ProviderTypeSchema.options);',
        'export const Count = z.coerce.number();',
      ]),
      [
        'exported constant PROVIDER_TYPES',
        'exported constant PROVIDER_LABELS',
        'exported constant SORTED_TYPES',
        'exported constant MAX_NAME_LENGTH',
        'exported constant NAME_IS_OPTIONAL',
        'exported constant roles',
        'exported constant about',
        'exported constant standard',
        'exported constant metadata',
        'exported constant optionalAbout',
        'exported constant emailPattern',
        'exported schema nameField',
        'exported schema nameByKey',
        'exported schema Described',
        'exported schema ProviderType',
        'exported schema Count',
      ],
    );
  });

  it('reads a value method of a schema as a value whether it is called, bound or kept for later', () => {
    assert.deepEqual(
      kindsOf('foo-parsers.ts', [
        "import { FooSchema } from './foo-schema.js';",
        'export const parseFoo = FooSchema.parse.bind(FooSchema);',
        'export const safeParseFoo = FooSchema.safeParse;',
        'export const readMeta = FooSchema.meta;',
        "export const decoded = FooSchema['parse']({});",
        'export const Described = FooSchema.meta({ title: "foo" });',
      ]),
      [
        'exported constant parseFoo',
        'exported constant safeParseFoo',
        'exported constant readMeta',
        'exported constant decoded',
        'exported schema Described',
      ],
    );
  });

  it('reads a value-producing zod function imported by name as a value', () => {
    assert.deepEqual(
      kindsOf('json-document.ts', [
        "import { object, string, toJSONSchema } from 'zod';",
        'const Profile = object({ name: string() });',
        'export const profileDocument = toJSONSchema(Profile);',
      ]),
      ['schema Profile', 'exported constant profileDocument'],
    );
  });

  it('roots schemas only in value imports named like schemas, not in helpers, type-only imports or names that go on past Schema', () => {
    assert.deepEqual(
      kindsOf('document.ts', [
        "import { buildJsonSchema } from './json-schema.js';",
        "import type { SettingsSchema } from '@immersion/contracts';",
        "import { type ProfileSchema } from '@immersion/contracts';",
        "import { ProfileSchemaFields } from './profile-fields.js';",
        'export const document = buildJsonSchema({});',
        'export const settings = SettingsSchema.shape;',
        'export const profile = ProfileSchema.shape;',
        'export const fields = ProfileSchemaFields.list();',
      ]),
      [
        'exported constant document',
        'exported constant settings',
        'exported constant profile',
        'exported constant fields',
      ],
    );
  });

  it('skips a side-effect import, which binds no name, and reads the imports after it', () => {
    assert.deepEqual(
      kindsOf('form.tsx', [
        "import './styles.css';",
        "import { z } from 'zod';",
        'export const Form = z.object({});',
        'export function Screen() { return <div />; }',
      ]),
      ['exported schema Form', 'exported component Screen'],
    );
  });

  it('reads one function from its overload signatures, with their references, and skips ambient values', () => {
    const declarations = classifyDeclarations(
      'pick.ts',
      [
        'export interface Input {}',
        'export function pick(value: Input): string;',
        'export function pick(value: number): number;',
        'export function pick(value: unknown) { return value; }',
        'declare function ambient(): void;',
        'declare class AmbientClient {}',
        'declare const AmbientSchema: unknown;',
      ].join('\n'),
    );

    assert.deepEqual(
      declarations.map(({ line, kind, name, references }) => `${line}:${kind} ${name} [${references.join(' ')}]`),
      ['1:type Input []', '2:function pick [Input]'],
    );
  });

  it('tells error classes from other classes by the name their extends clause ends in, and finds exports in export lists', () => {
    assert.deepEqual(
      kindsOf('errors.ts', [
        'class DomainError extends Error {}',
        'class ChatNotFoundError extends DomainError {}',
        'class Range extends errors.RangeError {}',
        'class Repository extends Base {}',
        'class AppBoundary extends ErrorBoundary {}',
        'class Handler implements ProblemError {}',
        'const helper = () => 1;',
        'export { ChatNotFoundError, helper as publicHelper };',
        'export default Repository;',
      ]),
      [
        'error DomainError',
        'exported error ChatNotFoundError',
        'error Range',
        'exported class Repository',
        'class AppBoundary',
        'class Handler',
        'exported function helper',
      ],
    );
  });

  it('takes a type-only export for an export of the type alone, never of a value of the same name', () => {
    assert.deepEqual(
      kindsOf('surface.ts', [
        'const parse = () => 1;',
        'type parse = number;',
        'function format() { return ""; }',
        'interface Options {}',
        'type Result = string;',
        'const both = () => 1;',
        'type both = number;',
        'export type { parse, Options };',
        'export { type format, type Result, both };',
      ]),
      [
        'function parse',
        'exported type parse',
        'function format',
        'exported type Options',
        'exported type Result',
        'exported function both',
        'exported type both',
      ],
    );
  });

  it('finds the default export of a local name through satisfies and parentheses', () => {
    assert.deepEqual(
      kindsOf('handler.ts', ['function helper() { return 1; }', 'export default (helper satisfies () => number);']),
      ['exported function helper'],
    );
  });

  it('takes no re-export of another module for an export of a local declaration of the same name', () => {
    assert.deepEqual(
      kindsOf('reexport.ts', ["export { helper } from './other.js';", 'function helper() { return 1; }']),
      ['function helper'],
    );
  });

  it('reads a function or class expression held by a variable as a function or class', () => {
    assert.deepEqual(
      kindsOf('expressions.ts', ['export const helper = function () { return 1; };', 'const Cache = class {};']),
      ['exported function helper', 'class Cache'],
    );
  });

  it('reads interfaces, type aliases, enums and namespaces as types', () => {
    assert.deepEqual(
      kindsOf('settings.ts', [
        'export interface Shape {}',
        'export type Alias = Shape;',
        'export enum Mode { A }',
        'export namespace Settings {}',
      ]),
      ['exported type Shape', 'exported type Alias', 'exported type Mode', 'exported type Settings'],
    );
  });

  it('reads components, hooks and functions by name and JSX, and only in .tsx or .jsx', () => {
    assert.deepEqual(
      kindsOf('screen.tsx', [
        'export function Screen() { return <main />; }',
        'export function Guard({ children }) { return children; }',
        'const Row = memo(function Row() { return null; });',
        'const Lazy = lazy(() => import("./x"));',
        'function renderItem(item: string) { return <li>{item}</li>; }',
        'function formatTitle(title: string) { return title.trim(); }',
        'export const useScreenStore = create(() => ({}));',
        'export function useRows() { return [<li key="a" />]; }',
        'export default function () { return <div />; }',
      ]),
      [
        'exported component Screen',
        'exported component Guard',
        'component Row',
        'constant Lazy',
        'component renderItem',
        'function formatTitle',
        'exported hook useScreenStore',
        'exported hook useRows',
        'exported component default',
      ],
    );
    assert.deepEqual(
      kindsOf('factory.ts', ['export function CreateThing() { return 1; }', 'const cached = memo(() => 1);']),
      ['exported function CreateThing', 'constant cached'],
    );
    assert.deepEqual(
      kindsOf('legacy.jsx', [
        'export function Legacy() { return <div />; }',
        'export function helper() { return 1; }',
        'function renderItem(item) { return <li>{item}</li>; }',
      ]),
      ['exported component Legacy', 'exported function helper', 'component renderItem'],
    );
    assert.deepEqual(kindsOf('script.mjs', ['export function Build() { return 1; }']), ['exported function Build']);
  });

  it('reads a name starting with use and an uppercase letter or a digit as a hook, and no other name, even one containing that', () => {
    assert.deepEqual(
      kindsOf('names.ts', [
        'export function useChat() { return 1; }',
        'export function use3dPreview() { return 2; }',
        'export function userLabel() { return 3; }',
        'export const usedSlots = 4;',
        'export function refuseUpload() { return 5; }',
      ]),
      [
        'exported hook useChat',
        'exported hook use3dPreview',
        'exported function userLabel',
        'exported constant usedSlots',
        'exported function refuseUpload',
      ],
    );
  });

  it('reads a function whose JSX is only a fragment as a component', () => {
    assert.deepEqual(kindsOf('labels.tsx', ['function renderLabel(text: string) { return <>{text}</>; }']), [
      'component renderLabel',
    ]);
  });

  it('reads memo or forwardRef over an inline function, cast or not, as a component, and any wrapper of a name or a loader as an alias', () => {
    assert.deepEqual(
      kindsOf('card.tsx', [
        "import { Row } from './row.js';",
        'function Card() { return <div />; }',
        'const Inner = forwardRef(() => <div />);',
        'const Field = React.forwardRef(function Field() { return <input />; });',
        'const Typed = memo((() => <div />) as FC);',
        'export const Outer = memo(Inner);',
        'export const FastRow = memo(Row);',
        'const Editor = React.lazy(async () => ({ default: (await import("./editor.js")).Editor }));',
        'export default memo(Card);',
      ]),
      [
        'component Card',
        'component Inner',
        'component Field',
        'component Typed',
        'exported constant Outer',
        'exported constant FastRow',
        'constant Editor',
        'exported constant default',
      ],
    );
  });

  it('reads a wrapper nested over an inline function, such as memo(forwardRef(…)), as an alias', () => {
    assert.deepEqual(kindsOf('fancy.tsx', ['export const Fancy = memo(forwardRef(() => <div />));']), [
      'exported constant Fancy',
    ]);
  });

  it('names each binding of a destructured declaration, nested or after a hole, and reports declaration lines', () => {
    const declarations = classifyDeclarations(
      'store.ts',
      [
        'const { useA, value } = build();',
        'const [, second] = pair;',
        'const { a: { useInner } } = build();',
        '',
        'export interface Shape {}',
      ].join('\n'),
    );

    assert.deepEqual(
      declarations.map(({ name, kind, line }) => `${line}:${kind} ${name}`),
      ['1:hook useA', '1:constant value', '2:constant second', '3:hook useInner', '5:type Shape'],
    );
  });

  it('reads a binding destructured from zod or from a schema as a constant, so it roots no schema', () => {
    assert.deepEqual(
      kindsOf('builders.ts', [
        "import { z } from 'zod';",
        "import { ProviderTypeSchema } from '@immersion/contracts';",
        'const { object } = z;',
        'const { options } = ProviderTypeSchema;',
        'const Stored = object({});',
        'export function read() { return [Stored, options]; }',
      ]),
      ['constant object', 'constant options', 'constant Stored', 'exported function read'],
    );
  });

  it('reads a variable declared without a value as a constant', () => {
    assert.deepEqual(kindsOf('cache.ts', ['let cache;', 'export function read() { return cache; }']), [
      'constant cache',
      'exported function read',
    ]);
  });
});

describe('role mixes the strict reading allows', () => {
  it('allows a use case with private helpers and its own input, output and error types', () => {
    assert.equal(
      mixOf('create-chat.ts', [
        'export interface CreateChatInput { title: string }',
        'export interface CreateChatResult { id: string }',
        'export class ChatTitleTakenError extends Error {}',
        'const MAX_TITLE = 80;',
        'function normalizeTitle(title: string) { return title.trim().slice(0, MAX_TITLE); }',
        'export async function createChat(input: CreateChatInput): Promise<CreateChatResult> {',
        '  return { id: normalizeTitle(input.title) };',
        '}',
      ]),
      null,
    );
  });

  it('allows functions of one kind with their constants, such as a query key and its options', () => {
    assert.equal(
      mixOf('chat-list-query.ts', [
        "export const chatListQueryKey = ['chats'] as const;",
        'export function chatListQueryOptions() { return { queryKey: chatListQueryKey }; }',
        'export function invalidateChatList() { return chatListQueryKey; }',
      ]),
      null,
    );
  });

  it('allows a class with private glue, its options type, a default and its own error', () => {
    assert.equal(
      mixOf('in-memory-job-registry.ts', [
        'export interface RegistryOptions { ttlMs: number }',
        'export const DEFAULT_TTL_MS = 1000;',
        'export class JobNotFoundError extends Error {}',
        'function cloneJob(job: object) { return { ...job }; }',
        'export class InMemoryJobRegistry {',
        '  constructor(private readonly options: RegistryOptions) {}',
        '  get(job: object) { return cloneJob(job); }',
        '}',
      ]),
      null,
    );
  });

  it("allows one format's schemas with their inferred types and limits", () => {
    assert.equal(
      mixOf('characters.ts', [
        "import { z } from 'zod';",
        'export const MAX_NAME_LENGTH = 120;',
        'export const CharacterSchema = z.object({ name: z.string().max(MAX_NAME_LENGTH) });',
        'export type Character = z.infer<typeof CharacterSchema>;',
        'export const CharacterListSchema = z.array(CharacterSchema);',
        'export type CharacterList = z.infer<typeof CharacterListSchema>;',
      ]),
      null,
    );
  });

  it('allows one component with its props type and private non-JSX helpers', () => {
    assert.equal(
      mixOf('chat-header.tsx', [
        'export interface ChatHeaderProps { title: string }',
        'const FALLBACK = "Чат";',
        'function titleOf(props: ChatHeaderProps) { return props.title || FALLBACK; }',
        'export function ChatHeader(props: ChatHeaderProps) { return <h1>{titleOf(props)}</h1>; }',
      ]),
      null,
    );
  });

  it('allows one exported component with the private sub-components and render helpers only it renders', () => {
    assert.equal(
      mixOf('chat-list-screen.tsx', [
        'function ChatListSkeleton() { return <div />; }',
        'export function ChatListScreen() { return <ChatListSkeleton />; }',
      ]),
      null,
    );
    assert.equal(
      mixOf('topbar.tsx', [
        'export interface TopbarProps { crumbs: string[] }',
        'interface Crumb { label: string }',
        'function renderCrumb(crumb: Crumb) { return <span>{crumb.label}</span>; }',
        'const Separator = memo(() => <i />);',
        'export function Topbar({ crumbs }: TopbarProps) {',
        '  return <nav>{crumbs.map((label) => renderCrumb({ label }))}<Separator /></nav>;',
        '}',
      ]),
      null,
    );
  });

  it('allows private components beside a default-exported component, a named export list or exported constants and errors', () => {
    assert.equal(
      mixOf('settings-page.tsx', [
        'function Section() { return <section />; }',
        'export default () => <main><Section /></main>;',
      ]),
      null,
    );
    assert.equal(
      mixOf('settings-page.tsx', [
        'function Section() { return <section />; }',
        'function SettingsPage() { return <main><Section /></main>; }',
        'export { SettingsPage };',
      ]),
      null,
    );
    assert.equal(
      mixOf('settings-page.tsx', [
        'export const SETTINGS_TABS = ["a", "b"];',
        'export class SettingsLoadError extends Error {}',
        'function Tab() { return <li />; }',
        'export function SettingsPage() { return <ul><Tab /></ul>; }',
      ]),
      null,
    );
  });

  it('leaves a private component that the exported one does not render to the unused-code lint, not to the role count', () => {
    assert.equal(
      mixOf('orphan.tsx', ['function Orphan() { return <div />; }', 'export function Screen() { return <main />; }']),
      null,
    );
  });

  it('allows a schema-derived constant beside the one role that uses it', () => {
    assert.equal(
      mixOf('provider-defaults.ts', [
        "import { ProviderTypeSchema } from '@immersion/contracts';",
        'const PROVIDER_TYPES = ProviderTypeSchema.options;',
        'export function createDefaultProviderConfigs() { return PROVIDER_TYPES.map((type) => ({ type })); }',
      ]),
      null,
    );
    assert.equal(
      mixOf('provider-type-select.tsx', [
        "import { ProviderTypeSchema } from '@immersion/contracts';",
        'const PROVIDER_OPTIONS = ProviderTypeSchema.options.map((type) => ({ value: type }));',
        'export function ProviderTypeSelect() { return <select>{PROVIDER_OPTIONS.length}</select>; }',
      ]),
      null,
    );
  });

  it('allows an overloaded function or component with the named types its signatures use', () => {
    assert.equal(
      mixOf('pick.ts', [
        'export interface Input {}',
        'export interface Output {}',
        'export function pick(value: Input): Output;',
        'export function pick(value: unknown) { return value; }',
      ]),
      null,
    );
    assert.equal(
      mixOf('select.tsx', [
        'export interface SelectProps { value: string }',
        'export interface NumberSelectProps { value: number }',
        'export function Select(props: SelectProps): JSX.Element;',
        'export function Select(props: NumberSelectProps): JSX.Element;',
        'export function Select(props: unknown) { return <select />; }',
      ]),
      null,
    );
  });

  it('allows one component wrapped in memo where it is declared, or beside the aliases only it renders', () => {
    assert.equal(
      mixOf('card.tsx', [
        'export interface CardProps { title: string }',
        'function Card({ title }: CardProps) { return <div>{title}</div>; }',
        'export default memo(Card);',
      ]),
      null,
    );
    assert.equal(
      mixOf('screen.tsx', [
        "import { Row } from './row.js';",
        'const Editor = lazy(() => import("./editor.js"));',
        'const FastRow = memo(Row);',
        'export function Screen() { return <Editor><FastRow /></Editor>; }',
      ]),
      null,
    );
  });

  it('allows a type that only a private sub-part of the main export uses', () => {
    assert.equal(
      mixOf('summary.ts', [
        'export type Mode = "short" | "long";',
        'function limitOf(mode: Mode) { return mode === "short" ? 10 : 100; }',
        'export function summarize(text: string) { return text.slice(0, limitOf("short")); }',
      ]),
      null,
    );
  });

  it('allows a type that a value names on the left of a qualified name', () => {
    assert.equal(
      mixOf('mode-value.ts', ['export enum Mode { A }', 'export function f(value: Mode.A) { return value; }']),
      null,
    );
  });

  it('allows a private type, used or not, beside the one role', () => {
    assert.equal(mixOf('run.ts', ['type Unused = string;', 'export function run() { return 1; }']), null);
  });

  it('allows a type that a value of the file uses through a shorthand property', () => {
    assert.equal(
      mixOf('make-options.ts', [
        'export interface Options {}',
        'const DEFAULTS: Options = {};',
        'export function make() { return { DEFAULTS }; }',
      ]),
      null,
    );
  });

  it('allows a type that only an exported constant or an exported error class uses', () => {
    assert.equal(
      mixOf('run.ts', [
        'export type Opts = {a: number};',
        'export const DEFAULTS = {a: 1} satisfies Opts;',
        'export function run() {}',
      ]),
      null,
    );
    assert.equal(
      mixOf('import-lorebook.ts', [
        'export interface ImportProblem { line: number }',
        'export class ImportFailedError extends Error { problem?: ImportProblem }',
        'export function importLorebook(text: string) { return text.length; }',
      ]),
      null,
    );
  });

  it('allows a file that exports only the type inferred from its private schema', () => {
    assert.equal(
      mixOf('stored-settings.ts', [
        "import { z } from 'zod';",
        'const StoredSettingsSchema = z.object({ url: z.string() });',
        'export type StoredSettings = z.infer<typeof StoredSettingsSchema>;',
      ]),
      null,
    );
  });

  it('allows plain functions whose names merely start with use', () => {
    assert.equal(
      mixOf('user-labels.ts', [
        'export function userLabel(name: string) { return name.trim(); }',
        'export function formatUser(name: string) { return userLabel(name); }',
      ]),
      null,
    );
  });

  it('allows several hooks of one kind with their types', () => {
    assert.equal(
      mixOf('use-preset-mutations.ts', [
        'interface PresetMutationOptions { presetId: string }',
        'export function useCreatePreset(options: PresetMutationOptions) { return options; }',
        'export function useDeletePreset(options: PresetMutationOptions) { return options; }',
      ]),
      null,
    );
  });

  it('allows files of only types, only errors, or only constants', () => {
    assert.equal(mixOf('chat-records.ts', ['export interface A {}', 'export type B = A[];']), null);
    assert.equal(mixOf('chat-errors.ts', ['export class A extends Error {}', 'export class B extends Error {}']), null);
    assert.equal(mixOf('upload-limits.ts', ['export const MAX = 1;', 'export const MIN = 0;']), null);
  });

  it('treats a barrel as a surface: re-exports and a module id are not a mix', () => {
    assert.equal(
      mixOf('index.ts', [
        "export { createChat } from './application/create-chat.js';",
        "export * from './application/chat-errors.js';",
        "export { FileChatRepository as Repository } from './infrastructure/file-chat-repository.js';",
        "export const chatsModuleId = 'chats';",
      ]),
      null,
    );
  });

  it('allows an entrypoint that only runs statements', () => {
    assert.equal(
      mixOf('main.tsx', [
        "import { createRoot } from 'react-dom/client';",
        "createRoot(document.getElementById('root')!).render(<App />);",
      ]),
      null,
    );
  });
});

describe('role mixes the strict reading forbids', () => {
  it('flags an I/O client that shares its file with the schemas of the protocol it speaks', () => {
    assert.equal(
      mixOf('anthropic-messages-client.ts', [
        "import { z } from 'zod';",
        'const ResponseSchema = z.object({ content: z.array(z.string()) });',
        'const StreamEventSchema = z.object({ type: z.string() });',
        'export class AnthropicMessagesClient {',
        '  read(payload: unknown) { return [ResponseSchema.parse(payload), StreamEventSchema]; }',
        '}',
      ]),
      'class:1 schema:2',
    );
  });

  it('flags a class beside an exported payload builder or mapper, in TypeScript or JavaScript', () => {
    for (const fileName of ['provider-client.ts', 'provider-client.mjs']) {
      assert.equal(
        mixOf(fileName, [
          'export function buildPayload(text) { return { text }; }',
          'export class ProviderClient { send(text) { return buildPayload(text); } }',
        ]),
        'class:1 function:1',
        fileName,
      );
    }
  });

  it('counts the implementation of an overloaded function once', () => {
    assert.equal(
      mixOf('pick-client.ts', [
        'export function pick(value: string): string;',
        'export function pick(value: number): number;',
        'export function pick(value: unknown) { return value; }',
        'export class PickClient {}',
      ]),
      'class:1 function:1',
    );
  });

  it('flags a second class, private or not, and a factory beside the class it hides', () => {
    assert.equal(mixOf('two.ts', ['class Cache {}', 'export class Repository { cache = new Cache(); }']), 'class:2');
    assert.equal(
      mixOf('client-factory.ts', [
        'class RoutingClient {}',
        'export function createClient() { return new RoutingClient(); }',
      ]),
      'class:1 function:1',
    );
  });

  it('flags schemas beside logic, whether the schema is exported or private', () => {
    assert.equal(
      mixOf('provider-settings.ts', [
        "import { z } from 'zod';",
        'const StoredSettingsSchema = z.object({ url: z.string() });',
        'export function normalizeStoredSettings(value: unknown) { return StoredSettingsSchema.parse(value); }',
      ]),
      'function:1 schema:1',
    );
    assert.equal(
      mixOf('routes.ts', [
        "import { z } from 'zod';",
        'export const ParamsSchema = z.object({ id: z.string() });',
        'export function routes() { return ParamsSchema; }',
      ]),
      'function:1 schema:1',
    );
  });

  it('flags a variable named …Schema beside a class, whatever builds it', () => {
    assert.equal(
      mixOf('store.ts', ['const StoredSchema = buildStoredSchema();', 'export class Store {}']),
      'class:1 schema:1',
    );
  });

  it('flags two exported components, memo-wrapped and default-exported alike, and counts a private one beside them', () => {
    assert.equal(
      mixOf('cards.tsx', [
        'export const Card = memo(() => <div />);',
        'export default function CardList() { return <Card />; }',
      ]),
      'component:2',
    );
    assert.equal(
      mixOf('cards.tsx', [
        'function CardBadge() { return <b />; }',
        'export const Card = memo(() => <div><CardBadge /></div>);',
        'export default function CardList() { return <Card />; }',
      ]),
      'component:3',
    );
  });

  it('flags a private hook, class or schema beside the one exported component, and leaves its private components out of the count', () => {
    assert.equal(
      mixOf('characters-screen.tsx', [
        'function useCharacterActions() { return {}; }',
        'function CharacterRow() { return <li />; }',
        'export function CharactersScreen() { useCharacterActions(); return <ul><CharacterRow /></ul>; }',
      ]),
      'component:1 hook:1',
    );
    assert.equal(
      mixOf('characters-screen.tsx', [
        'class CharacterCache {}',
        'function CharacterRow() { return <li />; }',
        'export function CharactersScreen() { return <ul><CharacterRow /></ul>; }',
      ]),
      'class:1 component:1',
    );
    assert.equal(
      mixOf('character-form.tsx', [
        "import { z } from 'zod';",
        'const FormSchema = z.object({ name: z.string() });',
        'function NameField() { return <input />; }',
        'export function CharacterForm() { FormSchema.parse({}); return <form><NameField /></form>; }',
      ]),
      'component:1 schema:1',
    );
  });

  it('counts private components when the exported role is not a component', () => {
    assert.equal(
      mixOf('message-markup.tsx', [
        'function Highlight() { return <mark />; }',
        'export function renderMarkup(text: string) { return text.length > 0 ? Highlight() : null; }',
      ]),
      'component:1 function:1',
    );
    assert.equal(
      mixOf('use-confirm-dialog.tsx', [
        'function ConfirmDialog() { return <dialog />; }',
        'export function useConfirmDialog() { return ConfirmDialog; }',
      ]),
      'component:1 hook:1',
    );
    assert.equal(
      mixOf('use-confirm-dialog.tsx', [
        'function ConfirmDialog() { return <dialog />; }',
        'function renderTitle() { return <h2 />; }',
        'export function useConfirmDialog() { return [ConfirmDialog, renderTitle]; }',
      ]),
      'component:2 hook:1',
    );
  });

  it('counts private components beside an exported component and an exported type no exported value uses', () => {
    assert.equal(
      mixOf('chat-header.tsx', [
        'export type ChatHeaderMode = "short" | "long";',
        'function Title() { return <h1 />; }',
        'export function ChatHeader() { return <header><Title /></header>; }',
      ]),
      'component:2 type:1',
    );
  });

  it('flags a file that exports no component but declares two private ones', () => {
    assert.equal(
      mixOf('main.tsx', [
        'function Providers() { return <div />; }',
        'function App() { return <Providers />; }',
        "createRoot(document.getElementById('root')!).render(<App />);",
      ]),
      'component:2',
    );
  });

  it('flags a component beside a hook, or beside an exported helper function', () => {
    assert.equal(
      mixOf('characters-screen.tsx', [
        'function useCharacterActions() { return {}; }',
        'export function CharactersScreen() { useCharacterActions(); return <main />; }',
      ]),
      'component:1 hook:1',
    );
    assert.equal(
      mixOf('message-content.tsx', [
        'export function stripMarkup(text: string) { return text; }',
        'export function MessageContent({ text }: { text: string }) { return <p>{stripMarkup(text)}</p>; }',
      ]),
      'component:1 function:1',
    );
  });

  it('flags a hook beside an exported plain function, including a store hook', () => {
    assert.equal(
      mixOf('ui-shell.ts', [
        'export function clampWidth(width: number) { return Math.max(width, 320); }',
        'export const useUiShellStore = create(() => ({ width: clampWidth(0) }));',
      ]),
      'function:1 hook:1',
    );
  });

  it('flags an exported type that no exported value of the file uses', () => {
    assert.equal(
      mixOf('sampler-preset-encoding.ts', [
        'export type PresetSummary = { id: string };',
        'export interface StoredPreset { id: string }',
        'export function encodePreset(id: string): StoredPreset { return { id }; }',
      ]),
      'function:1 type:1',
    );
  });

  it('flags an exported type that only a private function no exported value reaches uses', () => {
    assert.equal(
      mixOf('summary.ts', [
        "export type Mode = 'a';",
        'function unused(mode: Mode) { return mode; }',
        'export function run() { return 1; }',
      ]),
      'function:1 type:1',
    );
  });

  it('flags a type that a value names only as a property, a destructured key or the right of a qualified name', () => {
    assert.equal(
      mixOf('mode.ts', ["export type Mode = 'a'; export function f(o) { const { Mode: m } = o; return o.Mode; }"]),
      'function:1 type:1',
    );
    assert.equal(
      mixOf('mode-option.ts', ["export type Mode = 'a';", 'export function f() { return { Mode: 1 }; }']),
      'function:1 type:1',
    );
    assert.equal(
      mixOf('mode-setting.ts', [
        "export type Mode = 'a';",
        'export function f(value: Settings.Mode) { return value; }',
      ]),
      'function:1 type:1',
    );
  });

  it('counts every role-bearing declaration so a mixed file cannot grow unnoticed', () => {
    const mix = roleMix(
      classifyDeclarations(
        'file-chat-repository.ts',
        [
          'function getString(value: unknown) { return String(value); }',
          'export function readAttachment() { return getString(1); }',
          'export function deleteAttachments() {}',
          'export class FileChatRepository {}',
        ].join('\n'),
      ),
    );

    assert.equal(formatCounts(mix.signature), 'class:1 function:2');
    assert.deepEqual(
      mix.members.map(({ line, name }) => `${line}:${name}`),
      ['2:readAttachment', '3:deleteAttachments', '4:FileChatRepository'],
    );
  });
});

describe('known false positives, each resolved by an owner exception until the gate tells them apart', () => {
  it('reads a value named use… as a hook, so beside a function it mixes', () => {
    assert.equal(
      mixOf('terminal-colors.ts', [
        'export const useColor = process.stdout.isTTY;',
        'export function paint(text: string) { return useColor ? text.toUpperCase() : text; }',
      ]),
      'function:1 hook:1',
    );
  });

  it('reads an error class whose base name does not end in Error as a class, so beside its use case it mixes', () => {
    assert.equal(
      mixOf('find-chat.ts', [
        'export class ChatNotFound extends HttpProblem {}',
        'export function findChat(id: string) { throw new ChatNotFound(id); }',
      ]),
      'class:1 function:1',
    );
  });

  it('reads memo over a private component as an alias, not as the exported component, so a second private one mixes', () => {
    assert.equal(
      mixOf('card.tsx', [
        'function CardBadge() { return <b />; }',
        'function Card() { return <div><CardBadge /></div>; }',
        'export default memo(Card);',
      ]),
      'component:2',
    );
  });

  it('reads an exported schema builder as a function, so beside the schemas it builds it mixes', () => {
    assert.equal(
      mixOf('page.ts', [
        "import { z } from 'zod';",
        'export function paginated<T extends z.ZodType>(item: T) { return z.object({ items: z.array(item) }); }',
        'export const PageSchema = paginated(z.string());',
      ]),
      'function:1 schema:1',
    );
  });
});
