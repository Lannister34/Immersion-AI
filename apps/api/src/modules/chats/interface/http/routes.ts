import { ChatIdSchema, CreateChatCommandSchema, UpdateChatMessageCommandSchema } from '@immersion/contracts/chats';
import { ApiProblemSchema } from '@immersion/contracts/common';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';
import { ChatMessageNotFoundError, ChatNotFoundError } from '../../application/append-chat-messages.js';
import { createChat } from '../../application/create-chat.js';
import { getChatSession } from '../../application/get-chat-session.js';
import { listChats } from '../../application/list-chats.js';
import { truncateChatMessages } from '../../application/truncate-chat-messages.js';
import {
  InvalidChatGenerationSettingsError,
  updateChatGenerationSettings,
} from '../../application/update-chat-generation-settings.js';
import { updateChatMessage } from '../../application/update-chat-message.js';

const ChatRouteParamsSchema = z.object({
  chatId: ChatIdSchema,
});

const ChatMessageRouteParamsSchema = z.object({
  chatId: ChatIdSchema,
  messageIndex: z.coerce.number().int().positive(),
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
  app.get('/', async (_request, reply) => {
    try {
      return await listChats();
    } catch (error) {
      _request.log.error({ err: error }, 'Failed to list generic chats');
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
};
