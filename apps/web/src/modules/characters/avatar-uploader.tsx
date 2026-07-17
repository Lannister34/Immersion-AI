import { CharacterAvatarMimeTypeSchema, type CharacterDetailDto } from '@immersion/contracts/characters';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';

import { createApiUrl } from '../../shared/api/client';
import { getApiErrorMessage } from '../../shared/api/get-api-error-message';
import { readFileAsBase64 } from '../../shared/lib/read-file-as-base64';
import { TrashIcon } from '../../shared/ui/icons';
import { deleteCharacterAvatar, uploadCharacterAvatar } from './api/character-avatar';
import { characterDetailQueryKey } from './queries/character-detail-query';
import { characterListQueryKey } from './queries/character-list-query';

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

interface CharacterAvatarUploaderProps {
  characterId: string | null;
  detail: CharacterDetailDto | null;
}

interface AvatarBoxProps {
  backgroundUrl: string | null;
}

function AvatarBox({ backgroundUrl }: AvatarBoxProps) {
  return (
    <div
      style={{
        aspectRatio: '1 / 1',
        borderRadius: 12,
        background: backgroundUrl ? `center / cover no-repeat url("${backgroundUrl}")` : 'var(--surface-2)',
        border: '1px solid var(--hairline)',
      }}
    />
  );
}

export function CharacterAvatarUploader({ characterId, detail }: CharacterAvatarUploaderProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setDragActive] = useState(false);
  // Аватар меняется без изменения updatedAt карточки, поэтому кэш картинки ломаем локальным счётчиком.
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [pickError, setPickError] = useState<string | null>(null);

  const invalidateCharacter = async () => {
    setAvatarVersion((current) => current + 1);
    if (characterId) {
      await queryClient.invalidateQueries({ queryKey: characterDetailQueryKey(characterId) });
    }
    await queryClient.invalidateQueries({ queryKey: characterListQueryKey });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!characterId) {
        throw new Error('Character is not saved yet.');
      }
      const mimeType = CharacterAvatarMimeTypeSchema.parse(file.type);
      const contentBase64 = await readFileAsBase64(file);
      return uploadCharacterAvatar(characterId, { contentBase64, mimeType });
    },
    onSuccess: invalidateCharacter,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!characterId) {
        throw new Error('Character is not saved yet.');
      }
      await deleteCharacterAvatar(characterId);
    },
    onSuccess: invalidateCharacter,
  });

  const busy = uploadMutation.isPending || deleteMutation.isPending;

  const submitFile = (file: File) => {
    setPickError(null);
    if (!CharacterAvatarMimeTypeSchema.safeParse(file.type).success) {
      setPickError('Поддерживаются только PNG, JPEG и WebP.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setPickError('Файл больше 8 МБ.');
      return;
    }
    uploadMutation.mutate(file);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) submitFile(file);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (busy) return;
    const file = event.dataTransfer.files[0];
    if (file) submitFile(file);
  };

  const avatarSrc = detail?.avatarUrl
    ? `${createApiUrl(detail.avatarUrl)}?v=${encodeURIComponent(`${detail.updatedAt}-${avatarVersion}`)}`
    : null;

  if (!characterId) {
    return (
      <>
        <AvatarBox backgroundUrl={null} />
        <div className="muted" style={{ fontSize: 'var(--fz-2xs)', marginTop: 8 }}>
          Сначала сохраните карточку — затем можно будет загрузить аватар.
        </div>
      </>
    );
  }

  if (!detail || detail.source === 'png') {
    return (
      <>
        <AvatarBox backgroundUrl={avatarSrc} />
        <div className="muted" style={{ fontSize: 'var(--fz-2xs)', marginTop: 8 }}>
          {detail ? 'Аватар — это сама PNG-карточка, отдельный файл не загружается.' : 'Загружаем карточку…'}
        </div>
      </>
    );
  }

  const uploadError = uploadMutation.error
    ? getApiErrorMessage(uploadMutation.error, 'Не удалось загрузить аватар.')
    : null;
  const deleteError = deleteMutation.error
    ? getApiErrorMessage(deleteMutation.error, 'Не удалось удалить аватар.')
    : null;
  const errorMessage = pickError ?? uploadError ?? deleteError;

  return (
    <>
      <button
        aria-label="Загрузить аватар"
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: 0,
          aspectRatio: '1 / 1',
          borderRadius: 12,
          background: avatarSrc ? `center / cover no-repeat url("${avatarSrc}")` : 'var(--surface-2)',
          border: isDragActive ? '1px dashed var(--accent)' : '1px solid var(--hairline)',
          cursor: busy ? 'progress' : 'pointer',
        }}
        title="Нажмите или перетащите файл (PNG, JPEG или WebP, до 8 МБ)"
        type="button"
      >
        {uploadMutation.isPending ? <span className="muted">Загружаем…</span> : null}
        {!uploadMutation.isPending && !avatarSrc ? <span className="muted">Выбрать файл</span> : null}
      </button>
      <input
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
      <div className="muted" style={{ fontSize: 'var(--fz-2xs)', marginTop: 8 }}>
        Нажмите на квадрат или перетащите файл — PNG, JPEG или WebP до 8 МБ.
      </div>
      {detail.avatarUrl ? (
        <button
          className="btn btn--xs"
          disabled={busy}
          onClick={() => deleteMutation.mutate()}
          style={{ marginTop: 8 }}
          type="button"
        >
          <TrashIcon size={12} /> {deleteMutation.isPending ? 'Удаляем…' : 'Удалить аватар'}
        </button>
      ) : null}
      {errorMessage ? (
        <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)', marginTop: 8 }}>{errorMessage}</div>
      ) : null}
    </>
  );
}
