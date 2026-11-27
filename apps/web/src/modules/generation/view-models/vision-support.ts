import type { VisionSupport } from '@immersion/contracts/generation';

export interface VisionSupportViewModel {
  allowsImages: boolean;
  hint: string;
  label: string;
  tone: 'muted' | 'ok';
}

export type VisionSupportState = VisionSupport | 'model-not-ready';

const VISION_SUPPORT_VIEW: Record<VisionSupportState, VisionSupportViewModel> = {
  'model-not-ready': {
    allowsImages: true,
    hint: 'Модель ещё не готова. Изображения можно прикрепить сейчас, а отправить — когда модель запустится.',
    label: 'Изображения: модель не готова',
    tone: 'muted',
  },
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

export function describeVisionSupport(support: VisionSupportState | undefined): VisionSupportViewModel {
  return VISION_SUPPORT_VIEW[support ?? 'unknown'];
}
