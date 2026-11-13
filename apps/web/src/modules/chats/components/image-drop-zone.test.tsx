import { createEvent, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test-support/render-with-providers';
import { NON_IMAGE_FILES_SKIPPED } from '../view-models/image-drop';
import { ImageDropZone, type ImageDropZoneProps } from './image-drop-zone';

const DROP_HINT = 'Отпустите, чтобы прикрепить изображения';
const UNAVAILABLE = 'Загруженная модель работает только с текстом.';

function file(name: string, type: string): File {
  return new File(['x'], name, { type });
}

function fileTransfer(files: File[]) {
  return { dataTransfer: { dropEffect: 'none', files, types: ['Files'] } };
}

function dragLeave(element: Element, transfer: ReturnType<typeof fileTransfer>, relatedTarget: Node | null): void {
  const event = createEvent.dragLeave(element, transfer);
  Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
  fireEvent(element, event);
}

async function renderZone(props: Partial<ImageDropZoneProps> = {}) {
  const onAttachFiles = vi.fn<ImageDropZoneProps['onAttachFiles']>();
  const onNotice = vi.fn<ImageDropZoneProps['onNotice']>();
  await renderWithProviders(
    <ImageDropZone
      canAttachImages
      onAttachFiles={onAttachFiles}
      onNotice={onNotice}
      unavailableReason={UNAVAILABLE}
      {...props}
    >
      <p>Держим курс на маяк.</p>
      <textarea aria-label="Сообщение" />
    </ImageDropZone>,
  );
  return { onAttachFiles, onNotice, transcript: screen.getByText('Держим курс на маяк.') };
}

describe('ImageDropZone', () => {
  it('highlights the zone while files are dragged over it and clears when they leave', async () => {
    const { transcript } = await renderZone();
    const composer = screen.getByLabelText('Сообщение');
    const files = fileTransfer([file('маяк.png', 'image/png')]);

    fireEvent.dragEnter(transcript, files);
    fireEvent.dragEnter(composer, files);
    dragLeave(transcript, files, composer);
    expect(screen.getByText(DROP_HINT)).toBeTruthy();

    dragLeave(composer, files, document.body);
    expect(screen.queryByText(DROP_HINT)).toBeNull();
  });

  it('clears the highlight when the drag leaves the window from an element that was replaced meanwhile', async () => {
    const { transcript } = await renderZone();
    const files = fileTransfer([file('маяк.png', 'image/png')]);
    const streamedLine = document.createElement('span');
    transcript.append(streamedLine);

    fireEvent.dragEnter(streamedLine, files);
    streamedLine.remove();
    fireEvent.dragEnter(transcript, files);
    dragLeave(transcript, files, null);

    expect(screen.queryByText(DROP_HINT)).toBeNull();
  });

  it('does not react to a drag that carries no files', async () => {
    const { transcript } = await renderZone();

    fireEvent.dragEnter(transcript, { dataTransfer: { files: [], types: ['text/plain'] } });

    expect(screen.queryByText(DROP_HINT)).toBeNull();
  });

  it('hands dropped images to the attach path and removes the highlight', async () => {
    const { onAttachFiles, onNotice, transcript } = await renderZone();
    const images = [file('маяк.png', 'image/png'), file('шхуна.jpg', 'image/jpeg')];

    fireEvent.dragEnter(transcript, fileTransfer(images));
    fireEvent.drop(transcript, fileTransfer(images));

    expect(onAttachFiles).toHaveBeenCalledExactlyOnceWith(images);
    expect(onNotice).toHaveBeenCalledExactlyOnceWith(null);
    expect(screen.queryByText(DROP_HINT)).toBeNull();
  });

  it('accepts a drop on the composer as well as on the transcript', async () => {
    const { onAttachFiles } = await renderZone();
    const image = file('маяк.webp', 'image/webp');

    fireEvent.drop(screen.getByLabelText('Сообщение'), fileTransfer([image]));

    expect(onAttachFiles).toHaveBeenCalledExactlyOnceWith([image]);
  });

  it('ignores dropped files that are not images and says so', async () => {
    const { onAttachFiles, onNotice, transcript } = await renderZone();
    const image = file('маяк.png', 'image/png');

    fireEvent.drop(transcript, fileTransfer([file('лоция.pdf', 'application/pdf'), image]));

    expect(onAttachFiles).toHaveBeenCalledExactlyOnceWith([image]);
    expect(onNotice).toHaveBeenCalledExactlyOnceWith(NON_IMAGE_FILES_SKIPPED);
  });

  it('keeps the browser from opening a dropped file', async () => {
    const { transcript } = await renderZone();
    const drop = fileTransfer([file('лоция.pdf', 'application/pdf')]);

    expect(fireEvent.dragOver(transcript, drop)).toBe(false);
    expect(fireEvent.drop(transcript, drop)).toBe(false);
  });

  it('attaches nothing and shows why while images cannot be attached', async () => {
    const { onAttachFiles, onNotice, transcript } = await renderZone({ canAttachImages: false });
    const files = fileTransfer([file('маяк.png', 'image/png')]);

    fireEvent.dragEnter(transcript, files);
    expect(screen.getByText(UNAVAILABLE)).toBeTruthy();

    fireEvent.drop(transcript, files);
    expect(onAttachFiles).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledExactlyOnceWith(UNAVAILABLE);
  });
});
