import {
  BranchChatCommandSchema,
  ChatIdSchema,
  CreateChatCommandSchema,
  UpdateChatBindingsCommandSchema,
  UpdateChatLorebooksCommandSchema,
  UpdateChatMessageCommandSchema,
  UpdateChatTitleCommandSchema,
} from '@immersion/contracts/chats';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createToProblem, problem } from '../../../../shared/interface/http/problem.js';
import { CharacterNotFoundError } from '../../../characters/application/get-character-avatar.js';
import { ScenarioNotFoundError } from '../../../scenarios/application/get-scenario.js';
import { ChatMessageNotFoundError, ChatNotFoundError } from '../../application/append-chat-messages.js';
import { branchChat } from '../../application/branch-chat.js';
import { createChat } from '../../application/create-chat.js';
import { deleteChat } from '../../application/delete-chat.js';
import { exportChat } from '../../application/export-chat.js';
import { getChatSession } from '../../application/get-chat-session.js';
import { listChats } from '../../application/list-chats.js';
import { truncateChatMessages } from '../../application/truncate-chat-messages.js';
import { updateChatBindings } from '../../application/update-chat-bindings.js';
import {
  InvalidChatGenerationSettingsError,
  updateChatGenerationSettings,
} from '../../application/update-chat-generation-settings.js';
import { updateChatLorebooks } from '../../application/update-chat-lorebooks.js';
import { updateChatMessage } from '../../application/update-chat-message.js';
import { updateChatTitle } from '../../application/update-chat-title.js';

const ChatRouteParamsSchema = z.object({
  chatId: ChatIdSchema,
});

const ChatMessageRouteParamsSchema = z.object({
  chatId: ChatIdSchema,
  messageIndex: z.coerce.number().int().positive(),
});

const ChatListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
});

const toProblem = createToProblem((error) => {
  if (error instanceof ChatNotFoundError) {
    return problem(404, 'chat_not_found', 'Chat session not found.');
  }

  if (error instanceof ChatMessageNotFoundError) {
    return problem(404, 'chat_message_not_found', 'Chat message not found.');
  }

  if (error instanceof CharacterNotFoundError) {
    return problem(404, 'character_not_found', 'Character not found.');
  }

  if (error instanceof ScenarioNotFoundError) {
    return problem(404, 'scenario_not_found', 'Scenario not found.');
  }

  if (error instanceof InvalidChatGenerationSettingsError) {
    return problem(400, 'invalid_chat_generation_settings', error.message);
  }

  return null;
});

export const chatsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    try {
      const query = ChatListQuerySchema.parse(request.query);
      return await listChats(query.q ? { searchText: query.q } : {});
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list generic chats');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/', async (request, reply) => {
    try {
      const command = CreateChatCommandSchema.parse(request.body);
      const response = await createChat(command);

      return reply.status(201).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create generic chat');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/:chatId', async (request, reply) => {
    try {
      const { chatId } = ChatRouteParamsSchema.parse(request.params);
      const session = await getChatSession(chatId);
      if (!session) {
        return reply.status(404).send({
          code: 'chat_not_found',
          message: 'Chat session not found.',
        });
      }

      return session;
    } catch (error) {
      request.log.error({ err: error }, 'Failed to load generic chat session');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get('/:chatId/export', async (request, reply) => {
    try {
      const { chatId } = ChatRouteParamsSchema.parse(request.params);
      const exported = await exportChat(chatId);
      const asciiFallback = exported.fileName.replace(/[^\x20-\x7e]+/gu, '_').replace(/"/g, "'");
      const safeAscii = asciiFallback.length > 0 ? asciiFallback : 'chat.jsonl';
      const encodedFileName = encodeURIComponent(exported.fileName);

      reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodedFileName}`);

      return exported.body;
    } catch (error) {
      request.log.error({ err: error }, 'Failed to export chat');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.delete('/:chatId', async (request, reply) => {
    try {
      const { chatId } = ChatRouteParamsSchema.parse(request.params);
      await deleteChat(chatId);
      return reply.status(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete chat');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.put('/:chatId/lorebooks', async (request, reply) => {
    try {
      const { chatId } = ChatRouteParamsSchema.parse(request.params);
      const command = UpdateChatLorebooksCommandSchema.parse(request.body);
      const session = await updateChatLorebooks(chatId, command.lorebookIds);
      return session;
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update chat lorebooks');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.patch('/:chatId/title', async (request, reply) => {
    try {
      const { chatId } = ChatRouteParamsSchema.parse(request.params);
      const command = UpdateChatTitleCommandSchema.parse(request.body);
      const chat = await updateChatTitle({ chatId, title: command.title });
      return { chat };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update chat title');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.patch('/:chatId/bindings', async (request, reply) => {
    try {
      const { chatId } = ChatRouteParamsSchema.parse(request.params);
      const command = UpdateChatBindingsCommandSchema.parse(request.body);
      return await updateChatBindings({
        chatId,
        ...(command.characterId !== undefined ? { characterId: command.characterId } : {}),
        ...(command.scenarioId !== undefined ? { scenarioId: command.scenarioId } : {}),
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update chat bindings');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.put('/:chatId/generation-settings', async (request, reply) => {
    try {
      const { chatId } = ChatRouteParamsSchema.parse(request.params);

      return await updateChatGenerationSettings(chatId, request.body);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update generic chat generation settings');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.patch('/:chatId/messages/:messageIndex', async (request, reply) => {
    try {
      const { chatId, messageIndex } = ChatMessageRouteParamsSchema.parse(request.params);
      const command = UpdateChatMessageCommandSchema.parse(request.body);
      const session = await updateChatMessage({
        chatId,
        content: command.content,
        messageIndex,
        now: () => new Date(),
      });

      return { session };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update chat message');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.delete('/:chatId/messages/:messageIndex', async (request, reply) => {
    try {
      const { chatId, messageIndex } = ChatMessageRouteParamsSchema.parse(request.params);
      const session = await truncateChatMessages({
        chatId,
        fromIndex: messageIndex,
        now: () => new Date(),
      });

      return { session };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to truncate chat messages');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/:chatId/branch', async (request, reply) => {
    try {
      const { chatId } = ChatRouteParamsSchema.parse(request.params);
      const command = BranchChatCommandSchema.parse(request.body);
      const chat = await branchChat({
        now: () => new Date(),
        sourceChatId: chatId,
        throughIndex: command.throughMessageIndex,
        ...(command.title ? { title: command.title } : {}),
      });

      return reply.status(201).send({ chat });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to branch chat');
      const mapped = toProblem(error);

      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });
};
