import { pluralRu } from '../../../shared/lib/plural';

export function characterChatsLabel(count: number): string {
  return pluralRu(count, ['чат', 'чата', 'чатов']);
}
