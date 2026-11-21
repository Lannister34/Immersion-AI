import { describe, expect, it } from 'vitest';

import { toPendingRuntimeContext } from './pending-runtime-context';

describe('toPendingRuntimeContext', () => {
  it('describes a chat context the running model does not have yet', () => {
    expect(toPendingRuntimeContext({ pendingSize: 48_000, size: 32_256, source: 'runtime' }, true, false)).toEqual({
      isGenerating: true,
      isPreviewFetching: false,
      pendingContextSize: 48_000,
      runningContextSize: 32_256,
    });
  });

  it('describes nothing when the model runs the chat context, or for a cloud provider, or before the preview loads', () => {
    expect(toPendingRuntimeContext({ pendingSize: null, size: 48_000, source: 'runtime' }, false, false)).toBeNull();
    expect(toPendingRuntimeContext({ pendingSize: null, size: 48_000, source: 'preset' }, false, false)).toBeNull();
    expect(toPendingRuntimeContext(undefined, false, false)).toBeNull();
  });
});
