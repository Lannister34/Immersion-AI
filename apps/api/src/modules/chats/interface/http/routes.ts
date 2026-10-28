import {
  BranchChatCommandSchema,
  CreateChatCommandSchema,
  ImportChatCommandSchema,
  UpdateChatBindingsCommandSchema,
  UpdateChatGenerationSettingsCommandSchema,
  UpdateChatLorebooksCommandSchema,
  UpdateChatMessageCommandSchema,
  UpdateChatTitleCommandSchema,
  UploadChatAttachmentCommandSchema,
} from '@immersion/contracts/chats';
import type { FastifyPluginAsync } from 'fastify';

import type { Clock } from '../../../../platform/clock/clock.js';
import { parseRequest } from '../../../../platform/http/parse-request.js';
import { ChatNotFoundError } from '../../application/append-chat-messages.js';
import { branchChat } from '../../application/branch-chat.js';
import { getChatAttachment, uploadChatAttachment } from '../../application/chat-attachments.js';
import type { ChatRepository } from '../../application/chat-repository.js';
import type {
  ChatCharacterReader,
  ChatListIndexPort,
  ChatScenarioReader,
  ProfileUserNameSource,
  SamplerPresetReader,
} from '../../application/chats-ports.js';
import { createChat } from '../../application/create-chat.js';
import { deleteChat } from '../../application/delete-chat.js';
import { deleteChatMessage } from '../../application/delete-chat-message.js';
import { exportChat } from '../../application/export-chat.js';
import { getChatSession } from '../../application/get-chat-session.js';
import { importChat } from '../../application/import-chat.js';
import { listChats } from '../../application/list-chats.js';
import { truncateChatMessages } from '../../application/truncate-chat-messages.js';
import { updateChatBindings } from '../../application/update-chat-bindings.js';
import { updateChatGenerationSettings } from '../../application/update-chat-generation-settings.js';
import { updateChatLorebooks } from '../../application/update-chat-lorebooks.js';
import { updateChatMessage } from '../../application/update-chat-message.js';
import { updateChatTitle } from '../../application/update-chat-title.js';
import {
  ChatAttachmentRouteParamsSchema,
  ChatListQuerySchema,
  ChatMessageRouteParamsSchema,
  ChatRouteParamsSchema,
  DeleteChatMessageQuerySchema,
} from './request-schemas.js';

export interface ChatsRoutesDependencies {
  readonly characters: ChatCharacterReader;
  readonly chatIndex: ChatListIndexPort;
  readonly chatRepository: ChatRepository;
  readonly clock: Clock;
  readonly profile: ProfileUserNameSource;
  readonly samplerPresets: SamplerPresetReader;
  readonly scenarios: ChatScenarioReader;
}

export function createChatsRoutes(dependencies: ChatsRoutesDependencies): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (request) => {
      const query = parseRequest(ChatListQuerySchema, request.query);

      return listChats(query.q ? { searchText: query.q } : {}, dependencies);
    });

    app.post('/', async (request, reply) => {
      const command = parseRequest(CreateChatCommandSchema, request.body);
      const response = await createChat(command, dependencies);

      return reply.status(201).send(response);
    });

    app.post('/import', async (request, reply) => {
      const command = parseRequest(ImportChatCommandSchema, request.body);
      const response = await importChat(command, dependencies);

      return reply.status(201).send(response);
    });

    app.get('/:chatId', async (request) => {
      const { chatId } = parseRequest(ChatRouteParamsSchema, request.params);
      const session = await getChatSession({ chatId }, dependencies);

      if (!session) {
        throw new ChatNotFoundError(chatId);
      }

      return session;
    });

    app.get('/:chatId/export', async (request, reply) => {
      const { chatId } = parseRequest(ChatRouteParamsSchema, request.params);
      const exported = await exportChat({ chatId }, dependencies);
      const asciiFallback = exported.fileName.replace(/[^\x20-\x7e]+/gu, '_').replace(/"/g, "'");
      const safeAscii = asciiFallback.length > 0 ? asciiFallback : 'chat.jsonl';
      const encodedFileName = encodeURIComponent(exported.fileName);

      reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodedFileName}`);

      return exported.body;
    });

    app.post('/:chatId/attachments', async (request, reply) => {
      const { chatId } = parseRequest(ChatRouteParamsSchema, request.params);
      const command = parseRequest(UploadChatAttachmentCommandSchema, request.body);
      const uploaded = await uploadChatAttachment({ ...command, chatId }, dependencies);

      return reply.status(201).send(uploaded);
    });

    app.get('/:chatId/attachments/:attachmentId', async (request, reply) => {
      const { attachmentId, chatId } = parseRequest(ChatAttachmentRouteParamsSchema, request.params);
      const attachment = await getChatAttachment({ attachmentId, chatId }, dependencies);

      reply.header('Content-Type', attachment.contentType);
      reply.header('Cache-Control', 'private, max-age=31536000, immutable');

      return reply.send(attachment.body);
    });

    app.delete('/:chatId', async (request, reply) => {
      const { chatId } = parseRequest(ChatRouteParamsSchema, request.params);
      await deleteChat({ chatId }, dependencies);

      return reply.status(204).send();
    });

    app.put('/:chatId/lorebooks', async (request) => {
      const { chatId } = parseRequest(ChatRouteParamsSchema, request.params);
      const command = parseRequest(UpdateChatLorebooksCommandSchema, request.body);

      return updateChatLorebooks({ chatId, lorebookIds: command.lorebookIds }, dependencies);
    });

    app.patch('/:chatId/title', async (request) => {
      const { chatId } = parseRequest(ChatRouteParamsSchema, request.params);
      const command = parseRequest(UpdateChatTitleCommandSchema, request.body);
      const chat = await updateChatTitle({ chatId, title: command.title }, dependencies);

      return { chat };
    });

    app.patch('/:chatId/bindings', async (request) => {
      const { chatId } = parseRequest(ChatRouteParamsSchema, request.params);
      const command = parseRequest(UpdateChatBindingsCommandSchema, request.body);

      return updateChatBindings(
        {
          chatId,
          ...(command.characterId !== undefined ? { characterId: command.characterId } : {}),
          ...(command.scenarioId !== undefined ? { scenarioId: command.scenarioId } : {}),
        },
        dependencies,
      );
    });

    app.put('/:chatId/generation-settings', async (request) => {
      const { chatId } = parseRequest(ChatRouteParamsSchema, request.params);
      const settings = parseRequest(UpdateChatGenerationSettingsCommandSchema, request.body);

      return updateChatGenerationSettings({ chatId, settings }, dependencies);
    });

    app.patch('/:chatId/messages/:messageIndex', async (request) => {
      const { chatId, messageIndex } = parseRequest(ChatMessageRouteParamsSchema, request.params);
      const command = parseRequest(UpdateChatMessageCommandSchema, request.body);
      const session = await updateChatMessage({ chatId, content: command.content, messageIndex }, dependencies);

      return { session };
    });

    app.delete('/:chatId/messages/:messageIndex', async (request) => {
      const { chatId, messageIndex } = parseRequest(ChatMessageRouteParamsSchema, request.params);
      const { mode } = parseRequest(DeleteChatMessageQuerySchema, request.query);
      const session =
        mode === 'from-here'
          ? await truncateChatMessages({ chatId, fromIndex: messageIndex }, dependencies)
          : await deleteChatMessage({ chatId, messageIndex }, dependencies);

      return { session };
    });

    app.post('/:chatId/branch', async (request, reply) => {
      const { chatId } = parseRequest(ChatRouteParamsSchema, request.params);
      const command = parseRequest(BranchChatCommandSchema, request.body);
      const chat = await branchChat(
        {
          sourceChatId: chatId,
          throughIndex: command.throughMessageIndex,
          ...(command.title ? { title: command.title } : {}),
        },
        dependencies,
      );

      return reply.status(201).send({ chat });
    });
  };
}
