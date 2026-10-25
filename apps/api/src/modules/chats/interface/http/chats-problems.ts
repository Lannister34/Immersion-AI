import { problem } from '../../../../platform/http/problem.js';
import { createProblemTable, type ProblemTable, problemFor } from '../../../../platform/http/problem-table.js';
import { ChatMessageNotFoundError, ChatNotFoundError } from '../../application/append-chat-messages.js';
import { ChatAttachmentNotFoundError, InvalidChatAttachmentError } from '../../application/chat-attachments.js';
import { ChatTitleConflictError } from '../../application/chat-conflicts.js';
import { ChatFileTooLargeError, InvalidChatFileError } from '../../application/import-chat.js';
import { InvalidChatGenerationSettingsError } from '../../application/update-chat-generation-settings.js';

export const chatsProblems: ProblemTable = createProblemTable(
  problemFor(ChatNotFoundError, () => problem(404, 'chat_not_found', 'Chat session not found.')),
  problemFor(ChatMessageNotFoundError, () => problem(404, 'chat_message_not_found', 'Chat message not found.')),
  problemFor(InvalidChatGenerationSettingsError, (error) =>
    problem(400, 'invalid_chat_generation_settings', error.message),
  ),
  problemFor(ChatAttachmentNotFoundError, () =>
    problem(404, 'chat_attachment_not_found', 'Вложение не найдено — загрузите изображение заново.'),
  ),
  problemFor(InvalidChatAttachmentError, (error) => problem(400, 'invalid_chat_attachment', error.message)),
  problemFor(InvalidChatFileError, (error) => problem(400, 'invalid_chat_file', error.message)),
  problemFor(ChatFileTooLargeError, (error) => problem(413, 'chat_file_too_large', error.message)),
  problemFor(ChatTitleConflictError, () =>
    problem(409, 'chat_title_conflict', 'Chat was renamed while the title was being generated.'),
  ),
);
