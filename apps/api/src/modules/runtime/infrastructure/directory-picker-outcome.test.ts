import { describe, expect, it } from 'vitest';

import { classifyPickerFailure, isCancelOutput } from './directory-picker-outcome.js';

describe('classifyPickerFailure', () => {
  it('reads an osascript exit 1 as a cancel only when AppleScript ends with error -128, the user-canceled code', () => {
    expect(classifyPickerFailure('osascript', { code: 1, stderr: 'execution error: User canceled. (-128)\n' })).toBe(
      'cancel',
    );
    expect(classifyPickerFailure('osascript', { code: 1, stderr: 'execution error: Can’t make file. (-1700)' })).toBe(
      'failure',
    );
    expect(
      classifyPickerFailure('osascript', { code: 1, stderr: 'execution error: No folder "a (-128) b". (-43)' }),
    ).toBe('failure');
  });

  it('reads a zenity exit 1 as a cancel, even when GTK prints a harmless message on the way out', () => {
    expect(classifyPickerFailure('zenity', { code: 1, stderr: '' })).toBe('cancel');
    expect(
      classifyPickerFailure('zenity', { code: 1, stderr: 'Gtk-Message: GtkDialog mapped without a transient parent' }),
    ).toBe('cancel');
  });

  it('reads zenity without a display as unsupported in both wordings, since GTK 4 says it differently from GTK 3', () => {
    expect(classifyPickerFailure('zenity', { code: 1, stderr: 'Gtk-WARNING **: cannot open display: :0' })).toBe(
      'unsupported',
    );
    expect(
      classifyPickerFailure('zenity', { code: 1, stderr: 'Gtk-WARNING **: 12:00:00: Failed to open display' }),
    ).toBe('unsupported');
  });

  it('reads any other exit as a failure, never as a cancel', () => {
    expect(classifyPickerFailure('zenity', { code: 255, stderr: '' })).toBe('failure');
    expect(classifyPickerFailure('osascript', { code: 1, stderr: '' })).toBe('failure');
    expect(classifyPickerFailure('powershell', { code: 1, stderr: '' })).toBe('failure');
  });

  it('reads a dialog tool that is not installed as unsupported', () => {
    expect(classifyPickerFailure('zenity', { code: 'ENOENT', stderr: '' })).toBe('unsupported');
    expect(classifyPickerFailure('powershell', { code: 'ENOENT', stderr: '' })).toBe('unsupported');
  });
});

describe('isCancelOutput', () => {
  it('reads empty output as a cancel only for the Windows dialog, which prints nothing when closed', () => {
    expect(isCancelOutput('powershell', '\r\n')).toBe(true);
    expect(isCancelOutput('powershell', 'D:\\models\r\n')).toBe(false);
    expect(isCancelOutput('zenity', '')).toBe(false);
    expect(isCancelOutput('osascript', '')).toBe(false);
  });
});
