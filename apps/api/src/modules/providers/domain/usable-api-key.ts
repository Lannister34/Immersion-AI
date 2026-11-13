import { ProviderApiKeyTextSchema } from '@immersion/contracts/providers';

export function readUsableApiKey(storedKey: string | undefined): string | null {
  if (storedKey === undefined) return null;

  const parsed = ProviderApiKeyTextSchema.safeParse(storedKey);

  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}
