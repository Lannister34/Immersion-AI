import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import type { ChatSummaryRecord } from './chat-records.js';

export interface ChatFileStatRecord {
  chatId: string;
  fileMtimeMs: number;
  fileSize: number;
}

export interface ChatSearchTextRecord {
  characterNameLower: string | null;
  messageTextsLower: string[];
  titleLower: string;
}

export interface ChatSummaryWithSearchText {
  searchText: ChatSearchTextRecord;
  summary: ChatSummaryRecord;
}

/**
 * Дешёвый листинг файлов чатов (readdir + stat, без чтения содержимого).
 * Публичная точка входа для перестраиваемых read-моделей (модуль indexing):
 * по mtime/size они решают, какие файлы нужно перечитать.
 */
export async function listChatFileStats(): Promise<ChatFileStatRecord[]> {
  return new FileChatRepository().listChatFileStats();
}

/**
 * Полный разбор одного файла чата в сводку списка плюс текст для поиска
 * (те же правила JSONL-разбора, что и у канонического чтения сессии).
 * Возвращает null для несуществующего чата и бросает ошибку для битого файла —
 * решение об исключении чата из выдачи принимает вызывающая read-модель.
 */
export async function readChatSummaryWithSearchText(chatId: string): Promise<ChatSummaryWithSearchText | null> {
  return new FileChatRepository().readChatSummaryWithSearchText(chatId);
}
