import { type DragEvent, useState } from 'react';

export interface FileDropZoneHandlers {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

export interface FileDropZone {
  handlers: FileDropZoneHandlers;
  isDraggingFiles: boolean;
}

function carriesFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

function leavesZone(event: DragEvent<HTMLElement>): boolean {
  const next = event.relatedTarget;
  return !(next instanceof Node && event.currentTarget.contains(next));
}

export function useFileDropZone(onDropFiles: (files: File[]) => void): FileDropZone {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  return {
    handlers: {
      onDragEnter: (event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setIsDraggingFiles(true);
      },
      onDragLeave: (event) => {
        if (leavesZone(event)) {
          setIsDraggingFiles(false);
        }
      },
      onDragOver: (event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      },
      onDrop: (event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setIsDraggingFiles(false);
        onDropFiles(Array.from(event.dataTransfer.files));
      },
    },
    isDraggingFiles,
  };
}
