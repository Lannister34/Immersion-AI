export interface ComposerKeystroke {
  key: string;
  shiftKey: boolean;
}

export function isSendKeystroke(keystroke: ComposerKeystroke, isTouchOnly: boolean): boolean {
  return keystroke.key === 'Enter' && !keystroke.shiftKey && !isTouchOnly;
}
