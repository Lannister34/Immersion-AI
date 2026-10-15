import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import typescript from 'typescript';

import { tscProjects } from './package-script-tsc-projects.mjs';
import { REPOSITORY, repositoryGit } from './repository-git.mjs';

const programs = new Map();

function repositoryPath(file) {
  return path.relative(REPOSITORY, file).split(path.sep).join('/');
}

function describeDiagnostic(config, diagnostic) {
  return `${config}: ${typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
}

export function packageScriptConfigs(scriptName) {
  return repositoryGit(['ls-files', '-z', '--', '*/package.json'])
    .split('\0')
    .filter(Boolean)
    .flatMap((manifestFile) => {
      const manifest = JSON.parse(readFileSync(path.join(REPOSITORY, manifestFile), 'utf8'));

      return tscProjects(manifest.scripts?.[scriptName] ?? '').map((project) =>
        path.join(REPOSITORY, path.dirname(manifestFile), project),
      );
    });
}

function loadProgram(configFile) {
  const config = repositoryPath(configFile);
  const parsed = typescript.getParsedCommandLineOfConfigFile(configFile, undefined, {
    ...typescript.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => assert.fail(describeDiagnostic(config, diagnostic)),
  });
  assert.deepEqual(
    parsed.errors.map((diagnostic) => describeDiagnostic(config, diagnostic)),
    [],
  );
  const program = typescript.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  });

  return {
    config,
    emits: parsed.options.noEmit !== true,
    files: program.getSourceFiles().map((sourceFile) => ({
      path: repositoryPath(sourceFile.fileName),
      text: sourceFile.text,
      emitted: !sourceFile.isDeclarationFile && !program.isSourceFileFromExternalLibrary(sourceFile),
    })),
  };
}

export function programOf(configFile) {
  if (!programs.has(configFile)) {
    programs.set(configFile, loadProgram(configFile));
  }
  return programs.get(configFile);
}
