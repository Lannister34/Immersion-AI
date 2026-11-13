import type { LorebookDetailDto, LorebookEntryDto, LorebookSummaryDto } from '@immersion/contracts/lorebooks';

export interface LorebookFields {
  entries: LorebookEntryDto[];
  name: string;
  tags: string[];
}

export interface LorebookStore {
  listLorebooks(): Promise<LorebookSummaryDto[]>;
  readLorebookDetail(id: string): Promise<LorebookDetailDto | null>;
  createLorebook(fields: LorebookFields, savedAt: string): Promise<LorebookDetailDto>;
  writeLorebook(id: string, fields: LorebookFields, savedAt: string): Promise<LorebookDetailDto>;
  deleteLorebook(id: string): Promise<boolean>;
}
