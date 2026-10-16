import type { HttpStub } from './http-stub.js';
import {
  type ProviderChatRequestFixture,
  ProviderChatRequestFixtureSchema,
} from './provider-chat-request-fixture-schema.js';

export function readProviderChatRequest(http: Pick<HttpStub, 'requests'>, index = 0): ProviderChatRequestFixture {
  const request = http.requests[index];

  if (request === undefined) {
    throw new Error(`No provider request #${index} was recorded; the stub saw ${http.requests.length}.`);
  }

  return request.json(ProviderChatRequestFixtureSchema);
}
