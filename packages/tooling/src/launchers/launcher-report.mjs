export function describeViolation(file, { line, column, rule, excerpt }) {
  return `${file}:${line}:${column}: ${rule}: ${excerpt}`;
}

export function describeLauncherRule() {
  return (
    'A launcher runs only what the lockfile installed. npx, npm exec and npm x without --no, or with --yes, ' +
    'npm init with a package, npm, pnpm and yarn create, pnpm and yarn dlx, pnpx, bunx and bun x fetch ' +
    'whatever version the registry serves. Add the tool as a pinned devDependency and run it through ' +
    'npx --no, pnpm exec or a package script.'
  );
}
