import type { ReactNode } from 'react';

import { useFileDropZone } from '../../../shared/lib/use-file-drop-zone';
import { planImageDrop } from '../view-models/image-drop';

export interface ImageDropZoneProps {
  canAttachImages: boolean;
  children: ReactNode;
  className?: string;
  onAttachFiles: (files: readonly File[]) => void;
  onNotice: (notice: string | null) => void;
  unavailableReason: string;
}

export function ImageDropZone({
  canAttachImages,
  children,
  className,
  onAttachFiles,
  onNotice,
  unavailableReason,
}: ImageDropZoneProps) {
  const dropZone = useFileDropZone((files) => {
    const plan = planImageDrop({ canAttachImages, files, unavailableReason });
    if (plan.images.length > 0) {
      onAttachFiles(plan.images);
    }
    onNotice(plan.notice);
  });

  return (
    <div
      {...dropZone.handlers}
      className={className ? `image-drop-zone ${className}` : 'image-drop-zone'}
      data-dragging={dropZone.isDraggingFiles ? 'true' : 'false'}
    >
      {children}
      {dropZone.isDraggingFiles ? (
        <div aria-hidden="true" className="image-drop-zone__overlay">
          {canAttachImages ? 'Отпустите, чтобы прикрепить изображения' : unavailableReason}
        </div>
      ) : null}
    </div>
  );
}
