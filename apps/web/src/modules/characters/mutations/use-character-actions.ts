import type { CharacterSummaryDto } from '@immersion/contracts/characters';
import type { CreateChatResponse } from '@immersion/contracts/chats';
import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { createChat } from '../../chats/api/create-chat';
import { chatListQueryKey } from '../../chats/queries/chat-list-query';
import { useDeleteCharacter } from './use-delete-character';

export interface CharacterActions {
  confirmDelete: boolean;
  deleteMutation: UseMutationResult<void, Error, void>;
  handleAskDelete: () => void;
  handleCancelDelete: () => void;
  handleConfirmDelete: () => void;
  handleStartChat: () => void;
  startChatMutation: UseMutationResult<CreateChatResponse, Error, void>;
}

export function useCharacterActions(character: CharacterSummaryDto): CharacterActions {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startChatMutation = useMutation({
    mutationFn: () => createChat({ characterId: character.id }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
    },
  });
  const deleteMutation = useDeleteCharacter(character.id, {
    onSuccess: () => {
      setConfirmDelete(false);
    },
  });

  return {
    confirmDelete,
    deleteMutation,
    handleAskDelete: () => setConfirmDelete(true),
    handleCancelDelete: () => setConfirmDelete(false),
    handleConfirmDelete: () => deleteMutation.mutate(),
    handleStartChat: () => startChatMutation.mutate(),
    startChatMutation,
  };
}
