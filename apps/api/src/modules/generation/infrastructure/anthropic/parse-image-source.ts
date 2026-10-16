import type { AnthropicImageSource } from './request-wire.js';

export function parseAnthropicImageSource(dataUrl: string): AnthropicImageSource | null {
  const match = /^data:(?<mediaType>[^;,]+);base64,(?<data>.+)$/su.exec(dataUrl);
  const mediaType = match?.groups?.mediaType;
  const data = match?.groups?.data;

  if (!mediaType || !data) {
    return null;
  }

  return { data, media_type: mediaType, type: 'base64' };
}
