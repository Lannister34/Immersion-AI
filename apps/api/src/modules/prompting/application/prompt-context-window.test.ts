import { describe, expect, it } from 'vitest';

import { resolvePromptContextWindow } from './prompt-context-window.js';

describe('resolvePromptContextWindow', () => {
  it("takes the provider's context when the preset asks for more than the server was started with", () => {
    expect(resolvePromptContextWindow(32_256, 8192)).toEqual({ size: 8192, source: 'runtime' });
  });

  it("takes the provider's context when the preset leaves the window unlimited", () => {
    expect(resolvePromptContextWindow(0, 8192)).toEqual({ size: 8192, source: 'runtime' });
  });

  it("keeps the preset's window when it fits the provider's context", () => {
    expect(resolvePromptContextWindow(8192, 8192)).toEqual({ size: 8192, source: 'preset' });
    expect(resolvePromptContextWindow(4096, 32_768)).toEqual({ size: 4096, source: 'preset' });
  });

  it("keeps the preset's window when the provider's context is unknown", () => {
    expect(resolvePromptContextWindow(32_256, null)).toEqual({ size: 32_256, source: 'preset' });
    expect(resolvePromptContextWindow(0, null)).toEqual({ size: 0, source: 'preset' });
  });
});
