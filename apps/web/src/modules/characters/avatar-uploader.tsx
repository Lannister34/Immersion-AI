import { CharacterAvatarMimeTypeSchema, type CharacterDetailDto } from '@immersion/contracts/characters';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from 'react';

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
  /** Файл, выбранный до того, как карточка появилась на сервере. */
  pendingFile: File | null;
  onPendingFileChange: (file: File | null) => void;
}

export function CharacterAvatarUploader({
  characterId,
  detail,
  onPendingFileChange,
  pendingFile,
}: CharacterAvatarUploaderProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setDragActive] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Предпросмотр несохранённого файла живёт в blob-URL: его нужно отпустить,
  // иначе выбранные подряд картинки останутся висеть в памяти вкладки.
  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const invalidateCharacter = async () => {
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

  const isUnsaved = characterId === null;
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
    // Пока карточки нет, отправлять некуда: держим файл до сохранения.
    if (isUnsaved) {
      onPendingFileChange(file);
      return;
    }
    uploadMutation.mutate(file);
  };

  const submitFileRef = useRef(submitFile);
  submitFileRef.current = submitFile;

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

  useEffect(() => {
    const submitPastedImage = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((candidate) =>
        candidate.type.startsWith('image/'),
      );

      if (file) {
        event.preventDefault();
        submitFileRef.current(file);
      }
    };

    document.addEventListener('paste', submitPastedImage);

    return () => document.removeEventListener('paste', submitPastedImage);
  }, []);

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (busy) return;
    const file = event.dataTransfer.files[0];
    if (file) submitFile(file);
  };

  // avatarUrl уже содержит серверную версию (?v=mtime), отдельный кэш-бастинг не нужен.
  const savedAvatarSrc = detail?.avatarUrl ? createApiUrl(detail.avatarUrl) : null;
  const avatarSrc = isUnsaved ? previewUrl : savedAvatarSrc;

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
        {isUnsaved && pendingFile
          ? 'Аватар загрузится вместе с карточкой.'
          : 'Нажмите на квадрат, перетащите файл или вставьте из буфера — PNG, JPEG или WebP до 8 МБ.'}
      </div>
      {isUnsaved && pendingFile ? (
        <button
          className="btn btn--xs"
          onClick={() => onPendingFileChange(null)}
          style={{ marginTop: 8 }}
          type="button"
        >
          <TrashIcon size={12} /> Убрать
        </button>
      ) : null}
      {!isUnsaved && detail?.avatarUrl ? (
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
