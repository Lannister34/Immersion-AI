export type PickerTool = 'osascript' | 'powershell' | 'zenity';

export interface PickerFailure {
  code: number | string | undefined;
  stderr: string;
}

export type PickerFailureVerdict = 'cancel' | 'failure' | 'unsupported';

const APPLESCRIPT_USER_CANCELED = /\(-128\)\s*$/u;
const GTK_DISPLAY_UNAVAILABLE = [/cannot open display/u, /Failed to open display/u];

const classifyToolFailure: Record<PickerTool, (failure: PickerFailure) => PickerFailureVerdict> = {
  osascript: (failure) => (failure.code === 1 && APPLESCRIPT_USER_CANCELED.test(failure.stderr) ? 'cancel' : 'failure'),
  powershell: () => 'failure',
  zenity: (failure) => {
    if (GTK_DISPLAY_UNAVAILABLE.some((pattern) => pattern.test(failure.stderr))) {
      return 'unsupported';
    }

    return failure.code === 1 ? 'cancel' : 'failure';
  },
};

const emptyOutputMeansCancel: Record<PickerTool, boolean> = {
  osascript: false,
  powershell: true,
  zenity: false,
};

export function classifyPickerFailure(tool: PickerTool, failure: PickerFailure): PickerFailureVerdict {
  return failure.code === 'ENOENT' ? 'unsupported' : classifyToolFailure[tool](failure);
}

export function isCancelOutput(tool: PickerTool, output: string): boolean {
  return output.trim() === '' && emptyOutputMeansCancel[tool];
}
