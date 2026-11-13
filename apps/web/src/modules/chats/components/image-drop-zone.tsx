import type { CSSProperties, ReactNode } from 'react';

import { useFileDropZone } from '../../../shared/lib/use-file-drop-zone';
import { planImageDrop } from '../view-models/image-drop';

export interface ImageDropZoneProps {
  canAttachImages: boolean;
  children: ReactNode;
  onAttachFiles: (files: readonly File[]) => void;
  onNotice: (notice: string | null) => void;
  style?: CSSProperties;
  unavailableReason: string;
}

export function ImageDropZone({
  canAttachImages,
  children,
  onAttachFiles,
  onNotice,
  style,
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
      className="image-drop-zone"
      data-dragging={dropZone.isDraggingFiles ? 'true' : 'false'}
      style={style}
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
