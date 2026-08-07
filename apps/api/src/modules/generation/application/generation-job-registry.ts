import type { ChatSessionDto } from '@immersion/contracts/chats';
import type {
  GenerationJobDto,
  GenerationJobEvent,
  GenerationJobId,
  StartChatReplyGenerationCommand,
} from '@immersion/contracts/generation';

export type GenerationJobEventSubscriber = (event: GenerationJobEvent) => void;

export interface ChatReplyGenerationJobRunnerInput {
  /** Публикует кусок ответа подписчикам задачи. */
  publishDelta: (delta: string) => void;
  signal: AbortSignal;
}

export interface CreateChatReplyGenerationJobInput {
  chatId: string;
  command: StartChatReplyGenerationCommand;
}

export interface GenerationJobRegistry {
  cancel(jobId: GenerationJobId): GenerationJobDto | null;
  createChatReplyJob(input: CreateChatReplyGenerationJobInput): GenerationJobDto;
  fail(jobId: GenerationJobId, error: unknown): GenerationJobDto | null;
  get(jobId: GenerationJobId): GenerationJobDto | null;
  list(input?: { chatId?: string }): GenerationJobDto[];
  runChatReplyJob(
    jobId: GenerationJobId,
    runner: (input: ChatReplyGenerationJobRunnerInput) => Promise<ChatSessionDto>,
  ): void;
  subscribe(jobId: GenerationJobId, subscriber: GenerationJobEventSubscriber): () => void;
}

export class ActiveGenerationJobExistsError extends Error {
  constructor(
    readonly chatId: string,
    readonly job: GenerationJobDto,
  ) {
    super(`An active generation job already exists for chat ${chatId}.`);
    this.name = 'ActiveGenerationJobExistsError';
  }
}
