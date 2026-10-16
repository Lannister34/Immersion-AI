const LAUNCHER_FILES = [
  /\.(?:bat|cmd|ps1|sh)$/i,
  /^\.husky\/[^/]+$/,
  /(?:^|\/)package\.json$/,
  /^[^/]+\.cjs$/,
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
];

export function isLauncherFile(file) {
  return LAUNCHER_FILES.some((pattern) => pattern.test(file));
}
