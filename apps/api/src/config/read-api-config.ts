import { type ApiConfig, parseApiConfig } from './api-config.js';
import { findProjectRoot } from './find-project-root.js';

let projectRoot: string | undefined;

export function readApiConfig(): ApiConfig {
  projectRoot ??= findProjectRoot(import.meta.dirname);

  return parseApiConfig(process.env, projectRoot);
}
