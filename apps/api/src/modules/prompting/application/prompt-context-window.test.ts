import { describe, expect, it } from 'vitest';

import { resolvePromptContextWindow } from './prompt-context-window.js';

describe('resolvePromptContextWindow', () => {
  it("takes the running server's context and reports a larger preset context as pending", () => {
    expect(resolvePromptContextWindow(48_000, 32_256)).toEqual({
      pendingSize: 48_000,
      size: 32_256,
      source: 'runtime',
    });
  });

  it("takes the running server's context and reports a smaller preset context as pending, since the window is the server's", () => {
    expect(resolvePromptContextWindow(4096, 32_768)).toEqual({ pendingSize: 4096, size: 32_768, source: 'runtime' });
  });

  it('reports nothing pending when the preset context is the one the server runs', () => {
    expect(resolvePromptContextWindow(8192, 8192)).toEqual({ pendingSize: null, size: 8192, source: 'runtime' });
  });

  it("takes the server's context when the preset sets none, with nothing pending", () => {
    expect(resolvePromptContextWindow(0, 8192)).toEqual({ pendingSize: null, size: 8192, source: 'runtime' });
  });

  it("keeps the preset's window when the provider's context is unknown, as for a cloud provider", () => {
    expect(resolvePromptContextWindow(32_256, null)).toEqual({ pendingSize: null, size: 32_256, source: 'preset' });
    expect(resolvePromptContextWindow(0, null)).toEqual({ pendingSize: null, size: 0, source: 'preset' });
  });
});
