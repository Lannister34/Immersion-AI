import type {
  ChatAttachmentMimeType,
  ChatMessageDto,
  ChatSessionDto,
  ChatSummaryDto,
} from '@immersion/contracts/chats';
import type { VisionSupport } from '@immersion/contracts/generation';
import type { ProviderSettingsSnapshot, ProviderType } from '@immersion/contracts/providers';
import type { RuntimeOverviewResponse } from '@immersion/contracts/runtime';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';

import type {
  ChatPromptContext,
  ChatReplyGenerationPlan,
  GenerationSettingsSource,
  ResolveChatReplyGenerationPlanInput,
  ResolvedChatGenerationSettings,
} from '../../prompting/index.js';
import type { ChatCompletionClient, ChatCompletionEndpoint } from './chat-completion-client.js';

export interface ProviderEndpointResolver {
  resolveGenerationProviderEndpoint(): Promise<ChatCompletionEndpoint>;
}

export interface ProviderSettingsReader {
  getProviderSettings(): Promise<ProviderSettingsSnapshot>;
}

export type { GenerationSettingsSource };

export interface ChatAttachmentReference {
  id: string;
  mimeType: ChatAttachmentMimeType;
}

export interface ChatMessageAppend {
  attachments?: ChatAttachmentReference[];
  content: string;
  createdAt: string;
  reasoning?: string | null;
  role: 'assistant' | 'user';
}

export interface AssistantMessageContinuation {
  continuation: string;
  expectedContentPrefix: string;
  expectedMessageIndex: number;
  updatedAt: string;
}

export interface ChatMessagesTruncation {
  chatId: string;
  expectedRemovedMessages?: ReadonlyArray<Pick<ChatMessageDto, 'content' | 'role'>>;
  fromIndex: number;
  now: () => Date;
}

export interface ChatTitleUpdate {
  chatId: string;
  expectedCurrentTitle?: string;
  now: () => Date;
  title: string;
}

export interface ChatSessionPort {
  appendAssistantMessageContinuation(chatId: string, input: AssistantMessageContinuation): Promise<ChatSessionDto>;
  appendChatMessages(
    chatId: string,
    messages: ChatMessageAppend[],
    options?: { requireEmptyTranscript?: boolean },
  ): Promise<ChatSessionDto>;
  getChatSession(chatId: string): Promise<ChatSessionDto | null>;
  readChatAttachmentDataUrl(chatId: string, attachmentId: string): Promise<string | null>;
  resolveChatAttachments(chatId: string, attachmentIds: readonly string[]): Promise<ChatAttachmentReference[]>;
  truncateChatMessages(input: ChatMessagesTruncation): Promise<ChatSessionDto>;
  updateChatTitle(input: ChatTitleUpdate): Promise<ChatSummaryDto>;
}

export interface PromptPlanPort {
  loadChatPromptContext(session: ChatSessionDto): Promise<ChatPromptContext>;
  resolveChatGenerationSettings(
    settings: SettingsOverviewResponse,
    modelName: string | null,
    chatGenerationSettings: ChatSessionDto['generationSettings'],
  ): ResolvedChatGenerationSettings;
  resolveChatReplyGenerationPlan(input: ResolveChatReplyGenerationPlanInput): Promise<ChatReplyGenerationPlan>;
}

export interface RunningRuntimeTarget {
  baseUrl: string;
  model: string | null;
  visionProjectorPath: string | null;
}

export interface RuntimeEndpointSource {
  getRunningRuntimeEndpoint(): Promise<RunningRuntimeTarget | null>;
  getRuntimeOverview(): Promise<RuntimeOverviewResponse>;
}

export interface VisionSupportQuery {
  baseUrl: string;
  model: string | null;
  provider: ProviderType;
}

export interface VisionSupportProbe {
  getVisionSupport(query: VisionSupportQuery): Promise<VisionSupport>;
}

export interface DraftGenerationDependencies {
  readonly chatCompletionClient: ChatCompletionClient;
  readonly providers: ProviderEndpointResolver;
  readonly settings: GenerationSettingsSource;
}

export interface GenerationOptions {
  readonly signal?: AbortSignal;
}
