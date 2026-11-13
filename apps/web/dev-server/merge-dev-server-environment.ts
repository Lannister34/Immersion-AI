type Environment = Readonly<Record<string, string | undefined>>;

export function mergeDevServerEnvironment(fileEnv: Environment, processEnv: Environment): Environment {
  const merged: Record<string, string | undefined> = { ...fileEnv };

  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined && value.trim().length > 0) merged[key] = value;
  }

  return merged;
}
