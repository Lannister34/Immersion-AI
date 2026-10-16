import type { ChatMessageRole } from '@immersion/contracts/chats';
import type {
  ChatReplyPromptPreviewRendererDiagnostics,
  ChatReplyPromptPreviewSource,
} from '@immersion/contracts/generation';
import { describe, expectTypeOf, it } from 'vitest';

import type { ChatReplyPromptRole } from './application/build-chat-reply-prompt.js';
import type { PromptTranscriptRole } from './application/prompt-input-snapshot.js';
import type { PromptTemplateSourceKind } from './application/prompt-source.js';
import type { PromptTemplateDiagnostics } from './application/prompt-template-engine.js';

describe('prompt types shared by the domain and the preview contract', () => {
  it('renderer diagnostics match the preview contract field for field', () => {
    expectTypeOf<PromptTemplateDiagnostics>().toEqualTypeOf<ChatReplyPromptPreviewRendererDiagnostics>();
  });

  it('prompt source kinds match the preview contract', () => {
    expectTypeOf<PromptTemplateSourceKind>().toEqualTypeOf<ChatReplyPromptPreviewSource['kind']>();
  });

  it('transcript and reply roles match the chat message roles', () => {
    expectTypeOf<PromptTranscriptRole>().toEqualTypeOf<ChatMessageRole>();
    expectTypeOf<ChatReplyPromptRole>().toEqualTypeOf<ChatMessageRole>();
  });
});
