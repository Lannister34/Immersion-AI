import { isImageFile } from './is-image-file';

export const NON_IMAGE_FILES_SKIPPED = 'Прикрепить можно только изображения — остальные файлы пропущены.';

export interface ImageDropInput {
  canAttachImages: boolean;
  files: readonly File[];
  unavailableReason: string;
}

export interface ImageDropPlan {
  images: File[];
  notice: string | null;
}

export function planImageDrop({ canAttachImages, files, unavailableReason }: ImageDropInput): ImageDropPlan {
  const images = files.filter(isImageFile);

  if (images.length > 0 && !canAttachImages) {
    return { images: [], notice: unavailableReason };
  }

  return { images, notice: images.length < files.length ? NON_IMAGE_FILES_SKIPPED : null };
}
