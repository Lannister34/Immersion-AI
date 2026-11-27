export type FetchingSourceFormat = 'css' | 'html';

const ABSOLUTE_OR_PROTOCOL_RELATIVE = /^(?:[a-z][a-z\d+.-]*:)?\/\//iu;
const HTML_URL_ATTRIBUTE =
  /\s(action|background|cite|data|formaction|href|imagesrcset|manifest|ping|poster|src|srcset|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu;
const SRCSET_ATTRIBUTES = new Set(['imagesrcset', 'srcset']);
const HTML_SCRIPT_BODY = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/giu;
const HTML_EVENT_HANDLER = /\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu;
const JAVASCRIPT_URL = /^\s*javascript:/iu;
const CSS_URL_FUNCTION = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/giu;
const CSS_IMPORT_STRING = /@import\s+(?:"([^"]*)"|'([^']*)')/giu;
const CSS_IMAGE_SET_START = /image-set\(/giu;
const CSS_STRING = /"([^"]*)"|'([^']*)'/gu;
const SCRIPT_ABSOLUTE_URL = /(?:https?|wss?):\/\/[^\s"'`\\<>(){}[\]]+/giu;

function capturedValues(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1] ?? match[2] ?? match[3] ?? '');
}

function htmlAttributeReferences(source: string): string[] {
  return [...source.matchAll(HTML_URL_ATTRIBUTE)].flatMap((match) => {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (!SRCSET_ATTRIBUTES.has(match[1]?.toLowerCase() ?? '')) return [value];
    return value.split(',').map((candidate) => candidate.trim().split(/\s+/u)[0] ?? '');
  });
}

function balancedArguments(source: string, start: number): string {
  let depth = 1;
  let quote: string | null = null;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index);
    }
  }

  return source.slice(start);
}

function imageSetStrings(source: string): string[] {
  return [...source.matchAll(CSS_IMAGE_SET_START)].flatMap((match) =>
    capturedValues(balancedArguments(source, match.index + match[0].length), CSS_STRING),
  );
}

function cssReferences(source: string): string[] {
  return [
    ...capturedValues(source, CSS_URL_FUNCTION),
    ...capturedValues(source, CSS_IMPORT_STRING),
    ...imageSetStrings(source),
  ];
}

function inlineScriptReferences(source: string): string[] {
  const javascriptUrls = htmlAttributeReferences(source).filter((value) => JAVASCRIPT_URL.test(value));
  return [
    ...capturedValues(source, HTML_SCRIPT_BODY),
    ...capturedValues(source, HTML_EVENT_HANDLER),
    ...javascriptUrls,
  ].flatMap(findAbsoluteUrlsInScript);
}

function htmlReferences(source: string): string[] {
  return [...htmlAttributeReferences(source), ...cssReferences(source), ...inlineScriptReferences(source)];
}

export function findCrossOriginUrls(source: string, format: FetchingSourceFormat): string[] {
  const references = format === 'html' ? htmlReferences(source) : cssReferences(source);
  return references
    .map((reference) => reference.trim())
    .filter((reference) => ABSOLUTE_OR_PROTOCOL_RELATIVE.test(reference));
}

export function findAbsoluteUrlsInScript(source: string): string[] {
  return [...source.matchAll(SCRIPT_ABSOLUTE_URL)].map((match) => match[0]);
}
