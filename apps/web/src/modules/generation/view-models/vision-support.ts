import type { VisionSupport } from '@immersion/contracts/generation';

export interface VisionSupportViewModel {
  /** Можно ли прикреплять картинки: при «не определено» решает пользователь. */
  allowsImages: boolean;
  hint: string;
  label: string;
  tone: 'muted' | 'ok';
}

const VISION_SUPPORT_VIEW: Record<VisionSupport, VisionSupportViewModel> = {
  supported: {
    allowsImages: true,
    hint: 'Модель принимает изображения — их можно прикреплять к сообщению.',
    label: 'Изображения: да',
    tone: 'ok',
  },
  unknown: {
    allowsImages: true,
    hint: 'Сервер не сообщает о поддержке изображений. Прикрепить можно, но модель может их не понять.',
    label: 'Изображения: не определено',
    tone: 'muted',
  },
  unsupported: {
    allowsImages: false,
    hint: 'Загруженная модель работает только с текстом.',
    label: 'Изображения: нет',
    tone: 'muted',
  },
};

export function describeVisionSupport(support: VisionSupport | undefined): VisionSupportViewModel {
  return VISION_SUPPORT_VIEW[support ?? 'unknown'];
}
