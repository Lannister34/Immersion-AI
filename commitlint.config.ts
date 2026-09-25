interface ParsedCommit {
  readonly raw: string | null;
  readonly subject: string | null;
}

type RuleOutcome = readonly [boolean, string];

const FORBIDDEN_PATTERNS = /(co-authored-by:|generated with|claude code|chatgpt|copilot|codex)/i;
const CYRILLIC_PATTERN = /[\u0400-\u04FF]/;

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'subject-no-cyrillic': (parsed: ParsedCommit): RuleOutcome => {
          const subject = parsed.subject ?? '';
          return [!CYRILLIC_PATTERN.test(subject), 'commit subject must be English only'];
        },
        'message-no-ai-attribution': (parsed: ParsedCommit): RuleOutcome => {
          const raw = parsed.raw ?? '';
          return [!FORBIDDEN_PATTERNS.test(raw), 'AI attribution lines are not allowed in commit messages'];
        },
      },
    },
  ],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'style', 'docs', 'chore']],
    'subject-case': [0],
    'subject-no-cyrillic': [2, 'always'],
    'message-no-ai-attribution': [2, 'always'],
  },
};
