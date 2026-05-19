import {
  BranchChatCommandSchema,
  ChatIdSchema,
  CreateChatCommandSchema,
  UpdateChatLorebooksCommandSchema,
  UpdateChatMessageCommandSchema,
  UpdateChatTitleCommandSchema,
} from '@immersion/contracts/chats';
import { ApiProblemSchema } from '@immersion/contracts/common';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
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

function toProblem(error: unknown) {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: ApiProblemSchema.parse({
        code: 'validation_error',
        message: error.issues[0]?.message ?? 'Invalid request payload.',
      }),
    };
  }

  if (error instanceof ChatNotFoundError) {
    return {
      statusCode: 404,
      body: ApiProblemSchema.parse({
        code: 'chat_not_found',
        message: 'Chat session not found.',
      }),
    };
  }

  if (error instanceof ChatMessageNotFoundError) {
    return {
      statusCode: 404,
      body: ApiProblemSchema.parse({
        code: 'chat_message_not_found',
        message: 'Chat message not found.',
      }),
    };
  }

  if (error instanceof CharacterNotFoundError) {
    return {
      statusCode: 404,
      body: ApiProblemSchema.parse({
        code: 'character_not_found',
        message: 'Character not found.',
      }),
    };
  }

  if (error instanceof ScenarioNotFoundError) {
    return {
      statusCode: 404,
      body: ApiProblemSchema.parse({
        code: 'scenario_not_found',
        message: 'Scenario not found.',
      }),
    };
  }

  if (error instanceof InvalidChatGenerationSettingsError) {
    return {
      statusCode: 400,
      body: ApiProblemSchema.parse({
        code: 'invalid_chat_generation_settings',
        message: error.message,
      }),
    };
  }

  return {
    statusCode: 500,
    body: ApiProblemSchema.parse({
      code: 'internal_error',
      message: 'Unexpected error.',
    }),
  };
}

export const chatsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (request, reply) => {
    try {
      const query = ChatListQuerySchema.parse(request.query);
      return await listChats(query.q ? { searchText: query.q } : {});
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list generic chats');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.post('/', async (request, reply) => {
    try {
      const command = CreateChatCommandSchema.parse(request.body);
      const response = await createChat(command);

      return reply.status(201).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create generic chat');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.delete('/:chatId', async (request, reply) => {
    try {
      const { chatId } = ChatRouteParamsSchema.parse(request.params);
      await deleteChat(chatId);
      return reply.status(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete chat');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.put('/:chatId/generation-settings', async (request, reply) => {
    try {
      const { chatId } = ChatRouteParamsSchema.parse(request.params);

      return await updateChatGenerationSettings(chatId, request.body);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update generic chat generation settings');
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
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
      const problem = toProblem(error);

      return reply.status(problem.statusCode).send(problem.body);
    }
  });
};
