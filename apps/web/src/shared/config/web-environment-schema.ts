import { z } from 'zod';

function isHttpOrigin(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (url.protocol === 'http:' || url.protocol === 'https:') && url.href === `${url.origin}/`;
}

const ApiOriginSchema = z
  .string()
  .refine(isHttpOrigin, 'must be an http(s) origin without a path, such as http://127.0.0.1:4787')
  .transform((value) => new URL(value).origin);

export const WebEnvironmentSchema = z.object({
  VITE_API_BASE_URL: ApiOriginSchema.optional(),
});
